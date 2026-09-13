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
  // Solo se c'è un body: Fastify rifiuta un body vuoto con Content-Type json.
  if (init?.body) headers.set("Content-Type", "application/json");
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

/** 1 secondo = 10.000.000 di tick (unità di misura usata da Jellyfin). */
export const TICKS_PER_SECOND = 10_000_000;

export interface MediaSummary {
  id: string;
  title: string;
  year: number | null;
  overview: string | null;
  genres: string[];
  communityRating: number | null;
  runtimeTicks: number | null;
}

export interface MovieDetail extends MediaSummary {
  mediaSourceId: string | null;
}

export interface ResumeInfo {
  positionTicks: number;
  durationTicks: number | null;
}

export interface SeasonSummary {
  id: string;
  name: string;
  indexNumber: number | null;
}

export interface EpisodeSummary {
  id: string;
  title: string;
  indexNumber: number | null;
  seasonId: string | null;
  overview: string | null;
  runtimeTicks: number | null;
}

export interface EpisodeDetail extends EpisodeSummary {
  seriesId: string | null;
  seriesName: string | null;
  mediaSourceId: string | null;
}

export interface ContinueWatchingItem {
  itemId: string;
  itemType: "movie" | "episode";
  positionTicks: number;
  durationTicks: number | null;
  title: string | null;
  metadataAvailable: boolean;
}

/**
 * URL diretti verso i proxy binari dell'API (immagine/stream). Il token
 * passa come query string perché <img>/<video src> non possono impostare
 * header Authorization — stesso compromesso adottato da Jellyfin/Plex per
 * i propri link di immagine/stream firmati.
 */
export function mediaImageUrl(itemId: string): string {
  return `/api/media/${encodeURIComponent(itemId)}/image?token=${encodeURIComponent(getToken() ?? "")}`;
}

export function mediaStreamUrl(itemId: string, mediaSourceId?: string | null): string {
  const params = new URLSearchParams({ token: getToken() ?? "" });
  if (mediaSourceId) params.set("mediaSourceId", mediaSourceId);
  return `/api/media/${encodeURIComponent(itemId)}/stream?${params.toString()}`;
}

export interface PhotoAsset {
  id: string;
  type: "image" | "video";
  fileName: string;
  takenAt: string;
}

export interface TimelinePage {
  items: PhotoAsset[];
  total: number;
  nextPage: string | null;
}

export interface AlbumSummary {
  id: string;
  name: string;
  assetCount: number;
  thumbnailAssetId: string | null;
}

export interface AlbumDetail extends AlbumSummary {
  description: string | null;
  assets: PhotoAsset[];
}

export function photoThumbnailUrl(assetId: string): string {
  return `/api/photos/assets/${encodeURIComponent(assetId)}/thumbnail?token=${encodeURIComponent(getToken() ?? "")}`;
}

export function photoOriginalUrl(assetId: string): string {
  return `/api/photos/assets/${encodeURIComponent(assetId)}/original?token=${encodeURIComponent(getToken() ?? "")}`;
}

export type FileScope = "shared" | "private";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: string;
}

export interface TrashEntry {
  id: string;
  scope: FileScope;
  originalPath: string;
  name: string;
  isDirectory: boolean;
  trashedAt: string;
  expiresAt: string;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: { path: string; modifiedAt: string }[];
}

export interface FileSearchResult {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: string;
}

export function fileDownloadUrl(scope: FileScope, filePath: string): string {
  const params = new URLSearchParams({ scope, path: filePath, token: getToken() ?? "" });
  return `/api/files/download?${params.toString()}`;
}

async function uploadFiles(
  scope: FileScope,
  path: string,
  files: FileList | File[],
): Promise<{ ok: true; uploaded: number }> {
  const form = new FormData();
  form.set("scope", scope);
  form.set("path", path);
  for (const file of Array.from(files)) form.append("file", file);

  const token = getToken();
  const res = await fetch("/api/files/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

export type DownloadKind = "url" | "torrent";
export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "error";

export interface DownloadItem {
  id: string;
  kind: DownloadKind;
  source: string;
  title: string | null;
  status: DownloadStatus;
  progressPercent: number;
  totalBytes: number | null;
  downloadedBytes: number | null;
  speedBytesPerSec: number | null;
  errorMessage: string | null;
  createdAt: string;
}

async function uploadTorrentFile(file: File): Promise<{ download: DownloadItem }> {
  const form = new FormData();
  form.append("file", file);

  const token = getToken();
  const res = await fetch("/api/downloads/upload-torrent", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
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

  listMovies: () => request<{ movies: MediaSummary[] }>("/movies"),
  getMovie: (id: string) =>
    request<{ movie: MovieDetail; resume: ResumeInfo | null }>(`/movies/${encodeURIComponent(id)}`),

  listSeries: () => request<{ series: MediaSummary[] }>("/series"),
  getSeries: (id: string) =>
    request<{ series: MediaSummary; seasons: SeasonSummary[] }>(`/series/${encodeURIComponent(id)}`),
  listEpisodes: (seriesId: string, seasonId: string) =>
    request<{ episodes: EpisodeSummary[] }>(
      `/series/${encodeURIComponent(seriesId)}/seasons/${encodeURIComponent(seasonId)}/episodes`,
    ),
  getEpisode: (episodeId: string) =>
    request<{ episode: EpisodeDetail; resume: ResumeInfo | null }>(
      `/series/episodes/${encodeURIComponent(episodeId)}`,
    ),

  saveProgress: (
    itemId: string,
    body: { itemType: "movie" | "episode"; positionTicks: number; durationTicks: number | null },
  ) =>
    request<{ ok: true }>(`/playback/${encodeURIComponent(itemId)}/progress`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  continueWatching: () => request<{ items: ContinueWatchingItem[] }>("/continue-watching"),

  photoTimeline: (page: number, type: "all" | "image" | "video") =>
    request<TimelinePage>(`/photos/timeline?page=${page}&type=${type}`),
  listAlbums: () => request<{ albums: AlbumSummary[] }>("/photos/albums"),
  getAlbum: (id: string) =>
    request<{ album: AlbumDetail }>(`/photos/albums/${encodeURIComponent(id)}`),

  listFiles: (scope: FileScope, path: string) =>
    request<{ entries: FileEntry[] }>(
      `/files?scope=${scope}&path=${encodeURIComponent(path)}`,
    ),
  createFolder: (scope: FileScope, path: string, name: string) =>
    request<{ ok: true }>("/files/folders", {
      method: "POST",
      body: JSON.stringify({ scope, path, name }),
    }),
  renameFile: (scope: FileScope, path: string, newName: string) =>
    request<{ ok: true }>("/files/rename", {
      method: "POST",
      body: JSON.stringify({ scope, path, newName }),
    }),
  moveFile: (scope: FileScope, path: string, destScope: FileScope, destPath: string) =>
    request<{ ok: true }>("/files/move", {
      method: "POST",
      body: JSON.stringify({ scope, path, destScope, destPath }),
    }),
  deleteFile: (scope: FileScope, path: string, permanent = false) =>
    request<{ ok: true }>("/files", {
      method: "DELETE",
      body: JSON.stringify({ scope, path, permanent }),
    }),
  uploadFiles,
  listTrash: () => request<{ items: TrashEntry[] }>("/files/trash"),
  restoreTrash: (id: string) =>
    request<{ ok: true }>(`/files/trash/${encodeURIComponent(id)}/restore`, { method: "POST" }),
  deleteTrashPermanent: (id: string) =>
    request<{ ok: true }>(`/files/trash/${encodeURIComponent(id)}`, { method: "DELETE" }),
  findDuplicateFiles: (scope: FileScope) =>
    request<{ groups: DuplicateGroup[] }>(`/files/duplicates?scope=${scope}`),
  searchFiles: (scope: FileScope, q: string) =>
    request<{ results: FileSearchResult[] }>(
      `/files/search?scope=${scope}&q=${encodeURIComponent(q)}`,
    ),

  listDownloads: () => request<{ downloads: DownloadItem[] }>("/downloads"),
  addUrlDownload: (source: string) =>
    request<{ download: DownloadItem }>("/downloads", {
      method: "POST",
      body: JSON.stringify({ kind: "url", source }),
    }),
  addTorrentDownload: (magnetUri: string) =>
    request<{ download: DownloadItem }>("/downloads", {
      method: "POST",
      body: JSON.stringify({ kind: "torrent", source: magnetUri }),
    }),
  uploadTorrentFile,
  pauseDownload: (id: string) =>
    request<{ ok: true }>(`/downloads/${encodeURIComponent(id)}/pause`, { method: "POST" }),
  resumeDownload: (id: string) =>
    request<{ ok: true }>(`/downloads/${encodeURIComponent(id)}/resume`, { method: "POST" }),
  cancelDownload: (id: string) =>
    request<{ ok: true }>(`/downloads/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
