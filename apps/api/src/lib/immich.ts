import { config } from "../config.js";

export class ImmichError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export function isImmichConfigured(): boolean {
  return Boolean(config.immichBaseUrl && config.immichApiKey);
}

function baseUrl(): string {
  if (!config.immichBaseUrl) throw new ImmichError("immich_not_configured");
  return config.immichBaseUrl.replace(/\/+$/, "");
}

async function im<T>(
  path: string,
  init?: { method?: string; body?: unknown; searchParams?: Record<string, string> },
): Promise<T> {
  if (!isImmichConfigured()) throw new ImmichError("immich_not_configured");

  const url = new URL(baseUrl() + path);
  for (const [key, value] of Object.entries(init?.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        "x-api-key": config.immichApiKey!,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    throw new ImmichError(`immich_unreachable: ${(err as Error).message}`);
  }

  if (!res.ok) throw new ImmichError(`immich_error_${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Effettua una richiesta binaria (thumbnail / file originale) e restituisce la Response grezza da inoltrare. */
export async function immichProxyFetch(path: string, extraHeaders?: Record<string, string>) {
  if (!isImmichConfigured()) throw new ImmichError("immich_not_configured");
  const url = new URL(baseUrl() + path);
  try {
    return await fetch(url, {
      headers: { "x-api-key": config.immichApiKey!, ...extraHeaders },
    });
  } catch (err) {
    throw new ImmichError(`immich_unreachable: ${(err as Error).message}`);
  }
}

// --- Tipi grezzi Immich (solo i campi che ci servono) -----------------------

interface ImAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
}

interface ImAlbumDetail extends ImAlbum {
  description?: string;
  assets: ImAsset[];
}

interface ImAsset {
  id: string;
  type: "IMAGE" | "VIDEO";
  originalFileName: string;
  fileCreatedAt: string;
  duration?: string;
}

interface ImSearchResponse {
  assets: {
    total: number;
    count: number;
    items: ImAsset[];
    nextPage: string | null;
  };
}

// --- DTO esposti dall'Hub API (mai i tipi grezzi Immich) -------------------

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

function toAsset(asset: ImAsset): PhotoAsset {
  return {
    id: asset.id,
    type: asset.type === "VIDEO" ? "video" : "image",
    fileName: asset.originalFileName,
    takenAt: asset.fileCreatedAt,
  };
}

export async function listAlbums(): Promise<AlbumSummary[]> {
  const albums = await im<ImAlbum[]>("/api/albums");
  return albums.map((a) => ({
    id: a.id,
    name: a.albumName,
    assetCount: a.assetCount,
    thumbnailAssetId: a.albumThumbnailAssetId,
  }));
}

export async function getAlbum(id: string): Promise<AlbumDetail | null> {
  try {
    const album = await im<ImAlbumDetail>(`/api/albums/${encodeURIComponent(id)}`);
    return {
      id: album.id,
      name: album.albumName,
      assetCount: album.assetCount,
      thumbnailAssetId: album.albumThumbnailAssetId,
      description: album.description ?? null,
      assets: album.assets.map(toAsset),
    };
  } catch (err) {
    if (err instanceof ImmichError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Timeline foto/video personali (§8), con filtro opzionale per tipo —
 * usata anche per "solo video" richiesto dalla spec.
 */
export async function searchTimeline(
  page: number,
  type: "image" | "video" | "all",
): Promise<TimelinePage> {
  const body: Record<string, unknown> = { page, size: 60, order: "desc" };
  if (type !== "all") body.type = type === "video" ? "VIDEO" : "IMAGE";

  const data = await im<ImSearchResponse>("/api/search/metadata", { method: "POST", body });
  return {
    items: data.assets.items.map(toAsset),
    total: data.assets.total,
    nextPage: data.assets.nextPage,
  };
}

/**
 * Ricerca globale (§16): match per nome file invece della ricerca "smart"
 * di Immich (ML, disattivata di default per l'hardware iniziale, §3) —
 * decisione dell'utente, meno precisa ma senza requisiti hardware
 * aggiuntivi. Stesso endpoint metadata già usato per la timeline, con
 * `originalFileName` come filtro invece di `type`.
 */
export async function searchPhotosByFileName(term: string): Promise<PhotoAsset[]> {
  const data = await im<ImSearchResponse>("/api/search/metadata", {
    method: "POST",
    body: { originalFileName: term, size: 20 },
  });
  return data.assets.items.map(toAsset);
}
