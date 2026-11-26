import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, Landmark, UploadCloud } from "lucide-react";
import { api, downloadEvidence, formatDate, formatMoney } from "../api.js";
import { useAuth } from "../context.jsx";
import { PageTitle, StatusPill, LoadingState, ErrorState, EmptyState, TimeStamp } from "../components/UI.jsx";

const explanationKeys = {
  SUBMITTED: "reportExplanation",
  UNDER_REVIEW: "reviewExplanation",
  EVIDENCE_REQUESTED: "evidenceExplanation",
  FORWARDED: "forwardedExplanation",
  ACTION_TAKEN: "actionExplanation",
  RESOLVED: "resolvedExplanation",
  CLOSED: "closedExplanation",
  REJECTED: "rejectedExplanation",
};

export default function CaseDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef(null);
  const [error, setError] = useState("");
  const [files, setFiles] = useState([]);
  const detail = useQuery({ queryKey: ["complaint", id], queryFn: () => api(`/complaints/${id}`) });
  const upload = useMutation({
    mutationFn: async () => {
      for (const file of files) {
        const form = new FormData(); form.append("files", file);
        await api(`/complaints/${id}/evidence`, { method: "POST", body: form });
      }
    },
    onSuccess: () => { setFiles([]); setError(""); queryClient.invalidateQueries({ queryKey: ["complaint", id] }); },
    onError: (reason) => setError(reason.message),
  });
  if (detail.isLoading) return <LoadingState />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const item = detail.data?.complaint || detail.data;
  if (!item) return <section className="panel"><EmptyState title={t("complaintNotFound")} action={<Link className="button button-small" to="/complaints">{t("returnHome")}</Link>} /></section>;
  const history = item.history || [];
  const latestRequest = item.status === "EVIDENCE_REQUESTED" ? history.find((entry) => entry.status === "EVIDENCE_REQUESTED") : null;
  const description = item.details?.description || item.summary;
  function chooseFiles(event) {
    const incoming = Array.from(event.target.files || []);
    const invalid = incoming.find((file) => !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalid) { setError("Each file must be a JPG, PNG, WebP or PDF, no larger than 5 MB."); return; }
    setFiles((current) => [...current, ...incoming].slice(0, 5));
  }
  return <div>
    <PageTitle eyebrow={<Link to="/complaints" className="text-button"><ArrowLeft size={13} /> {t("complaintsTitle")}</Link>} title={item.caseId} description={item.summary} action={<StatusPill status={item.status} />} />
    {item.status === "EVIDENCE_REQUESTED" && <div className="evidence-banner"><strong><AlertCircle size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />{t("evidenceRequested")}</strong><p>{latestRequest?.note || t("evidenceRequestHint")}</p>
      {user?.role === "VICTIM" && <div><button className="button button-small button-quiet" onClick={() => fileInput.current?.click()}><UploadCloud size={14} />{t("uploadMore")}</button><input ref={fileInput} hidden type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseFiles} />{files.length > 0 && <span className="helper-note" style={{ marginLeft: 9 }}>{files.length} {t("filesSelected")}</span>}{files.length > 0 && <button className="button button-small" style={{ marginLeft: 8 }} onClick={() => upload.mutate()} disabled={upload.isPending}>{upload.isPending ? t("loading") : t("uploadMore")}</button>}</div>}
    </div>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="case-layout">
      <div>
        <section className="panel panel-pad">
          <div className="case-heading"><div><div className="eyebrow">{item.fraudType.replaceAll("_", " ")}</div><h2>{item.summary}</h2><StatusPill status={item.status} /></div></div>
          <div className="case-overview"><span><FileText size={14} />{t("caseFiled")} {formatDate(item.createdAt)}</span><span><Landmark size={14} />{t("incidentAmount")} {formatMoney(item.amount)}</span></div>
          {item.rejectionReason && <div className="error-banner">{item.rejectionReason}</div>}
          <div className="section-heading" style={{ marginTop: 21 }}><h2>{t("timeline")}</h2></div>
          <div className="timeline">
            {history.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((entry, index) => <div key={entry.id} className={`timeline-item ${entry.status === item.status ? "current" : index < history.length - 1 ? "past" : ""}`}><span className="timeline-marker" /><strong>{t({ SUBMITTED: "statusSubmitted", UNDER_REVIEW: "statusReview", EVIDENCE_REQUESTED: "statusEvidence", FORWARDED: "statusForwarded", ACTION_TAKEN: "statusAction", RESOLVED: "statusResolved", CLOSED: "statusClosed", REJECTED: "statusRejected" }[entry.status])}</strong><p>{entry.note || t(explanationKeys[entry.status] || "statusExplain")}</p><time>{new Date(entry.createdAt).toLocaleString()}</time></div>)}
            {history.length === 0 && <div className="timeline-item current"><span className="timeline-marker" /><strong>{t("statusSubmitted")}</strong><p>{t(explanationKeys.SUBMITTED)}</p><time>{new Date(item.createdAt).toLocaleString()}</time></div>}
          </div>
        </section>
        <section className="panel panel-pad" style={{ marginTop: 15 }}>
          <div className="section-heading"><div><h2>{t("officerNotes")}</h2><p>{t("caseTeamUpdates")}</p></div></div>
          {history.filter((entry) => entry.note).length ? <div className="notes-list">{history.filter((entry) => entry.note).map((entry) => <div className="note-card" key={entry.id}><p>{entry.note}</p><small>{new Date(entry.createdAt).toLocaleString()}</small></div>)}</div> : <EmptyState title={t("emptyNote")} text={t("caseNotesEmpty")} />}
        </section>
      </div>
      <aside className="panel panel-pad">
        <div className="section-heading"><h2>{t("reportDetails")}</h2></div>
        <div className="info-list">
          <div className="info-line"><small>{t("whatHappened")}</small><strong>{description || "—"}</strong></div>
          {Object.entries(item.details || {}).filter(([key, value]) => value && key !== "description" && key !== "summary").map(([key, value]) => <div className="info-line" key={key}><small>{t(key, { defaultValue: key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ") })}</small><strong>{String(value)}</strong></div>)}
          <div className="info-line"><small>{t("incidentDateLabel")}</small><strong>{formatDate(item.incidentAt)}</strong></div>
        </div>
        <div className="section-heading" style={{ marginTop: 24 }}><h2>{t("evidenceSection")}</h2><span className="status-pill gray">{item.evidence?.length || 0}</span></div>
        {item.evidence?.length ? <div className="file-list">{item.evidence.map((file) => <button className="file-row" key={file.id} onClick={() => downloadEvidence(file.id, file.originalName).catch((reason) => setError(reason.message))}><FileText size={15} color="#315efb" /><span>{file.originalName}</span><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></button>)}</div> : <p className="helper-note">{t("noEvidenceAttached")}</p>}
        <div className="disclaimer" style={{ marginTop: 20 }}><AlertCircle size={14} /><span>{t("officialNotice")} <a href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer">cybercrime.gov.in</a>.</span></div>
      </aside>
    </div>
  </div>;
}
