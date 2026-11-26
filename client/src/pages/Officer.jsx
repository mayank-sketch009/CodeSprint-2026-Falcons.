import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowRight, FileSearch, Search, UserRound } from "lucide-react";
import { api, formatDate, formatMoney, statusLabelKey, fraudTypes } from "../api.js";
import { PageTitle, StatusPill, LoadingState, ErrorState, EmptyState, Label } from "../components/UI.jsx";

const nextStatuses = ["UNDER_REVIEW", "EVIDENCE_REQUESTED", "FORWARDED", "ACTION_TAKEN", "RESOLVED", "CLOSED", "REJECTED"];

export default function Officer() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ status: "", fraudType: "", query: "" });
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("UNDER_REVIEW");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const queueParams = new URLSearchParams(Object.entries(filters).filter(([key, value]) => key !== "query" && value));
  const queue = useQuery({ queryKey: ["officer-complaints", filters], queryFn: () => api(`/officer/complaints${queueParams.size ? `?${queueParams}` : ""}`) });
  const items = queue.data?.items || queue.data || [];
  const filtered = useMemo(() => items.filter((item) => `${item.caseId} ${item.summary} ${item.fraudType} ${item.user?.phone || ""}`.toLowerCase().includes(filters.query.toLowerCase())), [items, filters.query]);
  const selected = items.find((item) => item.id === selectedId) || filtered[0] || null;
  const update = useMutation({
    mutationFn: () => api(`/officer/complaints/${selected.id}/status`, { method: "PATCH", body: JSON.stringify({ status, note }) }),
    onSuccess: () => { setError(""); setNote(""); queryClient.invalidateQueries({ queryKey: ["officer-complaints"] }); queryClient.invalidateQueries({ queryKey: ["complaint", selected?.id] }); },
    onError: (reason) => setError(reason.message),
  });
  const request = useMutation({
    mutationFn: () => api(`/officer/complaints/${selected.id}/request-evidence`, { method: "POST", body: JSON.stringify({ message: note }) }),
    onSuccess: () => { setError(""); setNote(""); queryClient.invalidateQueries({ queryKey: ["officer-complaints"] }); },
    onError: (reason) => setError(reason.message),
  });
  return <div>
    <PageTitle eyebrow={t("officerWorkspace")} title={t("officerTitle")} description={t("officerDescription")} />
    <div className="queue-controls">
      <label className="search-wrap"><Search size={16} /><input className="input" type="search" placeholder={t("queueSearch")} value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label>
      <select className="select" aria-label={t("status")} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">{t("allStatuses")}</option>{Object.keys(statusLabelKey).map((value) => <option value={value} key={value}>{t(statusLabelKey[value])}</option>)}</select>
      <select className="select" aria-label={t("fraudType")} value={filters.fraudType} onChange={(event) => setFilters({ ...filters, fraudType: event.target.value })}><option value="">{t("allFraudTypes")}</option>{fraudTypes.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select>
      <input className="input" type="date" aria-label={t("fromDate")} value={filters.from || ""} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
      <input className="input" type="date" aria-label={t("toDate")} value={filters.to || ""} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
      <input className="input" type="number" min="0" aria-label={t("minAmount")} placeholder={t("minAmountPlaceholder")} value={filters.minAmount || ""} onChange={(event) => setFilters({ ...filters, minAmount: event.target.value })} />
      <input className="input" type="number" min="0" aria-label={t("maxAmount")} placeholder={t("maxAmountPlaceholder")} value={filters.maxAmount || ""} onChange={(event) => setFilters({ ...filters, maxAmount: event.target.value })} />
    </div>
    {queue.isLoading ? <LoadingState /> : queue.isError ? <ErrorState error={queue.error} onRetry={() => queue.refetch()} /> : !filtered.length ? <section className="panel"><EmptyState title={t("noResults")} icon={FileSearch} /></section> : <div className="officer-case-layout">
      <section className="panel table-wrap"><table className="data-table"><thead><tr><th>Case</th><th>{t("fraudType")}</th><th>{t("date")}</th><th>Amount</th><th>{t("status")}</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)} style={{ cursor: "pointer", background: selected?.id === item.id ? "#f5f7ff" : undefined }}><td><span className="case-link">{item.caseId}</span><span className="case-summary">{item.summary}</span></td><td className="fraud-name">{item.fraudType.replaceAll("_", " ")}</td><td>{formatDate(item.createdAt)}</td><td>{formatMoney(item.amount)}</td><td><StatusPill status={item.status} /></td></tr>)}</tbody></table></section>
      {selected && <aside className="panel panel-pad">
        <div className="case-heading"><div><div className="eyebrow">{selected.caseId}</div><h2>{selected.summary}</h2><StatusPill status={selected.status} /></div><Link to={`/complaints/${selected.id}`} className="text-button" aria-label="Open full case"><ArrowRight size={17} /></Link></div>
        <div className="case-overview"><span><UserRound size={14} />{selected.user?.name || selected.user?.phone || t("citizen")}</span><span>{formatMoney(selected.amount)}</span></div>
        <div className="info-list">{Object.entries(selected.details || {}).filter(([, value]) => value).slice(0, 6).map(([key, value]) => <div className="info-line" key={key}><small>{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</small><strong>{String(value)}</strong></div>)}</div>
        {selected.suspectLinks?.length > 0 && <div style={{ marginTop: 16 }}><strong style={{ fontSize: 11 }}>{t("linkedCases")}</strong>{selected.suspectLinks.map((link) => <div className="note-card" key={link.identifierId}><p>{link.identifier?.type}: {link.identifier?.value}</p>{link.relatedCases?.map((caseItem) => <Link key={caseItem.id} to={`/complaints/${caseItem.id}`} className="case-link">{caseItem.caseId} · {caseItem.summary}</Link>)}</div>)}</div>}
        <div className="field" style={{ marginTop: 18 }}><Label htmlFor="officer-note">{t("note")}</Label><textarea id="officer-note" className="textarea" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder={t("queueNoteLabel")} /></div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="field"><Label htmlFor="next-status">{t("status")}</Label><select id="next-status" className="select" value={status} onChange={(event) => setStatus(event.target.value)}>{nextStatuses.map((value) => <option value={value} key={value}>{t(statusLabelKey[value])}</option>)}</select></div>
        {status === "REJECTED" && <div className="field"><Label htmlFor="reject-reason">{t("reason")}</Label><input id="reject-reason" className="input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} required /></div>}
        <button className="button" style={{ width: "100%" }} disabled={update.isPending || !note.trim()} onClick={() => update.mutate()}>{update.isPending ? t("loading") : t("saveUpdate")}</button>
        <button className="button button-outline" style={{ width: "100%", marginTop: 8 }} disabled={request.isPending || !note.trim()} onClick={() => request.mutate()}><AlertCircle size={14} />{request.isPending ? t("loading") : t("requestEvidence")}</button>
        {selected.evidence?.length > 0 && <div className="section-heading" style={{ marginTop: 17 }}><h2>{t("evidenceSection")} ({selected.evidence.length})</h2></div>}
      </aside>}
    </div>}
  </div>;
}
