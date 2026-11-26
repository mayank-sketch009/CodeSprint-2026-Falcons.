import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowRight, BadgeCheck, Bell, BriefcaseBusiness, Check, ChevronRight, CircleHelp, FileSearch, Landmark, Link2, LockKeyhole, QrCode, ShieldAlert, ShieldCheck, ShoppingBag, Users } from "lucide-react";
import { api, formatDate, formatMoney, fraudTypes } from "../api.js";
import { useAuth } from "../context.jsx";
import { PageTitle, StatusPill, LoadingState, ErrorState } from "../components/UI.jsx";

const icons = { QrCode, ShoppingBag, Link2, Users, BriefcaseBusiness, Landmark, CircleHelp };

function HeroArtwork() {
  const { t } = useTranslation();
  return <div className="hero-art" aria-hidden="true">
    <div className="art-card">
      <div className="art-card-head"><div className="art-logo"><span><ShieldCheck size={15} /></span>{t("whatHappensNext")}</div><span className="art-label">{t("threeSteps")}</span></div>
      <div className="art-steps">
        <div className="art-step"><span className="art-step-icon"><FileSearch size={13} /></span><span className="art-step-copy"><b>{t("stepOne")}</b><small>{t("stepOneDescription")}</small></span><time>01</time></div>
        <div className="art-step"><span className="art-step-icon"><ShieldCheck size={13} /></span><span className="art-step-copy"><b>{t("stepTwo")}</b><small>{t("stepTwoDescription")}</small></span><time>02</time></div>
        <div className="art-step"><span className="art-step-icon"><Bell size={13} /></span><span className="art-step-copy"><b>{t("stepThree")}</b><small>{t("stepThreeDescription")}</small></span><time>03</time></div>
      </div>
    </div>
  </div>;
}

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const cases = useQuery({ queryKey: ["complaints", "home"], queryFn: () => api("/complaints"), enabled: Boolean(user) });
  const list = cases.data?.items || cases.data || [];
  const openCount = list.filter((item) => !["RESOLVED", "CLOSED", "REJECTED"].includes(item.status)).length;
  const attentionCount = list.filter((item) => item.status === "EVIDENCE_REQUESTED").length;
  const completedCount = list.filter((item) => ["RESOLVED", "CLOSED"].includes(item.status)).length;
  const recentCases = list.slice(0, 4);
  const displayName = user?.name?.trim().split(/\s+/)[0] || t("citizen");
  const categories = [
    { ...fraudTypes[0], icon: QrCode }, { ...fraudTypes[1], icon: ShoppingBag },
    { ...fraudTypes[2], icon: Link2 }, { ...fraudTypes[3], icon: Users },
    { ...fraudTypes[4], icon: BriefcaseBusiness }, { ...fraudTypes[5], icon: Landmark },
  ];
  if (user) return <div className="dashboard-home">
    <section className="dashboard-welcome">
      <div><div className="eyebrow">{t("citizenDashboard")}</div><h1>{t("dashboardWelcome", { name: displayName })}</h1><p>{t("dashboardDescription")}</p></div>
      <Link className="button" to="/report"><ArrowRight size={16} />{t("reportNow")}</Link>
    </section>
    <section className="urgent-banner dashboard-alert">
      <div className="urgent-copy"><span className="urgent-icon"><ShieldAlert size={19} /></span><div><strong>{t("urgentTitle")}</strong><p>{t("urgentText")}</p></div></div>
      <a className="button" href="tel:1930"><span>{t("call1930")}</span><ArrowRight size={15} /></a>
    </section>
    <section className="metric-grid dashboard-metrics">
      <div className="metric-card"><small>{t("activeCases")}</small><strong>{cases.isLoading ? "—" : openCount}</strong><span>{t("metricAcrossReports")}</span></div>
      <div className={`metric-card ${attentionCount ? "metric-attention" : ""}`}><small>{t("actionNeeded")}</small><strong>{cases.isLoading ? "—" : attentionCount}</strong><span>{t("evidenceRequests")}</span></div>
      <div className="metric-card"><small>{t("resolvedCases")}</small><strong>{cases.isLoading ? "—" : completedCount}</strong><span>{t("metricCompleted")}</span></div>
      <div className="metric-card"><small>{t("totalComplaints")}</small><strong>{cases.isLoading ? "—" : list.length}</strong><span>{t("metricSaved")}</span></div>
    </section>
    <section className="dashboard-grid">
      <div className="panel dashboard-cases">
        <div className="section-heading"><div><h2>{t("recentCases")}</h2><p>{t("latestActivity")}</p></div><Link className="text-button" to="/complaints">{t("viewAll")} <ChevronRight size={14} /></Link></div>
        {cases.isLoading ? <LoadingState /> : cases.isError ? <ErrorState error={cases.error} onRetry={() => cases.refetch()} /> : recentCases.length === 0
          ? <div className="dashboard-empty"><span className="empty-icon"><FileSearch size={22} /></span><strong>{t("noComplaints")}</strong><p>{t("noComplaintsText")}</p><Link className="button button-small" to="/report">{t("reportNow")}</Link></div>
          : <div className="dashboard-case-list">{recentCases.map((item) => <Link className="dashboard-case" to={`/complaints/${item.id}`} key={item.id}>
            <span className="dashboard-case-icon"><FileSearch size={17} /></span>
            <span className="dashboard-case-main"><span className="dashboard-case-ref">{item.caseId} <StatusPill status={item.status} /></span><strong>{item.summary}</strong><small>{item.fraudType.replaceAll("_", " ")} · {formatDate(item.updatedAt || item.createdAt)}</small></span>
            <span className="dashboard-case-amount">{formatMoney(item.amount)}<ChevronRight size={15} /></span>
          </Link>)}</div>}
      </div>
      <aside className="dashboard-side">
        <section className="panel safety-card"><span className="safety-card-icon"><LockKeyhole size={19} /></span><h2>{t("evidenceCardTitle")}</h2><p>{t("evidenceCardText")}</p><ul className="evidence-tips">
          <li><Check size={14} />{t("evidenceTipOne")}</li>
          <li><Check size={14} />{t("evidenceTipTwo")}</li>
          <li><Check size={14} />{t("evidenceTipThree")}</li>
        </ul><a className="safety-link" href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer">{t("officialPortalShort")} <ArrowRight size={13} /></a></section>
        <section className="panel dashboard-note"><AlertCircle size={16} /><p>{t("officialNotice")}</p></section>
      </aside>
    </section>
    <section className="dashboard-categories">
      <div className="section-heading"><div><h2>{t("categories")}</h2><p>{t("categoryPrompt")}</p></div></div>
      <div className="category-grid">{categories.map(({ id, label, icon: Icon }) => <Link className="category-card" to={`/report?type=${id}`} key={id}><span className="category-icon"><Icon size={16} /></span><span>{t(label)}</span></Link>)}</div>
    </section>
  </div>;

  return <div>
    <section className="hero-grid">
      <div className="urgent-banner">
        <div className="urgent-copy"><span className="urgent-icon"><ShieldAlert size={19} /></span><div><strong>{t("urgentTitle")}</strong><p>{t("urgentText")}</p></div></div>
        <a className="button" href="tel:1930"><span>{t("call1930")}</span><ArrowRight size={15} /></a>
      </div>
      <div className="hero-copy">
        <div className="hero-kicker"><span className="online-dot" />{t("welcome")}</div>
        <h1>{t("heroTitle")}</h1>
        <p>{t("heroText")}</p>
        <div className="hero-actions"><Link className="button" to={user ? "/report" : "/login"}>{t("reportNow")}<ArrowRight size={16} /></Link><Link className="button button-outline" to={user ? "/complaints" : "/login"}><FileSearch size={16} />{t("trackCase")}</Link></div>
        <div className="hero-trust"><span><LockKeyhole size={13} />{t("privacyNote").split(".")[0]}</span><span><BadgeCheck size={13} />{t("plainGuidance")}</span></div>
      </div>
      <HeroArtwork />
    </section>

    <section>
      <div className="section-heading"><div><h2>{t("categories")}</h2><p>{t("categoryPrompt")}</p></div></div>
      <div className="category-grid">{categories.map(({ id, label, icon: Icon }) => <Link className="category-card" to={user ? `/report?type=${id}` : "/login"} key={id}><span className="category-icon"><Icon size={16} /></span><span>{t(label)}</span></Link>)}</div>
    </section>

    <section className="steps-band">
      {[["1", t("stepOne"), t("stepOneDescription")], ["2", t("stepTwo"), t("stepTwoDescription")], ["3", t("stepThree"), t("stepThreeDescription")]].map(([number, title, copy]) => <div className="step-card" key={number}><span className="step-num">{number}</span><div><strong>{title}</strong><p>{copy}</p></div></div>)}
    </section>

    <div className="disclaimer" style={{ marginTop: 22 }}><ShieldCheck size={16} /><span>{t("officialNotice")} <a href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer">National Cyber Crime Reporting Portal <ArrowRight size={12} /></a></span></div>
  </div>;
}
