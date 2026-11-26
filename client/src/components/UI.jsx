import { AlertCircle, Check, Clock3, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { statusLabelKey } from "../api.js";

export function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title-row">
    <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {action && <div className="page-title-action">{action}</div>}
  </div>;
}

export function StatusPill({ status }) {
  const { t } = useTranslation();
  const tone = ["RESOLVED", "ACTION_TAKEN"].includes(status) ? "green" : status === "REJECTED" || status === "CLOSED" ? "gray" : status === "EVIDENCE_REQUESTED" ? "amber" : "blue";
  return <span className={`status-pill ${tone}`}><span className="status-dot" />{t(statusLabelKey[status] || status || "statusSubmitted")}</span>;
}

export function LoadingState({ label }) {
  const { t } = useTranslation();
  return <div className="state-card"><LoaderCircle className="spin" size={23} /><span>{label || t("loading")}</span></div>;
}

export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  return <div className="state-card error-state"><AlertCircle size={22} /><div><strong>{t("errorTitle")}</strong><p>{error?.message || t("loadFailure")}</p>{onRetry && <button className="text-button" onClick={onRetry}>{t("retry")}</button>}</div></div>;
}

export function EmptyState({ title, text, icon: Icon = Check, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24} /></span><strong>{title}</strong>{text && <p>{text}</p>}{action}</div>;
}

export function Label({ children, htmlFor, optional = false }) {
  const { t } = useTranslation();
  return <label className="field-label" htmlFor={htmlFor}>{children}{optional && <span> · {t("optional")}</span>}</label>;
}

export function FieldError({ children }) {
  return children ? <small className="field-error">{children}</small> : null;
}

export function TimeStamp({ value }) {
  if (!value) return null;
  const date = new Date(value);
  return <span className="timestamp"><Clock3 size={13} />{date.toLocaleString()}</span>;
}
