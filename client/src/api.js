const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, options = {}) {
  const token = localStorage.getItem("frt-token");
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || "Something went wrong. Please try again.",
      response.status,
      payload?.error?.code,
      payload?.error?.details,
    );
  }
  return payload?.data ?? payload;
}

export async function downloadEvidence(evidenceId, filename) {
  const token = localStorage.getItem("frt-token");
  const response = await fetch(`${API_URL}/complaints/evidence/${encodeURIComponent(evidenceId)}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error?.message || "This evidence file could not be opened.", response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "evidence";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const statusLabelKey = {
  SUBMITTED: "statusSubmitted",
  UNDER_REVIEW: "statusReview",
  EVIDENCE_REQUESTED: "statusEvidence",
  FORWARDED: "statusForwarded",
  ACTION_TAKEN: "statusAction",
  RESOLVED: "statusResolved",
  CLOSED: "statusClosed",
  REJECTED: "statusRejected",
};

export const fraudTypes = [
  { id: "UPI_QR", label: "upi", icon: "QrCode" },
  { id: "FAKE_SHOPPING", label: "shopping", icon: "ShoppingBag" },
  { id: "PHISHING", label: "phishing", icon: "Link2" },
  { id: "SOCIAL_MEDIA", label: "social", icon: "Users" },
  { id: "JOB_INVESTMENT", label: "job", icon: "BriefcaseBusiness" },
  { id: "ONLINE_BANKING", label: "banking", icon: "Landmark" },
  { id: "OTHER", label: "other", icon: "CircleHelp" },
];

export function formatDate(value, locale = "en-IN") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}
