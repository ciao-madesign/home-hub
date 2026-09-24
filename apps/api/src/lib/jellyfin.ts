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

/**
 * Jellyfin 12.x ha eliminato il supporto per il vecchio header
 * `X-Emby-Token` (e per `?api_key=` in query string) — scoperto sul Wyse
 * reale, dove ogni richiesta veniva rifiutata con 401 nonostante la
 * chiave API fosse corretta. Serve il nuovo schema `Authorization:
 * MediaBrowser Token="..."`, verificato funzionante contro l'istanza
 * reale.
 */
function authHeader(): Record<string, string> {
  return { Authorization: `MediaBrowser Token="${config.jellyfinApiKey}"` };
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
      headers: authHeader(),
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
      headers: { ...authHeader(), ...extraHeaders },
    });
  } catch (err) {
    throw new JellyfinError(`jellyfin_unreachable: ${(err as Error).message}`);
  }
}

// --- Tipi grezzi Jellyfin (solo i campi che ci servono) ---------------------

interface JfMediaStream {
  Type: string; // "Audio" | "Video" | "Subtitle" | ...
  Index: number;
  Language?: string;
  DisplayTitle?: string;
  Title?: string;
  IsDefault?: boolean;
}

interface JfItem {
  Id: string;
  Name: string;
  Type?: string; // "Movie" | "Series" | "Episode" | ...
  ProductionYear?: number;
  Overview?: string;
  Genres?: string[];
  CommunityRating?: number;
  RunTimeTicks?: number;
  IndexNumber?: number;
  SeasonId?: string;
  SeriesId?: string;
  SeriesName?: string;
  MediaSources?: { Id: string; MediaStreams?: JfMediaStream[] }[];
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

const ITEM_FIELDS = "Overview,Genres,ProductionYear,CommunityRating,RunTimeTicks,MediaSources,MediaStreams";
// Sottoinsieme di ITEM_FIELDS: la ricerca globale (§16) restituisce solo
// MediaSummary (mai un dettaglio riproducibile), niente bisogno di
// MediaSources/MediaStreams — che Jellyfin dovrebbe comunque popolare per
// ogni risultato della lista.
const SEARCH_FIELDS = "Overview,Genres,ProductionYear,CommunityRating,RunTimeTicks";

/**
 * Selezione traccia audio (§7): con Direct Play il tag <video> nativo del
 * browser non espone le tracce audio multiple di un contenitore — l'API
 * `HTMLMediaElement.audioTracks` non è implementata da Chromium (solo da
 * Safari, verificato empiricamente con un file reale multi-traccia).
 * La selezione va quindi fatta lato Jellyfin: passare `AudioStreamIndex`
 * allo stream endpoint (senza `static=true`) fa sì che Jellyfin remuxi/
 * trasmetta solo quella traccia, indipendentemente dal supporto del
 * browser — stesso approccio dei client Jellyfin ufficiali.
 */
function toAudioTracks(item: JfItem): AudioTrackInfo[] {
  const streams = item.MediaSources?.[0]?.MediaStreams ?? [];
  return streams
    .filter((s) => s.Type === "Audio")
    .map((s) => ({
      index: s.Index,
      language: s.Language ?? null,
      title: s.DisplayTitle ?? s.Title ?? null,
      isDefault: s.IsDefault ?? false,
    }));
}

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
  return { ...toSummary(item), mediaSourceId: item.MediaSources?.[0]?.Id ?? null, audioTracks: toAudioTracks(item) };
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
      Fields: "Overview,RunTimeTicks,MediaSources,MediaStreams,SeriesId,SeasonId",
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
      audioTracks: toAudioTracks(item),
    };
  } catch (err) {
    if (err instanceof JellyfinError && err.status === 404) return null;
    throw err;
  }
}

export interface MediaSearchResult extends MediaSummary {
  type: "movie" | "series";
}

/** Ricerca globale (§16): Film e Serie in un'unica chiamata a Jellyfin. */
export async function searchMoviesAndSeries(term: string): Promise<MediaSearchResult[]> {
  const data = await jf<JfItemsResponse>("/Items", {
    IncludeItemTypes: "Movie,Series",
    Recursive: "true",
    SearchTerm: term,
    Fields: SEARCH_FIELDS,
    Limit: "20",
  });
  return data.Items.map((item) => ({
    ...toSummary(item),
    type: item.Type === "Series" ? "series" : "movie",
  }));
}

interface JfSession {
  NowPlayingItem?: unknown;
  PlayState?: { IsPaused?: boolean };
}

/**
 * Priorità di banda dinamica (§32): una sessione con una riproduzione
 * attiva e non in pausa conta come "streaming in corso" — usato per
 * ridurre temporaneamente il limite di banda di Download Manager e
 * Backup, che hanno priorità più bassa. GET /Sessions restituisce anche
 * le sessioni inattive: il segnale affidabile è la presenza di
 * NowPlayingItem, non un campo "attivo" a sé.
 */
export async function isStreamingActive(): Promise<boolean> {
  const sessions = await jf<JfSession[]>("/Sessions");
  return sessions.some((s) => s.NowPlayingItem && !s.PlayState?.IsPaused);
}
