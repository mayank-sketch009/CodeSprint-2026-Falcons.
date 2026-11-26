import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getIdentifiers } from "./lib.js";

const complaints = new Map();
const notifications = new Map();
const identifiers = new Map();
const dataFile = fileURLToPath(new URL("../.local-dev-data.json", import.meta.url));
let sequence = 0;

function persist() {
  const temporaryFile = `${dataFile}.tmp`;
  const contents = JSON.stringify({
    complaints: [...complaints.values()],
    notifications: [...notifications.values()],
    sequence,
  });
  fs.writeFileSync(temporaryFile, contents, { mode: 0o600 });
  fs.renameSync(temporaryFile, dataFile);
}

function restoreDate(value) {
  return value ? new Date(value) : null;
}

function restore() {
  let contents;
  try {
    contents = fs.readFileSync(dataFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const saved = JSON.parse(contents);
  sequence = Number(saved.sequence) || 0;
  for (const complaint of saved.complaints || []) {
    complaint.createdAt = restoreDate(complaint.createdAt);
    complaint.updatedAt = restoreDate(complaint.updatedAt);
    complaint.incidentAt = restoreDate(complaint.incidentAt);
    complaint.resolvedAt = restoreDate(complaint.resolvedAt);
    complaint.history = (complaint.history || []).map((entry) => ({ ...entry, createdAt: restoreDate(entry.createdAt) }));
    complaint.evidence = (complaint.evidence || []).map((entry) => ({ ...entry, createdAt: restoreDate(entry.createdAt) }));
    complaints.set(complaint.id, complaint);
    linkIdentifiers(complaint, false);
  }
  for (const notification of saved.notifications || []) {
    notification.createdAt = restoreDate(notification.createdAt);
    notification.readAt = restoreDate(notification.readAt);
    notifications.set(notification.id, notification);
  }
}

export function isDevFallback() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export function createDevComplaint({ userId, fraudType, summary, amount, incidentAt, details }) {
  const year = new Date().getFullYear();
  const now = new Date();
  const yearPrefix = `FRT-${year}-`;
  sequence = Math.max(sequence, ...[...complaints.values()]
    .filter((item) => item.caseId.startsWith(yearPrefix))
    .map((item) => Number(item.caseId.slice(yearPrefix.length)) || 0)) + 1;
  const complaint = {
    id: `dev-case-${randomUUID()}`,
    caseId: `FRT-${year}-${String(sequence).padStart(6, "0")}`,
    userId,
    fraudType,
    summary,
    amount,
    incidentAt,
    details,
    status: "SUBMITTED",
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    evidence: [],
    suspectLinks: [],
    history: [{ id: `dev-history-${randomUUID()}`, status: "SUBMITTED", note: "Your report was received.", visibleToVictim: true, changedById: userId, createdAt: now }],
  };
  complaints.set(complaint.id, complaint);
  linkIdentifiers(complaint, false);
  persist();
  return complaint;
}

function linkIdentifiers(complaint, persistChanges = true) {
  complaint.suspectLinks = getIdentifiers(complaint.details).map((identifier) => {
    const key = `${identifier.type}:${identifier.normalized}`;
    if (!identifiers.has(key)) identifiers.set(key, new Set());
    identifiers.get(key).add(complaint.id);
    return { identifierId: key, identifier };
  });
  if (persistChanges) persist();
}

export function findDevDuplicates(userId, input) {
  const matches = new Map();
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const identifier of getIdentifiers(input.details || {})) {
    const key = `${identifier.type}:${identifier.normalized}`;
    for (const id of identifiers.get(key) || []) {
      const complaint = complaints.get(id);
      if (!complaint || complaint.userId !== userId) continue;
      if (identifier.type !== "TRANSACTION_ID" && complaint.createdAt.getTime() < since) continue;
      matches.set(id, { id, caseId: complaint.caseId, summary: complaint.summary, status: complaint.status, createdAt: complaint.createdAt, matchReason: identifier.type.toLowerCase().replaceAll("_", " ") });
    }
  }
  const amount = input.amount === null || input.amount === undefined || input.amount === "" ? null : Number(input.amount);
  const incidentAt = input.incidentAt ? new Date(input.incidentAt) : null;
  if (amount !== null && Number.isFinite(amount) && incidentAt && Number.isFinite(incidentAt.getTime())) {
    const rangeStart = incidentAt.getTime() - 3 * 86_400_000;
    const rangeEnd = incidentAt.getTime() + 3 * 86_400_000;
    for (const complaint of complaints.values()) {
      if (complaint.userId !== userId || complaint.fraudType !== input.fraudType || !complaint.incidentAt) continue;
      const previousAmount = Number(complaint.amount);
      const previousDate = new Date(complaint.incidentAt).getTime();
      if (Math.abs(previousAmount - amount) <= Math.max(amount * 0.1, 100) && previousDate >= rangeStart && previousDate <= rangeEnd) {
        matches.set(complaint.id, { id: complaint.id, caseId: complaint.caseId, summary: complaint.summary, status: complaint.status, createdAt: complaint.createdAt, matchReason: "similar amount and date" });
      }
    }
  }
  return [...matches.values()];
}

export function listDevComplaints(userId) {
  return [...complaints.values()]
    .filter((complaint) => complaint.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ id, caseId, fraudType, summary, amount, status, createdAt, updatedAt }) => ({ id, caseId, fraudType, summary, amount, status, createdAt, updatedAt }));
}

export function getDevComplaint(id) {
  return complaints.get(id) || null;
}

export function getDevEvidence(evidenceId, user) {
  for (const complaint of complaints.values()) {
    if (complaint.userId !== user.sub && !["OFFICER", "ADMIN"].includes(user.role)) continue;
    const evidence = complaint.evidence.find((item) => item.id === evidenceId);
    if (evidence) return { evidence, complaint };
  }
  return null;
}

export function addDevDetails(id, details, note, changedById) {
  const complaint = complaints.get(id);
  if (!complaint) return null;
  complaint.details = { ...complaint.details, ...details };
  complaint.updatedAt = new Date();
  linkIdentifiers(complaint, false);
  complaint.history.push({ id: `dev-history-${randomUUID()}`, status: complaint.status, note, visibleToVictim: true, changedById, createdAt: complaint.updatedAt });
  persist();
  return complaint;
}

export function addDevEvidence(id, file, userId) {
  const complaint = complaints.get(id);
  if (!complaint) return null;
  const evidence = {
    id: `dev-evidence-${randomUUID()}`,
    complaintId: id,
    originalName: file.originalName,
    storedName: file.storedName,
    mimeType: file.mimeType,
    size: file.size,
    storagePath: file.storagePath,
    uploadedById: userId,
    createdAt: new Date(),
  };
  complaint.evidence.push(evidence);
  complaint.updatedAt = new Date();
  persist();
  return evidence;
}

export function addDevNotification(userId, complaintId, title, message) {
  const item = { id: `dev-notification-${randomUUID()}`, userId, complaintId, title, message, readAt: null, createdAt: new Date() };
  notifications.set(item.id, item);
  persist();
  return item;
}

export function listDevNotifications(userId) {
  return [...notifications.values()].filter((item) => item.userId === userId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
}

export function markDevNotificationRead(id, userId) {
  const item = notifications.get(id);
  if (!item || item.userId !== userId) return null;
  item.readAt ||= new Date();
  persist();
  return item;
}

restore();
