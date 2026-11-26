import { lazy, Suspense, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, ChevronDown, CircleHelp, LayoutDashboard, LogOut, Menu, ShieldCheck, Siren } from "lucide-react";
import { api } from "./api.js";
import { useAuth, RequireAuth } from "./context.jsx";
import { ChatWidget } from "./components/ChatWidget.jsx";
import { useQuery } from "@tanstack/react-query";

const Home = lazy(() => import("./pages/Home.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Complaints = lazy(() => import("./pages/Complaints.jsx"));
const Report = lazy(() => import("./pages/Report.jsx"));
const CaseDetail = lazy(() => import("./pages/CaseDetail.jsx"));
const Officer = lazy(() => import("./pages/Officer.jsx"));
const Analytics = lazy(() => import("./pages/Analytics.jsx"));
const ScamChecker = lazy(() => import("./pages/ScamChecker.jsx"));

function Header() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
    enabled: Boolean(user),
  });
  const unread = notifications.data?.filter((item) => !item.readAt).length || 0;
  const navItems = [
    { to: "/", label: t("home"), icon: LayoutDashboard },
    ...(user ? [{ to: "/complaints", label: t("complaints"), icon: ShieldCheck }] : []),
    { to: "/scam-checker", label: t("scamChecker"), icon: CircleHelp },
    ...(user?.role === "OFFICER" || user?.role === "ADMIN" ? [{ to: "/officer", label: t("officerDesk"), icon: Siren }] : []),
    ...(user?.role === "ADMIN" ? [{ to: "/analytics", label: t("analytics"), icon: LayoutDashboard }] : []),
  ];
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label={t("appName")}>
          <span className="brand-mark"><ShieldCheck size={21} strokeWidth={2.4} /></span>
          <span className="brand-copy"><strong>{t("appName")}</strong><small>{t("tagline")}</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.map(({ to, label }) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>{label}</NavLink>)}
        </nav>
        <div className="topbar-actions">
          <a className="call-pill" href="tel:1930"><Siren size={16} /><span>1930</span></a>
          <button className="language-toggle" onClick={() => { const next = i18n.language === "en" ? "hi" : "en"; i18n.changeLanguage(next); localStorage.setItem("frt-language", next); }} aria-label="Change language">
            {i18n.language === "en" ? "हिन्दी" : "English"}
          </button>
          {user && <div className="notification-wrap">
            <button className="icon-button" aria-label={`${t("notifications")}, ${unread} ${t("unread")}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}>
              <Bell size={19} />{unread > 0 && <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>}
            </button>
            {notificationsOpen && <div className="notification-popover"><strong>{t("notifications")}</strong>{(notifications.data || []).length === 0 ? <p>{t("noNotifications")}</p> : (notifications.data || []).slice(0, 6).map((item) => <button className={`notification-item ${item.readAt ? "" : "unread"}`} key={item.id} onClick={async () => { try { if (!item.readAt) await api(`/notifications/${item.id}/read`, { method: "PATCH", body: JSON.stringify({}) }); await notifications.refetch(); setNotificationsOpen(false); if (item.complaintId) navigate(`/complaints/${item.complaintId}`); } catch { setNotificationsOpen(false); } }}><b>{item.title}</b><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleString()}</small></button>)}</div>}
          </div>}
          {user ? <div className="account-menu">
            <button className="account-trigger" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
              <span className="avatar">{(user.name || user.phone || "U").slice(0, 1).toUpperCase()}</span><span className="account-name">{user.name || user.phone}</span><ChevronDown size={15} />
            </button>
            {menuOpen && <div className="account-dropdown">
              <span className="dropdown-role">{user.role?.toLowerCase()}</span>
              <button onClick={() => { signOut(); setMenuOpen(false); navigate("/"); }}><LogOut size={15} />{t("logout")}</button>
            </div>}
          </div> : <Link to="/login" className="button button-outline button-small">{t("login")}</Link>}
          <button className="mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={t("closeMenu")}><Menu size={21} /></button>
        </div>
      </div>
      {menuOpen && <nav className="mobile-nav">{navItems.map(({ to, label }) => <NavLink key={to} to={to} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}{user && <button onClick={() => { signOut(); setMenuOpen(false); }}>{t("logout")}</button>}</nav>}
    </header>
  );
}

function Footer() {
  const { t } = useTranslation();
  return <footer className="site-footer"><span>© {new Date().getFullYear()} {t("appName")}</span><span>{t("officialNotice")}</span><a href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer">cybercrime.gov.in</a></footer>;
}

function Protected({ roles, children }) {
  return <RequireAuth roles={roles}>{children}</RequireAuth>;
}

export default function App() {
  const { user } = useAuth();
  const { t } = useTranslation();
  return <>
    <Header />
    <main className="page-shell">
      <Suspense fallback={<div className="state-card"><span className="spin">◌</span>{t("loading")}</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/report" element={<Protected><Report /></Protected>} />
          <Route path="/complaints" element={<Protected><Complaints /></Protected>} />
          <Route path="/complaints/:id" element={<Protected><CaseDetail /></Protected>} />
          <Route path="/officer" element={<Protected roles={["OFFICER", "ADMIN"]}><Officer /></Protected>} />
          <Route path="/analytics" element={<Protected roles={["ADMIN"]}><Analytics /></Protected>} />
          <Route path="/scam-checker" element={<ScamChecker />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </main>
    <Footer />
    {user && <ChatWidget />}
  </>;
}
