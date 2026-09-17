/**
 * Le risposte XML di Sunshine sono sempre piatte (un solo livello di tag,
 * senza namespace — vedi nvhttp.cpp del progetto Sunshine) — un parser XML
 * completo sarebbe una dipendenza in più per un solo scopo mirato:
 * un'estrazione per nome di tag basta.
 */
export function extractXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : null;
}

/**
 * Non sempre un vero codice HTTP: Sunshine può scrivere -1 per un fallimento
 * di avvio dell'app (comando di preparazione fallito, spawn fallito) — va
 * trattato come intero con segno, mai assunto positivo o mappato 1:1 su un
 * codice di stato HTTP reale (che è comunque sempre 200 a parte 404, vedi
 * transport.ts/client.ts).
 */
export function extractStatusCode(xml: string): number | null {
  const match = xml.match(/status_code="(-?\d+)"/);
  return match ? Number(match[1]) : null;
}

export function extractStatusMessage(xml: string): string | null {
  const match = xml.match(/status_message="([^"]*)"/);
  return match ? match[1] : null;
}

export interface XmlApp {
  id: string;
  title: string;
}

/** Estrae ogni blocco <App>...</App> di /applist (elenco app configurate lato Sunshine). */
export function extractApps(xml: string): XmlApp[] {
  const apps: XmlApp[] = [];
  const appRegex = /<App>([\s\S]*?)<\/App>/g;
  let match: RegExpExecArray | null;
  while ((match = appRegex.exec(xml))) {
    const id = extractXmlTag(match[1], "ID");
    const title = extractXmlTag(match[1], "AppTitle");
    if (id && title) apps.push({ id, title });
  }
  return apps;
}
