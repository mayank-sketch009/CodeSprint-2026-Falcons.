import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, X } from "lucide-react";
import { api } from "../api.js";

export function ChatWidget() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setMessages((items) => [...items, { role: "user", text: value }]);
    setText("");
    setBusy(true);
    try {
      const result = await api("/tools/chat", { method: "POST", body: JSON.stringify({ message: value, language: i18n.language }) });
      setMessages((items) => [...items, { role: "assistant", text: result.answer }]);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", text: error.message }]);
    } finally { setBusy(false); }
  }
  return <div className="chat-launcher">
    {open && <section className="chat-panel" aria-label={t("chatTitle")}>
      <header><span className="chat-avatar"><MessageCircle size={18} /></span><div><strong>{t("chatTitle")}</strong><small>{t("chatPrivacy")}</small></div><button onClick={() => setOpen(false)} aria-label={t("closeChat")}><X size={18} /></button></header>
      <div className="chat-messages">
        <p className="chat-bubble assistant">{t("chatGreeting")}</p>
        {messages.map((item, index) => <p key={`${index}-${item.role}`} className={`chat-bubble ${item.role}`}>{item.text}</p>)}
        {busy && <p className="chat-bubble assistant">…</p>}
      </div>
      <form className="chat-form" onSubmit={send}><input aria-label={t("chatPlaceholder")} value={text} onChange={(event) => setText(event.target.value)} placeholder={t("chatPlaceholder")} maxLength={1000} /><button type="submit" disabled={busy || !text.trim()} aria-label={t("send")}><Send size={17} /></button></form>
    </section>}
    <button className="chat-fab" onClick={() => setOpen(!open)} aria-label={open ? t("closeHelp") : t("chatTitle")}>{open ? <X size={22} /> : <MessageCircle size={22} />}<span>{t("chatTitle")}</span></button>
  </div>;
}
