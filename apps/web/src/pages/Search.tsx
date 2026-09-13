import { useSearchParams } from "react-router-dom";
import { SectionStub } from "../components/SectionStub";

export function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";

  return (
    <SectionStub
      title={q ? `Risultati per «${q}»` : "Ricerca"}
      description="Ricerca globale unica su Film, Serie, Foto, Musica, Giochi e File — funzionante anche offline sui metadati locali."
      phase="Fase 4/5 — Web App e Media"
    />
  );
}
