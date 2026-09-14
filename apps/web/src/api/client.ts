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
  internet: { reachable: boolean };
  services: ServiceStatus[];
  backup: { configured: boolean; lastStatus: string | null };
  downloads: { active: number; errored: number };
}

export interface SystemEvent {
  id: string;
  level: "info" | "critical";
  category: string;
  message: string;
  createdAt: string;
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

export interface AudioTrackInfo {
  index: number;
  language: string | null;
  title: string | null;
  isDefault: boolean;
}

export interface MovieDetail extends MediaSummary {
  mediaSourceId: string | null;
  audioTracks: AudioTrackInfo[];
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
  audioTracks: AudioTrackInfo[];
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

export function mediaStreamUrl(
  itemId: string,
  mediaSourceId?: string | null,
  audioStreamIndex?: number | null,
): string {
  const params = new URLSearchParams({ token: getToken() ?? "" });
  if (mediaSourceId) params.set("mediaSourceId", mediaSourceId);
  if (audioStreamIndex !== undefined && audioStreamIndex !== null) {
    params.set("audioStreamIndex", String(audioStreamIndex));
  }
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

export type GameStatus = "installed" | "not_installed";
export type MachineKind = "local" | "remote";

export interface GameItem {
  id: string;
  title: string;
  platform: string;
  coverPath: string | null;
  status: GameStatus;
  executionMachineId: string | null;
  hasSavePath: boolean;
}

export interface SaveBackup {
  id: string;
  backupPath: string;
  createdAt: string;
}

export interface GameDetail {
  game: GameItem;
  saves: SaveBackup[];
  running: boolean;
}

export interface ScanCandidate {
  romPath: string;
  suggestedTitle: string;
  platform: string;
}

export interface MachineItem {
  id: string;
  name: string;
  kind: MachineKind;
  macAddress: string | null;
  host: string | null;
  port: number | null;
  hasAgent: boolean;
}

export function gameCoverUrl(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/cover?token=${encodeURIComponent(getToken() ?? "")}`;
}

async function uploadGameCover(gameId: string, file: File): Promise<{ game: GameItem }> {
  const form = new FormData();
  form.append("file", file);

  const token = getToken();
  const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/cover`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

export interface SmartStatus {
  available: boolean;
  health: "passed" | "failed" | "unknown";
  device: string | null;
}

export interface DiskInfo {
  id: string;
  label: string;
  path: string;
  connected: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
  freePercent: number | null;
  critical: boolean;
  smart: SmartStatus | null;
}

export type BackupTrigger = "auto" | "manual";
export type BackupRunStatus = "running" | "completed" | "completed_with_errors" | "interrupted" | "failed";

export interface BackupRun {
  id: string;
  trigger: BackupTrigger;
  status: BackupRunStatus;
  startedAt: string;
  finishedAt: string | null;
  filesTotal: number;
  filesCopied: number;
  filesSkipped: number;
  filesFailed: number;
  bytesCopied: number;
  errorMessage: string | null;
}

export interface BackupStatus {
  configured: boolean;
  running: boolean;
  hasRecentValidBackup: boolean;
  latestRun: BackupRun | null;
}

export interface RestoreSummary {
  filesTotal: number;
  filesRestored: number;
  filesSkipped: number;
  filesFailed: number;
  databaseRestored: boolean;
}

export interface LocalNetworkInfo {
  ips: string[];
  webPort: number;
  mdnsHostname: string | null;
  mdnsUrl: string | null;
  primaryUrl: string | null;
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secured: boolean;
}

export interface WifiStatus {
  available: boolean;
  connectedSsid: string | null;
}

export interface SetupStorageResult {
  created: string[];
  alreadyExisted: string[];
}

export interface SessionEntry {
  id: string;
  deviceName: string | null;
  origin: "local" | "remote";
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AllSessionEntry extends SessionEntry {
  username: string;
  displayName: string;
}

export interface SearchResultItem {
  type: "movie" | "series" | "game" | "file" | "photo";
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  color: string;
}

export interface DdnsStatus {
  configured: boolean;
  domain: string | null;
  lastStatus: "ok" | "error" | null;
  lastUpdatedAt: string | null;
}

export interface VpnStatus {
  configured: boolean;
  commandsAvailable: boolean;
  interfaceUp: boolean;
  serverPublicKey: string | null;
  endpointHost: string | null;
  listenPort: number;
  subnetCidr: string;
}

export type VpnProfile = "home" | "full";

export interface VpnPeer {
  id: string;
  label: string;
  profile: VpnProfile;
  publicKey: string;
  address: string;
  allowedIps: string;
  createdAt: string;
  connected: boolean;
  lastHandshakeAt: string | null;
}

export interface VpnPeerWithUser extends VpnPeer {
  username: string;
  displayName: string;
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
  listSystemEvents: (limit = 50) => request<{ events: SystemEvent[] }>(`/system/events?limit=${limit}`),
  shutdownHost: () => request<{ ok: true }>("/system/shutdown", { method: "POST", body: JSON.stringify({ confirm: true }) }),

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

  listGames: () => request<{ games: GameItem[] }>("/games"),
  getGame: (id: string) => request<GameDetail>(`/games/${encodeURIComponent(id)}`),
  createGame: (fields: {
    title: string;
    platform: string;
    romPath?: string | null;
    savePath?: string | null;
    executionMachineId?: string | null;
  }) => request<{ game: GameItem }>("/games", { method: "POST", body: JSON.stringify(fields) }),
  updateGame: (
    id: string,
    fields: Partial<{
      title: string;
      platform: string;
      romPath: string | null;
      savePath: string | null;
      executionMachineId: string | null;
    }>,
  ) =>
    request<{ game: GameItem }>(`/games/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    }),
  deleteGame: (id: string) => request<{ ok: true }>(`/games/${encodeURIComponent(id)}`, { method: "DELETE" }),
  scanGames: () => request<{ candidates: ScanCandidate[] }>("/games/scan"),
  importGame: (candidate: ScanCandidate) =>
    request<{ game: GameItem }>("/games/import", {
      method: "POST",
      body: JSON.stringify({ romPath: candidate.romPath, title: candidate.suggestedTitle, platform: candidate.platform }),
    }),
  uploadGameCover,
  launchGame: (id: string) =>
    request<{ mode: "local" | "remote"; started?: boolean; machineOnline?: boolean; wolSent?: boolean }>(
      `/games/${encodeURIComponent(id)}/launch`,
      { method: "POST" },
    ),
  stopGame: (id: string) => request<{ ok: true }>(`/games/${encodeURIComponent(id)}/stop`, { method: "POST" }),
  backupGameSave: (id: string) =>
    request<{ backup: SaveBackup }>(`/games/${encodeURIComponent(id)}/backup-save`, { method: "POST" }),

  listMachines: () => request<{ machines: MachineItem[] }>("/machines"),
  createMachine: (fields: { name: string; macAddress?: string | null; host?: string | null; port?: number | null; agentUrl?: string | null }) =>
    request<{ machine: MachineItem }>("/machines", { method: "POST", body: JSON.stringify(fields) }),
  deleteMachine: (id: string) => request<{ ok: true }>(`/machines/${encodeURIComponent(id)}`, { method: "DELETE" }),
  wakeMachine: (id: string) => request<{ ok: true }>(`/machines/${encodeURIComponent(id)}/wake`, { method: "POST" }),
  getMachineStatus: (id: string) => request<{ online: boolean }>(`/machines/${encodeURIComponent(id)}/status`),

  listDisks: () => request<{ disks: DiskInfo[] }>("/storage/disks"),
  getBackupStatus: () => request<BackupStatus>("/backup/status"),
  listBackupRuns: (limit = 20) => request<{ runs: BackupRun[] }>(`/backup/runs?limit=${limit}`),
  runBackupNow: () => request<{ run: BackupRun }>("/backup/run", { method: "POST" }),
  restoreBackup: () =>
    request<{ summary: RestoreSummary; note: string }>("/backup/restore", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }),

  getNetworkInfo: () => request<LocalNetworkInfo>("/network/info"),
  getWifiStatus: () => request<WifiStatus>("/network/wifi/status"),
  scanWifi: () => request<{ networks: WifiNetwork[] }>("/network/wifi/scan"),
  connectWifi: (ssid: string, password: string | null) =>
    request<{ ok: true }>("/network/wifi/connect", { method: "POST", body: JSON.stringify({ ssid, password }) }),

  getHubName: () => request<{ hubName: string }>("/settings/hub-name"),

  // Wizard di primo avvio (§28) — nessuna auth: valido solo finché il
  // setup non è completato (guardia lato server).
  getSetupStatus: () => request<{ completed: boolean }>("/setup/status"),
  createSetupAdmin: (fields: { username: string; displayName: string; password: string }) =>
    request<{ user: Profile }>("/setup/admin", { method: "POST", body: JSON.stringify(fields) }),
  createSetupUser: (fields: { username: string; displayName: string; password: string | null }) =>
    request<{ user: Profile }>("/setup/users", { method: "POST", body: JSON.stringify(fields) }),
  getSetupStorage: () => request<{ disks: DiskInfo[] }>("/setup/storage"),
  initSetupStorage: () => request<SetupStorageResult>("/setup/storage/init", { method: "POST" }),
  getSetupLibraries: () => request<{ services: ServiceStatus[] }>("/setup/libraries"),
  saveSetupSettings: (hubName: string) =>
    request<{ ok: true }>("/setup/settings", { method: "POST", body: JSON.stringify({ hubName }) }),
  completeSetup: () => request<{ ok: true }>("/setup/complete", { method: "POST" }),

  getSetupWifiStatus: () => request<WifiStatus>("/setup/wifi/status"),
  scanSetupWifi: () => request<{ networks: WifiNetwork[] }>("/setup/wifi/scan"),
  connectSetupWifi: (ssid: string, password: string | null) =>
    request<{ ok: true }>("/setup/wifi/connect", { method: "POST", body: JSON.stringify({ ssid, password }) }),

  listMySessions: () => request<{ sessions: SessionEntry[] }>("/auth/sessions"),
  listAllSessions: () => request<{ sessions: AllSessionEntry[] }>("/auth/sessions/all"),
  revokeSession: (id: string) => request<{ ok: true }>(`/auth/sessions/${encodeURIComponent(id)}/revoke`, { method: "POST" }),
  revokeAllMySessions: () => request<{ ok: true }>("/auth/sessions/revoke-all", { method: "POST" }),
  revokeAllRemoteSessions: () => request<{ ok: true; revoked: number }>("/auth/sessions/revoke-all-remote", { method: "POST" }),

  changePassword: (currentPassword: string | null, newPassword: string) =>
    request<{ ok: true }>("/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  resetUserPassword: (userId: string, newPassword: string) =>
    request<{ ok: true }>(`/auth/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),

  getDdnsStatus: () => request<DdnsStatus>("/network/ddns/status"),
  updateDdnsNow: () => request<DdnsStatus>("/network/ddns/update", { method: "POST" }),

  listBookmarks: () => request<{ bookmarks: Bookmark[] }>("/bookmarks"),
  createBookmark: (fields: { title: string; url: string; color: string }) =>
    request<{ bookmark: Bookmark }>("/bookmarks", { method: "POST", body: JSON.stringify(fields) }),
  updateBookmark: (id: string, fields: Partial<{ title: string; url: string; color: string }>) =>
    request<{ bookmark: Bookmark }>(`/bookmarks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    }),
  deleteBookmark: (id: string) => request<{ ok: true }>(`/bookmarks/${encodeURIComponent(id)}`, { method: "DELETE" }),

  search: (q: string) => request<{ results: SearchResultItem[] }>(`/search?q=${encodeURIComponent(q)}`),

  getVpnStatus: () => request<VpnStatus>("/vpn/status"),
  listVpnPeers: () => request<{ peers: VpnPeer[] }>("/vpn/peers"),
  listAllVpnPeers: () => request<{ peers: VpnPeerWithUser[] }>("/vpn/peers/all"),
  createVpnPeer: (fields: { profile: VpnProfile; label: string; publicKey: string }) =>
    request<{ peer: VpnPeer }>("/vpn/peers", { method: "POST", body: JSON.stringify(fields) }),
  deleteVpnPeer: (id: string) => request<{ ok: true }>(`/vpn/peers/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
