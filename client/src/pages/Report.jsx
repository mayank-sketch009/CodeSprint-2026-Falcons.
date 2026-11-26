import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, BriefcaseBusiness, Check, CheckCircle2, CircleHelp, FileText, Landmark, Link2, LoaderCircle, QrCode, ShieldCheck, ShoppingBag, Sparkles, Trash2, UploadCloud, Users } from "lucide-react";
import { api, formatMoney, fraudTypes } from "../api.js";
import { PageTitle, Label } from "../components/UI.jsx";

const icons = { QrCode, ShoppingBag, Link2, Users, BriefcaseBusiness, Landmark, CircleHelp };
const fields = {
  UPI_QR: ["amount", "transactionId", "suspectUpi", "incidentDate", "bank"],
  FAKE_SHOPPING: ["url", "orderId", "amount", "paymentMethod", "incidentDate"],
  PHISHING: ["url", "messageText", "sender", "detailsEntered", "incidentDate"],
  SOCIAL_MEDIA: ["platform", "profileUrl", "lostDemanded", "amount", "incidentDate"],
  JOB_INVESTMENT: ["company", "contactNumber", "amount", "channel", "incidentDate"],
  ONLINE_BANKING: ["bank", "transactionId", "amount", "incidentDate", "accountType"],
  OTHER: ["amount", "incidentDate", "summary"],
};
const fieldTypes = {
  amount: "number", transactionId: "text", suspectUpi: "text", incidentDate: "datetime-local", bank: "text",
  url: "url", orderId: "text", paymentMethod: "text", messageText: "textarea", sender: "text",
  detailsEntered: "select", platform: "text", profileUrl: "url", lostDemanded: "textarea",
  company: "text", contactNumber: "tel", channel: "text", accountType: "text", summary: "textarea",
};
const checklist = {
  UPI_QR: ["paymentScreenshot", "transactionReference", "recipientConversation"],
  FAKE_SHOPPING: ["orderConfirmation", "paymentReceipt", "sellerMessages"],
  PHISHING: ["suspiciousMessageScreenshot", "senderDetails", "bankAlert"],
  SOCIAL_MEDIA: ["profileScreenshots", "paymentReceipts", "profileLink"],
  JOB_INVESTMENT: ["offerMessages", "paymentReceipts", "contactDetails"],
  ONLINE_BANKING: ["bankStatement", "transactionReference", "bankComplaintReference"],
  OTHER: ["messageEvidence", "paymentRecord", "usefulReference"],
};

function DynamicField({ field, value, onChange, t }) {
  const id = `field-${field}`;
  const type = fieldTypes[field];
  return <div className={`field ${["messageText", "lostDemanded", "summary"].includes(field) ? "full" : ""}`}>
    <Label htmlFor={id} optional={!["amount", "incidentDate", "summary"].includes(field)}>{t(field)}</Label>
    {type === "textarea" ? <textarea id={id} className="textarea" maxLength={2000} value={value || ""} onChange={(event) => onChange(field, event.target.value)} placeholder={t(field)} required={field === "summary"} />
      : type === "select" ? <select id={id} className="select" value={value || ""} onChange={(event) => onChange(field, event.target.value)}><option value="">{t("chooseOne")}</option><option value="yes">{t("yes")}</option><option value="no">{t("no")}</option><option value="unsure">{t("unsure")}</option></select>
      : <input id={id} className="input" type={type} min={field === "amount" ? "0" : undefined} step={field === "amount" ? "0.01" : undefined} max={field === "amount" ? "100000000" : undefined} maxLength={type === "text" ? 160 : undefined} value={value ?? (field === "summary" ? description : "")} onChange={(event) => onChange(field, event.target.value)} placeholder={field === "incidentDate" ? "" : t(field)} />}
  </div>;
}

export default function Report() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [type, setType] = useState(fraudTypes.some((item) => item.id === params.get("type")) ? params.get("type") : "");
  const [details, setDetails] = useState({});
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeFields = useMemo(() => [...new Set([...(fields[type] || []), "summary"])], [type]);

  function updateField(key, value) { setDetails((current) => ({ ...current, [key]: value })); setDuplicateChecked(false); }
  function chooseFiles(event) {
    const incoming = Array.from(event.target.files || []);
    const invalid = incoming.find((file) => !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalid) { setError(t("fileRejected")); event.target.value = ""; return; }
    if (files.length + incoming.length > 5) { setError(t("tooManyFiles")); event.target.value = ""; return; }
    setError("");
    setFiles((current) => [...current, ...incoming]);
    event.target.value = "";
  }
  async function suggestType() {
    if (description.trim().length < 10) { setError(t("classifierHint")); return; }
    setLoading(true); setError("");
    try { const result = await api("/tools/classify", { method: "POST", body: JSON.stringify({ description }) }); if (result.fraudType) setType(result.fraudType); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  function validateDetails() {
    if (!type) return t("typeRequired");
    if (!details.summary?.trim() && !description.trim()) return t("summaryRequired");
    if (details.amount && Number(details.amount) < 0) return t("amountInvalid");
    return "";
  }
  async function checkDuplicates() {
    setLoading(true); setError("");
    try {
      const result = await api("/complaints/check-duplicates", { method: "POST", body: JSON.stringify({ fraudType: type, details, amount: details.amount || null, incidentAt: details.incidentDate || null }) });
      setDuplicates(result.matches || []); setDuplicateChecked(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  async function submitAfterDuplicateCheck() {
    if (duplicateChecked) {
      if (duplicates.length === 0) await submit(null);
      return;
    }
    setLoading(true); setError("");
    try {
      const result = await api("/complaints/check-duplicates", { method: "POST", body: JSON.stringify({ fraudType: type, details, amount: details.amount || null, incidentAt: details.incidentDate || null }) });
      const matches = result.matches || [];
      setDuplicates(matches);
      setDuplicateChecked(true);
      if (matches.length === 0) await submit(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  async function uploadEvidence(complaintId) {
    for (const file of files) {
      const form = new FormData();
      form.append("files", file);
      await api(`/complaints/${complaintId}/evidence`, { method: "POST", body: form });
    }
  }
  async function submit(existingId) {
    setLoading(true); setError("");
    try {
      let result;
      if (existingId) {
        result = await api(`/complaints/${existingId}/add-details`, { method: "POST", body: JSON.stringify({ details, summary: description || details.summary || "" }) });
      } else {
        const mergedDetails = { ...details, description };
        result = await api("/complaints", { method: "POST", body: JSON.stringify({ fraudType: type, details: mergedDetails, summary: details.summary || description, amount: details.amount || null, incidentAt: details.incidentDate || null }) });
      }
      const complaint = result.complaint || result;
      if (files.length) await uploadEvidence(complaint.id);
      setSubmitted(complaint);
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (submitted) return <section className="panel success-card">
    <span className="success-icon"><CheckCircle2 size={26} /></span>
    <h1>{t("reportThankYou")}</h1>
    <p>{t("successText")}</p>
    <div className="case-ref"><small>{t("caseId")}</small><strong>{submitted.caseId}</strong></div>
    <h2>{t("nextActions")}</h2>
    <div className="action-list">
      <div className="action-row"><AlertCircle size={16} /><span><b>{t("call1930")}</b> {t("call1930Instruction")}</span></div>
      <div className="action-row"><Landmark size={16} /><span>{t("bankInstruction")}</span></div>
      {type === "PHISHING" || type === "ONLINE_BANKING" ? <div className="action-row"><ShieldCheck size={16} /><span>{t("passwordInstruction")}</span></div> : null}
      <div className="action-row"><FileText size={16} /><span>{t("evidenceInstruction")}</span></div>
    </div>
    <a className="button button-outline" href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer"> {t("officialPortal")} <ArrowRight size={14} /></a>
    <p className="auth-small">{t("officialNotice")}</p>
    <div className="wizard-actions"><Link className="button button-quiet" to={`/complaints/${submitted.id}`}>{t("trackThisCase")}</Link><button className="button" onClick={() => navigate("/complaints")}>{t("complaintsTitle")}</button></div>
  </section>;

  return <div className="wizard-wrap">
    <div className="wizard-top"><PageTitle eyebrow={t("progressLabel")} title={t("reportTitle")} description={t("wizardIntro")} /></div>
    <div className="wizard-steps" aria-label="Report steps">{[t("chooseType"), t("detailsTitle"), t("evidenceTitle"), t("reviewTitle")].map((label, index) => <div key={label} className={`wizard-step ${step === index + 1 ? "active" : ""} ${step > index + 1 ? "done" : ""}`}><span className="step-circle">{step > index + 1 ? <Check size={13} /> : index + 1}</span><span>{label}</span></div>)}</div>
    <section className="panel wizard-panel">
      {step === 1 && <>
        <h2>{t("chooseType")}</h2><p>{t("chooseClosest")}</p>
        <div className="type-grid">{fraudTypes.map(({ id, label, icon }) => { const Icon = icons[icon]; return         <button type="button" key={id} className={`type-option ${type === id ? "selected" : ""}`} onClick={() => { setType(id); setDuplicateChecked(false); setDuplicates([]); setError(""); }}><span className="category-icon"><Icon size={16} /></span>{t(label)}</button>; })}</div>
        <div className="field" style={{ marginTop: 20 }}><Label htmlFor="description">{t("describe")}</Label><textarea id="description" className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1500} placeholder={t("describeExample")} /></div>
        <button className="button button-quiet" type="button" disabled={loading || description.trim().length < 10} onClick={suggestType}><Sparkles size={15} />{loading ? t("loading") : t("suggestType")}</button>
      </>}
      {step === 2 && <>
        <h2>{t("detailsTitle")}</h2><p>{t("detailsIntro")}</p>
        <div className="form-grid">{activeFields.map((field) => <DynamicField key={field} field={field} value={details[field] ?? (field === "summary" ? description : "")} onChange={updateField} t={t} />)}</div>
        <div className="disclaimer"><ShieldCheck size={15} /><span>{t("privacyNote")}</span></div>
      </>}
      {step === 3 && <>
        <h2>{t("evidenceTitle")}</h2><p>{t("evidenceHint")}</p>
        <div className="checklist">{(checklist[type] || checklist.OTHER).map((item) => <p key={item}><CheckCircle2 size={15} />{t(item)}</p>)}</div>
        <label className="dropzone"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={chooseFiles} /><UploadCloud size={24} /><strong>{t("selectFiles")}</strong><small>{t("allowedFiles")}</small></label>
        {!!files.length && <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${index}`}><FileText size={16} color="#315efb" /><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small><button className="file-remove" aria-label={`${t("removeFile")} ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div>)}</div>}
        <p className="helper-note">{t("evidencePrivacy")}</p>
      </>}
      {step === 4 && <>
        <h2>{t("reviewTitle")}</h2><p>{t("reviewPrompt")}</p>
        <div className="review-summary">
          <div className="review-item"><small>{t("fraudType")}</small><strong>{t(fraudTypes.find((item) => item.id === type)?.label || "other")}</strong></div>
          <div className="review-item"><small>{t("amount")}</small><strong>{formatMoney(details.amount)}</strong></div>
          {activeFields.filter((field) => details[field]).map((field) => <div className="review-item" key={field}><small>{t(field)}</small><strong>{details[field]}</strong></div>)}
          {description && <div className="review-item full"><small>{t("describe")}</small><strong>{description}</strong></div>}
          <div className="review-item"><small>{t("evidenceAttached")}</small><strong>{files.length ? `${files.length} ${t("demoCount")}` : t("noneYet")}</strong></div>
        </div>
        <div className="wizard-actions" style={{ justifyContent: "flex-start" }}><button className="button button-outline" disabled={loading} onClick={checkDuplicates}><FileText size={15} />{loading ? t("loading") : t("checkDuplicates")}</button></div>
        {duplicateChecked && duplicates.length > 0 && <div className="duplicate-box"><h3>{t("possibleMatches")}</h3>{duplicates.map((match) => { const reasonKey = match.matchReason === "similar amount and date" ? "suspiciousAmountDate" : match.matchReason === "transaction id" ? "matchTransaction" : match.matchReason === "upi id" ? "matchUpi" : match.matchReason === "phone" ? "matchPhone" : "matchUrl"; return <div className="duplicate-item" key={match.id}><div><strong>{match.caseId}</strong><small>{match.summary} · {t(reasonKey)}</small></div><button className="button button-small button-quiet" onClick={() => submit(match.id)} disabled={loading}>{t("addToCase")}</button></div>; })}<p className="helper-note">{t("likelyDuplicatePrivacy")}</p></div>}
        {duplicateChecked && duplicates.length === 0 && <div className="checklist"><p><CheckCircle2 size={15} />{t("noLikelyDuplicates")}</p></div>}
        {duplicateChecked && duplicates.length > 0 && <button className="button button-outline" style={{ marginTop: 10 }} onClick={() => submit(null)} disabled={loading}>{loading ? t("loading") : t("differentIncident")}</button>}
      </>}
      {error && <div className="error-banner" role="alert" style={{ marginTop: 15 }}>{error}</div>}
      <div className="wizard-actions">
        {step > 1 ? <button className="button button-outline" onClick={() => { setError(""); setStep(step - 1); }}><ArrowLeft size={14} />{t("back")}</button> : <span />}
        {step < 4 && <button className="button" onClick={() => { const issue = step === 1 ? (!type ? t("typeRequired") : "") : step === 2 ? validateDetails() : ""; if (issue) setError(issue); else { setError(""); setStep(step + 1); } }}>{t("next")}<ArrowRight size={14} /></button>}
        {step === 4 && (!duplicateChecked || duplicates.length === 0) && <button className="button" disabled={loading} onClick={submitAfterDuplicateCheck}>{loading ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{t("submitReport")}</button>}
      </div>
    </section>
    <p className="auth-small" style={{ textAlign: "center" }}>{t("officialNotice")}</p>
  </div>;
}
