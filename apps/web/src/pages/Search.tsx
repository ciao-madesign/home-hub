import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type SearchResultItem } from "../api/client";
import { IconFilm, IconFolder, IconGamepad, IconImage, IconTv } from "../components/icons";

const TYPE_LABELS: Record<SearchResultItem["type"], string> = {
  movie: "Film",
  series: "Serie",
  photo: "Foto",
  game: "Giochi",
  file: "File",
};

const TYPE_ICONS: Record<SearchResultItem["type"], typeof IconFilm> = {
  movie: IconFilm,
  series: IconTv,
  photo: IconImage,
  game: IconGamepad,
  file: IconFolder,
};

const TYPE_ORDER: SearchResultItem["type"][] = ["movie", "series", "photo", "game", "file"];

export function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setResults(null);
    setError(null);
    api
      .search(q)
      .then((r) => setResults(r.results))
      .catch(() => setError("Ricerca non riuscita. Riprova."));
  }, [q]);

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: results?.filter((r) => r.type === type) ?? [],
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>
        {q ? `Risultati per «${q}»` : "Ricerca"}
      </h1>

      {!q.trim() && (
        <p style={{ color: "var(--text-faint)" }}>Digita qualcosa nella barra di ricerca in alto.</p>
      )}

      {error && <p style={{ color: "var(--status-problem)" }}>{error}</p>}

      {q.trim() && results === null && !error && (
        <p style={{ color: "var(--text-faint)" }}>Ricerca in corso…</p>
      )}

      {q.trim() && results !== null && results.length === 0 && (
        <p style={{ color: "var(--text-faint)" }}>Nessun risultato per «{q}».</p>
      )}

      {grouped.map(({ type, items }) => {
        const Icon = TYPE_ICONS[type];
        return (
          <div key={type} style={{ marginBottom: 24 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                margin: "0 0 10px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--text-muted)",
              }}
            >
              <Icon style={{ width: 16, height: 16 }} />
              {TYPE_LABELS[type]}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={item.url}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    fontSize: 14,
                  }}
                >
                  <span>{item.title}</span>
                  {item.subtitle && <span style={{ color: "var(--text-faint)", fontSize: 13 }}>{item.subtitle}</span>}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
