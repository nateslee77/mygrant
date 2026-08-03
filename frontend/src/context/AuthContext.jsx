import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { api, setAccessToken, setOnAuthFailure } from "../lib/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = () => {
    setAccessToken(null);
    setUser(null);
  };

  useEffect(() => {
    setOnAuthFailure(clearSession);

    (async () => {
      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        setAccessToken(data.access_token);
        const me = await api.get("/auth/me");
        setUser(me.data);
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    setAccessToken(data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    clearSession();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
