import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { UserPlus } from "lucide-react";
import { api } from "../api.js";
import { PageTitle, LoadingState, ErrorState, Label } from "../components/UI.jsx";
import { statusLabelKey, fraudTypes } from "../api.js";

const colors = ["#315efb", "#6a82f5", "#44a47c", "#e7aa4f", "#e17767", "#8898ad", "#a38ae8"];
const identifierKeys = { TRANSACTION_ID: "transactionType", UPI_ID: "upiType", PHONE: "phoneType", URL: "urlType", ACCOUNT: "accountTypeLabel" };

export default function Analytics() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [officer, setOfficer] = useState({ name: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const data = useQuery({ queryKey: ["analytics"], queryFn: () => api("/admin/analytics") });
  const officers = useQuery({ queryKey: ["officers"], queryFn: () => api("/admin/officers") });
  const create = useMutation({
    mutationFn: () => api("/admin/officers", { method: "POST", body: JSON.stringify(officer) }),
    onSuccess: () => { setOfficer({ name: "", phone: "", email: "" }); setError(""); client.invalidateQueries({ queryKey: ["officers"] }); },
    onError: (reason) => setError(reason.message),
  });
  if (data.isLoading) return <LoadingState />;
  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const stats = data.data;
  const typeData = (stats.byFraudType || []).map((item) => ({ name: t(fraudTypes.find((type) => type.id === item.fraudType)?.label || "other"), value: item.count }));
  const statusData = (stats.byStatus || []).map((item) => ({ name: t(statusLabelKey[item.status]), value: item.count }));
  const trendData = (stats.monthlyTrend || []).map((item) => ({ ...item, month: new Date(`${item.month}-01T00:00:00`).toLocaleDateString(i18n.language, { month: "short" }) }));
  return <div>
    <PageTitle eyebrow="ADMINISTRATOR" title={t("analyticsTitle")} description="A high-level view of reports and workload. Use this information for service planning, not as a measure of individual outcomes." />
    <div className="metric-grid">
      <div className="metric-card"><small>{t("totalComplaintsLabel")}</small><strong>{stats.totalComplaints ?? 0}</strong><span>{t("allRecordedCasesLabel")}</span></div>
      <div className="metric-card"><small>{t("openComplaintsLabel")}</small><strong>{stats.openComplaints ?? 0}</strong><span>{t("awaitingOutcomeLabel")}</span></div>
      <div className="metric-card"><small>{t("avgResolution")}</small><strong>{stats.averageResolutionDays == null ? "—" : `${stats.averageResolutionDays} ${t("resolutionDays")}`}</strong><span>{t("resolvedOnlyLabel")}</span></div>
      <div className="metric-card"><small>{t("officers")}</small><strong>{officers.data?.length ?? "—"}</strong><span>{t("activeOfficersLabel")}</span></div>
    </div>
    <div className="chart-grid">
      <section className="panel chart-panel"><h3>{t("byType")}</h3><p>{t("allComplaintsByType")}</p><div style={{ width: "100%", height: 245, marginTop: 16 }}><ResponsiveContainer><BarChart data={typeData} margin={{ top: 5, right: 12, left: -18, bottom: 5 }}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9, fill: "#8290a1" }} interval={0} angle={-15} textAnchor="end" height={55} /><YAxis tick={{ fontSize: 9, fill: "#8290a1" }} allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#315efb" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
      <section className="panel chart-panel"><h3>{t("byStatus")}</h3><p>{t("currentStatusDistribution")}</p><div style={{ width: "100%", height: 245, marginTop: 16 }}><ResponsiveContainer><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={88} paddingAngle={3}>{statusData.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{statusData.map((item, index) => <span className="status-pill gray" key={item.name}><i className="status-dot" style={{ color: colors[index % colors.length] }} />{item.name}: {item.value}</span>)}</div></section>
      <section className="panel chart-panel"><h3>{t("monthly")}</h3><p>{t("reportsLastSixMonths")}</p><div style={{ width: "100%", height: 245, marginTop: 16 }}><ResponsiveContainer><BarChart data={trendData} margin={{ top: 5, right: 12, left: -18, bottom: 5 }}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 9, fill: "#8290a1" }} /><YAxis tick={{ fontSize: 9, fill: "#8290a1" }} allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#47a37c" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
      <section className="panel chart-panel"><h3>{t("repeated")}</h3><p>{t("linkedMoreThanOnce")}</p><div className="table-wrap" style={{ marginTop: 15 }}><table className="data-table"><thead><tr><th>{t("identifier")}</th><th>{t("fraudType")}</th><th>{t("report")}</th></tr></thead><tbody>{(stats.topIdentifiers || []).map((item) => <tr key={`${item.type}-${item.value}`}><td>{item.value}</td><td>{t(identifierKeys[item.type] || "accountTypeLabel")}</td><td>{item.count}</td></tr>)}</tbody></table>{!stats.topIdentifiers?.length && <p className="auth-small">{t("noRepeatedIdentifiers")}</p>}</div></section>
    </div>
    <section className="panel officers-panel">
      <div className="section-heading"><div><h2>{t("officers")}</h2><p>{t("officerPhoneOtp")}</p></div></div>
      {officers.isError && <ErrorState error={officers.error} onRetry={() => officers.refetch()} />}
      {officers.isLoading ? <LoadingState /> : (officers.data || []).map((person) => <div className="officer-row" key={person.id}><span className="avatar">{(person.name || "O").slice(0, 1)}</span><div><strong>{person.name || t("officerDesk")}</strong><small>{person.phone} · {person.email || t("noEmail")}</small></div><span className="status-pill green">{t("statusActive")}</span></div>)}
      <form className="form-grid" style={{ borderTop: "1px solid #edf0f5", marginTop: 14, paddingTop: 17 }} onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <div className="field"><Label htmlFor="officer-name">{t("name")}</Label><input className="input" id="officer-name" value={officer.name} onChange={(event) => setOfficer({ ...officer, name: event.target.value })} required maxLength={100} /></div>
        <div className="field"><Label htmlFor="officer-phone">{t("phone")}</Label><input className="input" id="officer-phone" type="tel" value={officer.phone} onChange={(event) => setOfficer({ ...officer, phone: event.target.value })} required minLength={10} maxLength={16} /></div>
        <div className="field"><Label htmlFor="officer-email">{t("email")} · optional</Label><input className="input" id="officer-email" type="email" value={officer.email} onChange={(event) => setOfficer({ ...officer, email: event.target.value })} maxLength={200} /></div>
        <div className="field" style={{ alignSelf: "end" }}><button className="button" disabled={create.isPending}><UserPlus size={15} />{create.isPending ? t("loading") : t("createOfficer")}</button></div>
        {error && <div className="error-banner" role="alert">{error}</div>}
      </form>
    </section>
  </div>;
}
