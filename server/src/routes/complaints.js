import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate, requireRoles, validate } from "../middleware.js";
import { asyncHandler, cleanDetails, cleanText, createCaseId, errorResponse, getIdentifiers, sanitizeFilename, success } from "../lib.js";
import { notifyUser } from "../services/notifications.js";
import { persistEvidence, readEvidence, removeTemporaryFile } from "../services/evidenceStorage.js";
import {
  addDevDetails,
  addDevEvidence,
  addDevNotification,
  createDevComplaint,
  findDevDuplicates,
  getDevComplaint,
  getDevEvidence,
  isDevFallback,
  listDevComplaints,
} from "../devStore.js";

const router = Router();
const complaintSchema = z.object({
  fraudType: z.enum(["UPI_QR", "FAKE_SHOPPING", "PHISHING", "SOCIAL_MEDIA", "JOB_INVESTMENT", "ONLINE_BANKING", "OTHER"]),
  summary: z.string().trim().min(5).max(500),
  amount: z.union([z.number(), z.string().trim().regex(/^\d+(\.\d{1,2})?$/)]).nullable().optional(),
  incidentAt: z.string().trim().max(40).nullable().optional(),
  details: z.record(z.unknown()).default({}),
});
const duplicateSchema = complaintSchema.pick({ fraudType: true, amount: true, incidentAt: true, details: true }).partial().extend({ details: z.record(z.unknown()).default({}) });
const addDetailsSchema = z.object({ summary: z.string().trim().max(500).optional(), details: z.record(z.unknown()).default({}) });
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || "./uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 5_242_880), files: 5 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) return callback(errorResponse(400, "FILE_TYPE_NOT_ALLOWED", "Only JPG, PNG, WebP images and PDF files are allowed."));
    callback(null, true);
  },
});

function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) throw errorResponse(400, "INVALID_AMOUNT", "Enter a valid amount.");
  return amount;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw errorResponse(400, "INVALID_DATE", "Enter a valid incident date.");
  if (date.getTime() > Date.now() + 5 * 60_000) throw errorResponse(400, "INVALID_DATE", "Incident date cannot be in the future.");
  return date;
}

async function findDuplicates(userId, input) {
  const details = cleanDetails(input.details);
  const identifiers = getIdentifiers(details);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const matches = new Map();
  if (identifiers.length) {
    const transactionIds = identifiers.filter(({ type }) => type === "TRANSACTION_ID");
    const otherIdentifiers = identifiers.filter(({ type }) => type !== "TRANSACTION_ID");
    const conditions = [
      ...(transactionIds.length ? [{
        identifier: { OR: transactionIds.map(({ type, normalized }) => ({ type, normalized })) },
        complaint: { userId },
      }] : []),
      ...(otherIdentifiers.length ? [{
        identifier: { OR: otherIdentifiers.map(({ type, normalized }) => ({ type, normalized })) },
        complaint: { userId, createdAt: { gte: since } },
      }] : []),
    ];
    const links = await prisma.complaintSuspectLink.findMany({
      where: { OR: conditions },
      include: { complaint: { select: { id: true, caseId: true, summary: true, status: true, createdAt: true } }, identifier: true },
    });
    for (const link of links) {
      const current = matches.get(link.complaintId) || { ...link.complaint, matchReason: link.identifier.type.toLowerCase().replaceAll("_", " ") };
      matches.set(link.complaintId, current);
    }
  }
  const amount = parseAmount(input.amount);
  const incidentAt = parseDate(input.incidentAt);
  if (amount !== null && incidentAt) {
    const candidateDates = [new Date(incidentAt.getTime() - 3 * 86400_000), new Date(incidentAt.getTime() + 3 * 86400_000)];
    const similar = await prisma.complaint.findMany({
      where: {
        userId,
        fraudType: input.fraudType,
        amount: { gte: Math.max(0, amount * 0.9 - 100), lte: amount * 1.1 + 100 },
        incidentAt: { gte: candidateDates[0], lte: candidateDates[1] },
      },
      select: { id: true, caseId: true, summary: true, status: true, createdAt: true },
      take: 5,
    });
    for (const item of similar) matches.set(item.id, { ...item, matchReason: "similar amount and date" });
  }
  return [...matches.values()];
}

async function saveSuspectLinks(tx, complaintId, details) {
  for (const identifier of getIdentifiers(details)) {
    const record = await tx.suspectIdentifier.upsert({
      where: { type_normalized: { type: identifier.type, normalized: identifier.normalized } },
      create: identifier,
      update: { value: identifier.value },
      select: { id: true },
    });
    await tx.complaintSuspectLink.upsert({
      where: { complaintId_identifierId: { complaintId, identifierId: record.id } },
      create: { complaintId, identifierId: record.id },
      update: {},
    });
  }
}

function canAccess(complaint, user) {
  return complaint.userId === user.sub || ["OFFICER", "ADMIN"].includes(user.role);
}

async function validateFileContent(file) {
  const handle = await fs.promises.open(file.path, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const valid = file.mimetype === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : file.mimetype === "image/jpeg"
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : file.mimetype === "image/png"
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : file.mimetype === "image/webp"
            ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
            : false;
    if (!valid) throw errorResponse(400, "FILE_CONTENT_MISMATCH", "One of the selected files does not match its file type.");
  } finally { await handle.close(); }
}

router.use(authenticate);
router.post("/check-duplicates", requireRoles("VICTIM"), validate(duplicateSchema), asyncHandler(async (req, res) => {
  if (isDevFallback()) return success(res, { matches: findDevDuplicates(req.user.sub, req.body) });
  const matches = await findDuplicates(req.user.sub, req.body);
  success(res, { matches });
}));

router.post("/", requireRoles("VICTIM"), validate(complaintSchema), asyncHandler(async (req, res) => {
  const data = req.body;
  const details = cleanDetails(data.details);
  const summary = cleanText(data.summary);
  const amount = parseAmount(data.amount);
  const incidentAt = parseDate(data.incidentAt);
  if (isDevFallback()) {
    const complaint = createDevComplaint({ userId: req.user.sub, fraudType: data.fraudType, summary, amount, incidentAt, details });
    addDevNotification(req.user.sub, complaint.id, `Report received: ${complaint.caseId}`, `We received your report. Your reference is ${complaint.caseId}. Call 1930 and contact your bank immediately if money was just transferred.`);
    return success(res, { complaint }, 201);
  }
  const year = new Date().getFullYear();
  const complaint = await prisma.$transaction(async (tx) => {
    const [sequence] = await tx.$queryRaw`
      INSERT INTO "CaseSequence" ("year", "nextNumber", "updatedAt")
      VALUES (${year}, 1, NOW())
      ON CONFLICT ("year") DO UPDATE
      SET "nextNumber" = "CaseSequence"."nextNumber" + 1, "updatedAt" = NOW()
      RETURNING "nextNumber"
    `;
    const created = await tx.complaint.create({
      data: {
        caseId: createCaseId(year, sequence.nextNumber),
        userId: req.user.sub,
        fraudType: data.fraudType,
        summary,
        amount,
        incidentAt,
        details,
        history: { create: { status: "SUBMITTED", note: "Your report was received.", visibleToVictim: true } },
      },
      include: { evidence: true, history: true },
    });
    await saveSuspectLinks(tx, created.id, details);
    return created;
  });
  await notifyUser({ userId: req.user.sub, complaintId: complaint.id, title: `Report received: ${complaint.caseId}`, message: `We received your report. Your reference is ${complaint.caseId}. Call 1930 and contact your bank immediately if money was just transferred.` });
  success(res, { complaint }, 201);
}));

router.get("/", requireRoles("VICTIM"), asyncHandler(async (req, res) => {
  if (isDevFallback()) return success(res, { items: listDevComplaints(req.user.sub) });
  const items = await prisma.complaint.findMany({
    where: { userId: req.user.sub },
    orderBy: { updatedAt: "desc" },
    select: { id: true, caseId: true, fraudType: true, summary: true, amount: true, status: true, createdAt: true, updatedAt: true },
  });
  success(res, { items });
}));

router.post("/:id/add-details", requireRoles("VICTIM"), validate(addDetailsSchema), asyncHandler(async (req, res) => {
  if (isDevFallback()) {
    const complaint = getDevComplaint(req.params.id);
    if (!complaint || complaint.userId !== req.user.sub) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
    const addition = cleanDetails(req.body.details);
    const note = req.body.summary ? `Additional details were added: ${cleanText(req.body.summary)}` : "Additional details were added to this report.";
    const updated = addDevDetails(complaint.id, addition, note, req.user.sub);
    return success(res, { complaint: updated });
  }
  const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
  if (!complaint || complaint.userId !== req.user.sub) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
  const addition = cleanDetails(req.body.details);
  const merged = { ...complaint.details, ...addition };
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.complaint.update({
      where: { id: complaint.id },
      data: { details: merged },
    });
    await saveSuspectLinks(tx, complaint.id, merged);
    const note = req.body.summary ? `Additional details were added: ${cleanText(req.body.summary)}` : "Additional details were added to this report.";
    await tx.statusHistory.create({ data: { complaintId: complaint.id, status: complaint.status, note, changedById: req.user.sub } });
    return result;
  });
  success(res, { complaint: updated });
}));

router.post("/:id/evidence", requireRoles("VICTIM"), asyncHandler(async (req, res, next) => {
  if (isDevFallback()) {
    const complaint = getDevComplaint(req.params.id);
    if (!complaint || complaint.userId !== req.user.sub) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
    upload.array("files", 5)(req, res, async (uploadError) => {
      if (uploadError) return next(uploadError);
      try {
        if (!req.files?.length) throw errorResponse(400, "FILES_REQUIRED", "Choose at least one evidence file.");
        for (const file of req.files) {
          await validateFileContent(file);
          addDevEvidence(complaint.id, {
            originalName: sanitizeFilename(file.originalname),
            storedName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            storagePath: file.path,
          }, req.user.sub);
        }
        success(res, { uploaded: req.files.length }, 201);
      } catch (error) {
        for (const file of req.files || []) await removeTemporaryFile(file.path);
        next(error);
      }
    });
    return;
  }
  const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true } });
  if (!complaint || complaint.userId !== req.user.sub) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
  upload.array("files", 5)(req, res, async (uploadError) => {
    if (uploadError) return next(uploadError);
    const storagePaths = [];
    let databaseSaved = false;
    try {
      if (!req.files?.length) throw errorResponse(400, "FILES_REQUIRED", "Choose at least one evidence file.");
      const evidence = [];
      for (const file of req.files) {
        await validateFileContent(file);
        const storagePath = await persistEvidence(file);
        storagePaths.push(storagePath);
        evidence.push({
          complaintId: complaint.id,
          originalName: sanitizeFilename(file.originalname),
          storedName: file.filename,
          mimeType: file.mimetype,
          size: file.size,
          storagePath,
          uploadedById: req.user.sub,
        });
      }
      const created = await prisma.evidence.createMany({ data: evidence });
      databaseSaved = true;
      success(res, { uploaded: created.count }, 201);
    } catch (error) {
      next(error);
    } finally {
      for (const [index, file] of (req.files || []).entries()) {
        if (!databaseSaved || storagePaths[index]?.startsWith("cloudinary:")) await removeTemporaryFile(file.path);
      }
    }
  });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  if (isDevFallback()) {
    const complaint = getDevComplaint(req.params.id);
    if (!complaint || !canAccess(complaint, req.user)) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
    const history = req.user.role === "VICTIM" ? complaint.history.filter((entry) => entry.visibleToVictim) : complaint.history;
    return success(res, { complaint: { ...complaint, history, evidence: complaint.evidence.map((file) => ({ ...file, url: `/api/v1/complaints/evidence/${file.id}/file` })) } });
  }
  const complaint = await prisma.complaint.findUnique({
    where: { id: req.params.id },
    include: {
      evidence: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true } },
      history: { where: req.user.role === "VICTIM" ? { visibleToVictim: true } : undefined, orderBy: { createdAt: "asc" } },
      suspectLinks: { include: { identifier: { select: { type: true, value: true } } } },
    },
  });
  if (!complaint || !canAccess(complaint, req.user)) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
  success(res, { complaint: { ...complaint, evidence: complaint.evidence.map((file) => ({ ...file, url: `/api/v1/complaints/evidence/${file.id}/file` })) } });
}));

router.get("/evidence/:evidenceId/file", asyncHandler(async (req, res) => {
  if (isDevFallback()) {
    const result = getDevEvidence(req.params.evidenceId, req.user);
    if (!result) throw errorResponse(404, "FILE_NOT_FOUND", "That evidence file could not be found.");
    const { evidence, complaint } = result;
    res.setHeader("Content-Type", evidence.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(path.basename(evidence.originalName)).replaceAll('"', "")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    try { return res.send(await readEvidence(evidence.storagePath)); }
    catch { throw errorResponse(503, "FILE_STORAGE_UNAVAILABLE", "Evidence storage is temporarily unavailable."); }
  }
  const evidence = await prisma.evidence.findUnique({ where: { id: req.params.evidenceId }, include: { complaint: { select: { userId: true } } } });
  if (!evidence || !canAccess(evidence.complaint, req.user)) throw errorResponse(404, "FILE_NOT_FOUND", "That evidence file could not be found.");
  res.setHeader("Content-Type", evidence.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(path.basename(evidence.originalName)).replaceAll('"', "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    res.send(await readEvidence(evidence.storagePath));
  } catch (error) {
    if (error.status) throw error;
    throw errorResponse(503, "FILE_STORAGE_UNAVAILABLE", "Evidence storage is temporarily unavailable.");
  }
}));

export default router;
