import { createContext, useContext, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("frt-user") || "null"); } catch { return null; }
  });
  const value = useMemo(() => ({
    user,
    signIn(session) {
      localStorage.setItem("frt-token", session.token);
      localStorage.setItem("frt-user", JSON.stringify(session.user));
      setUser(session.user);
    },
    signOut() {
      localStorage.removeItem("frt-token");
      localStorage.removeItem("frt-user");
      setUser(null);
    },
  }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function RequireAuth({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
