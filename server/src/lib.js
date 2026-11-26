import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";

export function cleanText(value) {
  if (typeof value !== "string") return value;
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

export function cleanDetails(details = {}) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  return Object.fromEntries(Object.entries(details).map(([key, value]) => [
    key,
    typeof value === "string" ? cleanText(value).slice(0, 2000) : value,
  ]));
}

export function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, "");
}

export function normalizeIdentifier(value) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function createCaseId(year, number) {
  return `FRT-${year}-${String(number).padStart(6, "0")}`;
}

export function randomOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function success(res, data, status = 200) {
  return res.status(status).json({ data });
}

export function errorResponse(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

export function getIdentifiers(details) {
  const candidates = [
    ["TRANSACTION_ID", details.transactionId],
    ["UPI_ID", details.suspectUpi],
    ["PHONE", details.sender],
    ["PHONE", details.contactNumber],
    ["URL", details.url],
    ["URL", details.profileUrl],
  ];
  const unique = new Map();
  for (const [type, value] of candidates) {
    if (typeof value !== "string" || value.trim().length < 3) continue;
    const normalized = normalizeIdentifier(value);
    if (normalized) unique.set(`${type}:${normalized}`, { type, value: value.trim(), normalized });
  }
  return [...unique.values()];
}

export function sanitizeFilename(name) {
  return name.replace(/[^\w.-]/g, "_").slice(0, 160);
}
