const TOKEN_KEY = "hub.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;

  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
  avatarColor: string;
  hasPassword: boolean;
}

export interface SessionInfo {
  id: string;
  origin: "local" | "remote";
  expiresAt: string;
}

export interface ServiceStatus {
  name: string;
  configured: boolean;
  reachable: boolean | null;
}

export interface SystemStatus {
  level: "NORMAL" | "ATTENTION" | "PROBLEM";
  cpu: { loadAvg1m: number; cores: number };
  memory: { totalBytes: number; freeBytes: number; usedPercent: number };
  disk: { totalBytes: number | null; freeBytes: number | null; freePercent: number | null };
  temperatureCelsius: number | null;
  uptimeSeconds: number;
  services: ServiceStatus[];
}

export const api = {
  health: () => request<{ status: string; time: string }>("/health"),

  listProfiles: () => request<{ profiles: Profile[] }>("/profiles"),

  selectProfile: (id: string, deviceName: string) =>
    request<{ token: string; user: Profile; session: SessionInfo }>(
      `/profiles/${id}/select`,
      { method: "POST", body: JSON.stringify({ deviceName, deviceKind: "browser" }) },
    ),

  login: (username: string, password: string, deviceName: string) =>
    request<{ token: string; user: Profile; session: SessionInfo }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, deviceName, deviceKind: "browser" }),
    }),

  me: () => request<{ user: Profile; session: SessionInfo }>("/auth/me"),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  systemStatus: () => request<SystemStatus>("/system/status"),
};
