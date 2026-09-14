import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError, getToken, setToken, type Profile, type SessionInfo } from "../api/client";

interface ProfileContextValue {
  user: Profile | null;
  session: SessionInfo | null;
  loading: boolean;
  selectProfile: (id: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/TV|Android TV|GoogleTV/i.test(ua)) return "Smart TV";
  if (/Mobi|Android/i.test(ua)) return "Smartphone";
  if (/Tablet|iPad/i.test(ua)) return "Tablet";
  return "Browser desktop";
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: me, session: mySession } = await api.me();
        if (!cancelled) {
          setUser(me);
          setSession(mySession);
        }
      } catch (err) {
        if (err instanceof ApiError) setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectProfile = useCallback(async (id: string) => {
    const { token, user: selected, session: newSession } = await api.selectProfile(id, deviceName());
    setToken(token);
    setUser(selected);
    setSession(newSession);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user: loggedIn, session: newSession } = await api.login(username, password, deviceName());
    setToken(token);
    setUser(loggedIn);
    setSession(newSession);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setToken(null);
      setUser(null);
      setSession(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, selectProfile, login, logout }),
    [user, session, loading, selectProfile, login, logout],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile deve essere usato dentro ProfileProvider");
  return ctx;
}
