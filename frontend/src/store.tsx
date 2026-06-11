import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Lang } from "./i18n";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

type Profile = {
  id: string;
  user_id: string;
  base_doc_type: string | null;
  is_married_lady: boolean;
  is_minor?: boolean;
  language?: string;
};

type Doc = {
  id?: string;
  doc_type: string;
  name?: string | null;
  dob?: string | null;
  doc_number?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  surname?: string | null;
  first_name?: string | null;
  mode?: string;
};

type AppState = {
  ready: boolean;
  token: string | null;
  userPhone: string | null;
  lang: Lang;
  profile: Profile | null;
  documents: Doc[];
  setLang: (l: Lang) => Promise<void>;
  setToken: (t: string | null, phone?: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>("en");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [documents, setDocuments] = useState<Doc[]>([]);

  const api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...((init?.headers as Record<string, string>) || {}),
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BACKEND}${path}`, { ...init, headers });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = j.detail || JSON.stringify(j);
        } catch {}
        throw new Error(detail);
      }
      return (await res.json()) as T;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const state = await api<{
        profile: Profile;
        documents: Doc[];
        user: { phone: string; language: string };
      }>("/api/profile/state");
      setProfile(state.profile);
      setDocuments(state.documents || []);
      if (state.user?.language) {
        setLangState((state.user.language as Lang) || "en");
        await AsyncStorage.setItem("lang", state.user.language);
      }
    } catch (e) {
      console.warn("refresh failed", e);
    }
  }, [api, token]);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem("lang", l);
    if (token) {
      try {
        await api("/api/profile/state", {
          method: "PUT",
          body: JSON.stringify({ language: l }),
        });
      } catch {}
    }
  }, [api, token]);

  const setToken = useCallback(async (t: string | null, phone?: string) => {
    setTokenState(t);
    if (t) {
      await AsyncStorage.setItem("token", t);
      if (phone) {
        await AsyncStorage.setItem("phone", phone);
        setUserPhone(phone);
      }
    } else {
      await AsyncStorage.multiRemove(["token", "phone"]);
      setUserPhone(null);
      setProfile(null);
      setDocuments([]);
    }
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
  }, [setToken]);

  useEffect(() => {
    (async () => {
      const [t, p, l] = await Promise.all([
        AsyncStorage.getItem("token"),
        AsyncStorage.getItem("phone"),
        AsyncStorage.getItem("lang"),
      ]);
      if (t) setTokenState(t);
      if (p) setUserPhone(p);
      if (l === "en" || l === "gu") setLangState(l);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  const value = useMemo<AppState>(
    () => ({ ready, token, userPhone, lang, profile, documents, setLang, setToken, refresh, logout, api }),
    [ready, token, userPhone, lang, profile, documents, setLang, setToken, refresh, logout, api],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppProvider missing");
  return v;
}
