import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context.jsx";
import { Label } from "../components/UI.jsx";

export default function Login() {
  const { t } = useTranslation();
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user) return <Navigate to={location.state?.from || "/complaints"} replace />;

  async function sendCode(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try { await api("/auth/send-otp", { method: "POST", body: JSON.stringify({ phone: phone.trim() }) }); setSent(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function verify(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const session = await api("/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() }) });
      signIn(session);
      navigate(location.state?.from || (session.user.role === "VICTIM" ? "/complaints" : "/officer"), { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="auth-wrap">
    <section className="panel auth-card">
      <span className="auth-emblem"><ShieldCheck size={24} /></span>
      <h1>{t("signInTitle")}</h1>
      <p>{t("loginIntro")}</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!sent ? <form onSubmit={sendCode}>
        <div className="field"><Label htmlFor="phone">{t("phone")}</Label><input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={10} maxLength={16} pattern="[0-9+ ]{10,16}" /></div>
        <button className="button" type="submit" disabled={busy || phone.replace(/\D/g, "").length < 10}>{busy ? t("loading") : t("sendOtp")}</button>
      </form> : <form onSubmit={verify}>
        <div className="field"><Label htmlFor="otp">{t("otp")}</Label><input id="otp" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required autoFocus /></div>
        <p className="helper-note">{t("demoOtp")}</p>
        <button className="button" type="submit" disabled={busy || otp.length !== 6}>{busy ? t("loading") : t("verifyOtp")}</button>
        <button type="button" className="text-button" style={{ marginTop: 15 }} onClick={() => { setSent(false); setOtp(""); }}>{t("phone")} · {phone}</button>
      </form>}
      <p className="auth-small"><KeyRound size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />{t("consent")}</p>
    </section>
  </div>;
}
