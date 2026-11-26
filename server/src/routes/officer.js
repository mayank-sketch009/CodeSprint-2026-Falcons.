import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, cleanText, errorResponse, success } from "../lib.js";
import { authenticate, requireRoles, validate } from "../middleware.js";
import { notifyUser } from "../services/notifications.js";

const router = Router();
const statuses = ["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED", "FORWARDED", "ACTION_TAKEN", "RESOLVED", "CLOSED", "REJECTED"];
const statusSchema = z.object({
  status: z.enum(statuses),
  note: z.string().trim().min(1).max(1000),
});
const noteSchema = z.object({ note: z.string().trim().min(1).max(1000) });
const evidenceSchema = z.object({ message: z.string().trim().min(5).max(1000) });

router.use(authenticate, requireRoles("OFFICER", "ADMIN"));

router.get("/complaints", asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status && statuses.includes(String(req.query.status))) where.status = String(req.query.status);
  if (req.query.fraudType) where.fraudType = String(req.query.fraudType);
  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from && Number.isFinite(Date.parse(String(req.query.from)))) where.createdAt.gte = new Date(String(req.query.from));
    if (req.query.to && Number.isFinite(Date.parse(String(req.query.to)))) where.createdAt.lte = new Date(String(req.query.to));
  }
  if (req.query.minAmount || req.query.maxAmount) {
    where.amount = {};
    if (req.query.minAmount && Number.isFinite(Number(req.query.minAmount))) where.amount.gte = Number(req.query.minAmount);
    if (req.query.maxAmount && Number.isFinite(Number(req.query.maxAmount))) where.amount.lte = Number(req.query.maxAmount);
  }
  const complaints = await prisma.complaint.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
    include: {
      user: { select: { id: true, phone: true, name: true } },
      evidence: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true } },
      history: { orderBy: { createdAt: "desc" }, take: 3 },
      suspectLinks: { include: { identifier: { select: { id: true, type: true, value: true } } } },
    },
  });
  const identifierIds = [...new Set(complaints.flatMap((item) => item.suspectLinks.map((link) => link.identifierId)))];
  const related = identifierIds.length ? await prisma.complaintSuspectLink.findMany({
    where: { identifierId: { in: identifierIds }, complaintId: { notIn: complaints.map((item) => item.id) } },
    include: { complaint: { select: { id: true, caseId: true, summary: true, status: true } } },
  }) : [];
  const relatedByIdentifier = new Map();
  for (const link of related) relatedByIdentifier.set(link.identifierId, [...(relatedByIdentifier.get(link.identifierId) || []), link.complaint]);
  const items = complaints.map((item) => ({
    ...item,
    suspectLinks: item.suspectLinks.map((link) => ({ ...link, relatedCases: relatedByIdentifier.get(link.identifierId) || [] })),
  }));
  success(res, { items });
}));

router.patch("/complaints/:id/status", validate(statusSchema), asyncHandler(async (req, res) => {
  const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id }, select: { id: true, caseId: true, userId: true } });
  if (!complaint) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
  const note = cleanText(req.body.note);
  const resolvedAt = ["RESOLVED", "CLOSED"].includes(req.body.status) ? new Date() : null;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.complaint.update({
      where: { id: complaint.id },
      data: { status: req.body.status, rejectionReason: req.body.status === "REJECTED" ? note : null, resolvedAt },
    });
    await tx.statusHistory.create({ data: { complaintId: complaint.id, status: req.body.status, note, changedById: req.user.sub, visibleToVictim: true } });
    await tx.officerAuditLog.create({ data: { actorId: req.user.sub, complaintId: complaint.id, action: "STATUS_CHANGED", metadata: { status: req.body.status } } });
    return result;
  });
  await notifyUser({ userId: complaint.userId, complaintId: complaint.id, title: `Case update: ${complaint.caseId}`, message: note });
  success(res, { complaint: updated });
}));

router.post("/complaints/:id/notes", validate(noteSchema), asyncHandler(async (req, res) => {
  const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
  if (!complaint) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
  const note = cleanText(req.body.note);
  const entry = await prisma.$transaction(async (tx) => {
    const history = await tx.statusHistory.create({
      data: { complaintId: complaint.id, status: complaint.status, note, changedById: req.user.sub, visibleToVictim: true },
    });
    await tx.officerAuditLog.create({ data: { actorId: req.user.sub, complaintId: complaint.id, action: "NOTE_ADDED", metadata: { note } } });
    return history;
  });
  success(res, { note: entry }, 201);
}));

router.post("/complaints/:id/request-evidence", validate(evidenceSchema), asyncHandler(async (req, res) => {
  const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id }, select: { id: true, caseId: true, userId: true } });
  if (!complaint) throw errorResponse(404, "CASE_NOT_FOUND", "That complaint could not be found.");
  const message = cleanText(req.body.message);
  await prisma.$transaction(async (tx) => {
    await tx.complaint.update({ where: { id: complaint.id }, data: { status: "EVIDENCE_REQUESTED", resolvedAt: null } });
    await tx.statusHistory.create({ data: { complaintId: complaint.id, status: "EVIDENCE_REQUESTED", note: message, changedById: req.user.sub, visibleToVictim: true } });
    await tx.officerAuditLog.create({ data: { actorId: req.user.sub, complaintId: complaint.id, action: "EVIDENCE_REQUESTED", metadata: { message } } });
  });
  await notifyUser({ userId: complaint.userId, complaintId: complaint.id, title: `Evidence requested: ${complaint.caseId}`, message });
  success(res, { message: "Evidence request sent." }, 201);
}));

export default router;
