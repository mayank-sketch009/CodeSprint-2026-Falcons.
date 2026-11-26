import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileSearch, Plus, Search } from "lucide-react";
import { api, formatDate, formatMoney, statusLabelKey } from "../api.js";
import { PageTitle, StatusPill, LoadingState, ErrorState, EmptyState } from "../components/UI.jsx";

export default function Complaints() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const complaints = useQuery({ queryKey: ["complaints"], queryFn: () => api("/complaints") });
  const items = complaints.data?.items || complaints.data || [];
  const filtered = useMemo(() => items.filter((item) => (!status || item.status === status) && `${item.caseId} ${item.summary} ${item.fraudType}`.toLowerCase().includes(query.toLowerCase())), [items, status, query]);
  return <div>
    <PageTitle eyebrow={t("complaints")} title={t("complaintsTitle")} description={t("caseDescription")} action={<Link className="button" to="/report"><Plus size={16} />{t("report")}</Link>} />
    <div className="filter-row">
      <label className="search-wrap"><Search size={16} /><input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} /></label>
      <select className="select" aria-label={t("allStatuses")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("allStatuses")}</option>{Object.keys(statusLabelKey).map((value) => <option value={value} key={value}>{t(statusLabelKey[value])}</option>)}</select>
    </div>
    {complaints.isLoading ? <LoadingState /> : complaints.isError ? <ErrorState error={complaints.error} onRetry={() => complaints.refetch()} /> : filtered.length ? <section className="panel table-wrap"><table className="data-table"><thead><tr><th>{t("caseId")}</th><th>{t("fraudType")}</th><th>{t("date")}</th><th>{t("incidentAmount")}</th><th>{t("status")}</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><Link className="case-link" to={`/complaints/${item.id}`}>{item.caseId}</Link><span className="case-summary">{item.summary}</span></td><td className="fraud-name">{item.fraudType.replaceAll("_", " ")}</td><td>{formatDate(item.createdAt)}</td><td>{formatMoney(item.amount)}</td><td><StatusPill status={item.status} /></td></tr>)}</tbody></table></section> : <section className="panel"><EmptyState title={query || status ? t("noResults") : t("noComplaints")} text={query || status ? t("noMatchesHelp") : t("noComplaintsText")} icon={FileSearch} action={!query && !status ? <Link className="button button-small" to="/report">{t("reportNow")}</Link> : null} /></section>}
  </div>;
}
