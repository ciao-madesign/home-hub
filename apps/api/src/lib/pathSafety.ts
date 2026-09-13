export class UnsafePathError extends Error {
  constructor(message = "Percorso non valido") {
    super(message);
  }
}

/**
 * Rifiuta segmenti "." o ".." per impedire di uscire dalla root prevista,
 * quale che sia (Files/, Games/, ecc.). Usata ovunque un percorso relativo
 * arrivi da input utente prima di un path.join con una root sul disco.
 */
export function assertSafeRelativePath(relPath: string): string[] {
  const segments = relPath.split("/").filter((s) => s.length > 0);
  for (const seg of segments) {
    if (seg === "." || seg === "..") throw new UnsafePathError();
  }
  return segments;
}
