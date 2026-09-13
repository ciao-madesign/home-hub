import { config } from "../config.js";

/** 1 secondo = 10.000.000 di tick, unità di misura usata dalle API Jellyfin. */
export const TICKS_PER_SECOND = 10_000_000;

export class JellyfinError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export function isJellyfinConfigured(): boolean {
  return Boolean(config.jellyfinBaseUrl && config.jellyfinApiKey);
}

function baseUrl(): string {
  if (!config.jellyfinBaseUrl) throw new JellyfinError("jellyfin_not_configured");
  return config.jellyfinBaseUrl.replace(/\/+$/, "");
}

async function jf<T>(path: string, searchParams?: Record<string, string>): Promise<T> {
  if (!isJellyfinConfigured()) throw new JellyfinError("jellyfin_not_configured");

  const url = new URL(baseUrl() + path);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    res = await fetch(url, {
      headers: { "X-Emby-Token": config.jellyfinApiKey! },
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    throw new JellyfinError(`jellyfin_unreachable: ${(err as Error).message}`);
  }

  if (!res.ok) throw new JellyfinError(`jellyfin_error_${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Effettua una richiesta binaria (stream video / immagine) e restituisce la Response grezza da inoltrare. */
export async function jellyfinProxyFetch(
  path: string,
  searchParams?: Record<string, string>,
  extraHeaders?: Record<string, string>,
) {
  if (!isJellyfinConfigured()) throw new JellyfinError("jellyfin_not_configured");
  const url = new URL(baseUrl() + path);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }
  try {
    return await fetch(url, {
      headers: { "X-Emby-Token": config.jellyfinApiKey!, ...extraHeaders },
    });
  } catch (err) {
    throw new JellyfinError(`jellyfin_unreachable: ${(err as Error).message}`);
  }
}

// --- Tipi grezzi Jellyfin (solo i campi che ci servono) ---------------------

interface JfItem {
  Id: string;
  Name: string;
  ProductionYear?: number;
  Overview?: string;
  Genres?: string[];
  CommunityRating?: number;
  RunTimeTicks?: number;
  IndexNumber?: number;
  SeasonId?: string;
  SeriesId?: string;
  SeriesName?: string;
  MediaSources?: { Id: string }[];
}

interface JfItemsResponse {
  Items: JfItem[];
  TotalRecordCount: number;
}

// --- DTO esposti dall'Hub API (mai i tipi grezzi Jellyfin) -----------------

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

const ITEM_FIELDS = "Overview,Genres,ProductionYear,CommunityRating,RunTimeTicks,MediaSources";

function toSummary(item: JfItem): MediaSummary {
  return {
    id: item.Id,
    title: item.Name,
    year: item.ProductionYear ?? null,
    overview: item.Overview ?? null,
    genres: item.Genres ?? [],
    communityRating: item.CommunityRating ?? null,
    runtimeTicks: item.RunTimeTicks ?? null,
  };
}

function toMovieDetail(item: JfItem): MovieDetail {
  return { ...toSummary(item), mediaSourceId: item.MediaSources?.[0]?.Id ?? null };
}

export async function listMovies(): Promise<MediaSummary[]> {
  const data = await jf<JfItemsResponse>("/Items", {
    IncludeItemTypes: "Movie",
    Recursive: "true",
    Fields: ITEM_FIELDS,
    SortBy: "SortName",
  });
  return data.Items.map(toSummary);
}

export async function getMovie(id: string): Promise<MovieDetail | null> {
  try {
    const item = await jf<JfItem>(`/Items/${encodeURIComponent(id)}`, { Fields: ITEM_FIELDS });
    return toMovieDetail(item);
  } catch (err) {
    if (err instanceof JellyfinError && err.status === 404) return null;
    throw err;
  }
}

/** Recupera più item in un'unica chiamata (usato per idratare "Continua a guardare"). */
export async function getItemsByIds(ids: string[]): Promise<Map<string, MediaSummary>> {
  if (ids.length === 0) return new Map();
  const data = await jf<JfItemsResponse>("/Items", {
    Ids: ids.join(","),
    Fields: ITEM_FIELDS,
  });
  return new Map(data.Items.map((item) => [item.Id, toSummary(item)]));
}

export async function listSeries(): Promise<MediaSummary[]> {
  const data = await jf<JfItemsResponse>("/Items", {
    IncludeItemTypes: "Series",
    Recursive: "true",
    Fields: ITEM_FIELDS,
    SortBy: "SortName",
  });
  return data.Items.map(toSummary);
}

export async function getSeries(id: string): Promise<MediaSummary | null> {
  try {
    const item = await jf<JfItem>(`/Items/${encodeURIComponent(id)}`, { Fields: ITEM_FIELDS });
    return toSummary(item);
  } catch (err) {
    if (err instanceof JellyfinError && err.status === 404) return null;
    throw err;
  }
}

export async function listSeasons(seriesId: string): Promise<SeasonSummary[]> {
  const data = await jf<JfItemsResponse>(`/Shows/${encodeURIComponent(seriesId)}/Seasons`);
  return data.Items.map((s) => ({ id: s.Id, name: s.Name, indexNumber: s.IndexNumber ?? null }));
}

export async function listEpisodes(
  seriesId: string,
  seasonId: string,
): Promise<EpisodeSummary[]> {
  const data = await jf<JfItemsResponse>(`/Shows/${encodeURIComponent(seriesId)}/Episodes`, {
    SeasonId: seasonId,
    Fields: "Overview,RunTimeTicks",
  });
  return data.Items.map((e) => ({
    id: e.Id,
    title: e.Name,
    indexNumber: e.IndexNumber ?? null,
    seasonId: e.SeasonId ?? seasonId,
    overview: e.Overview ?? null,
    runtimeTicks: e.RunTimeTicks ?? null,
  }));
}

export async function getEpisode(id: string): Promise<EpisodeDetail | null> {
  try {
    const item = await jf<JfItem>(`/Items/${encodeURIComponent(id)}`, {
      Fields: "Overview,RunTimeTicks,MediaSources,SeriesId,SeasonId",
    });
    return {
      id: item.Id,
      title: item.Name,
      indexNumber: item.IndexNumber ?? null,
      seasonId: item.SeasonId ?? null,
      overview: item.Overview ?? null,
      runtimeTicks: item.RunTimeTicks ?? null,
      seriesId: item.SeriesId ?? null,
      seriesName: item.SeriesName ?? null,
      mediaSourceId: item.MediaSources?.[0]?.Id ?? null,
    };
  } catch (err) {
    if (err instanceof JellyfinError && err.status === 404) return null;
    throw err;
  }
}
