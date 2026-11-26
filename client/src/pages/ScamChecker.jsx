import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Link2, ShieldCheck } from "lucide-react";
import { api } from "../api.js";
import { PageTitle, Label } from "../components/UI.jsx";

export default function ScamChecker() {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const check = useMutation({ mutationFn: () => api("/tools/scam-check", { method: "POST", body: JSON.stringify({ text, language: i18n.language }) }) });
  const labels = { LOW: t("riskLow"), MEDIUM: t("riskMedium"), HIGH: t("riskHigh") };
  const reasonKeys = { urgency: "suspiciousUrgency", credentials: "suspiciousCredentials", shortened_link: "suspiciousShortLink", risky_tld: "suspiciousTld", lookalike_domain: "suspiciousLookalike", insecure_link: "insecureLink" };
  return <div>
    <PageTitle eyebrow={t("safetyTool")} title={t("checkerTitle")} description={t("checkerText")} />
    <div className="tool-layout">
      <section className="panel panel-pad">
        <div className="field"><Label htmlFor="scam-text">{t("pasteHere")}</Label><textarea id="scam-text" className="textarea" rows={6} maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} placeholder={t("scamPlaceholder")} /></div>
        <button className="button" disabled={check.isPending || text.trim().length < 4} onClick={() => check.mutate()}><Link2 size={15} />{check.isPending ? t("loading") : t("checkNow")}</button>
        {check.isError && <div className="error-banner" role="alert" style={{ marginTop: 14 }}>{check.error.message}</div>}
        {check.data && <div className={`risk-result ${check.data.risk.toLowerCase()}`} role="status"><h3>{check.data.risk === "HIGH" ? <AlertTriangle size={17} /> : check.data.risk === "LOW" ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />} {labels[check.data.risk]}</h3><p>{check.data.explanation || check.data.summary}</p>{check.data.reasonCodes?.length > 0 && <ul>{check.data.reasonCodes.map((reason) => <li key={reason}>{t(reasonKeys[reason])}</li>)}</ul>}</div>}
      </section>
      <aside className="panel tip-card"><span className="tip-icon"><ShieldCheck size={19} /></span><h3>{t("pauseBeforeTap")}</h3><p>{t("scamSafetyAdvice")}</p><div className="disclaimer" style={{ marginTop: 17 }}><AlertTriangle size={14} /><span>{t("scamLimitations")}</span></div><a className="button button-outline" href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer" style={{ marginTop: 15 }}>{t("officialPortalShort")}</a></aside>
    </div>
  </div>;
}
