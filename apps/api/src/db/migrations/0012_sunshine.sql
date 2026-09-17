-- Integrazione reale con Sunshine (§10, proposta aperta chiusa — vedi
-- docs/SPECIFICHE.md): dal solo Wake-on-LAN + probe TCP al vero pairing
-- GameStream (PIN + certificato TLS client) e avvio remoto di un'app.

-- sunshine_port: porta base GameStream configurata su quella macchina
-- (NULL = usa il default, HUB_SUNSHINE_DEFAULT_PORT/47989). La porta
-- HTTPS è sempre base-5 per convenzione del protocollo stesso.
ALTER TABLE machines ADD COLUMN sunshine_port INTEGER;
-- sunshine_server_cert: certificato PEM dell'host Sunshine, pinnato al
-- pairing riuscito — usato come CA per ogni chiamata HTTPS successiva
-- (mai una verifica TLS "alla cieca", §26). NULL = non ancora accoppiata.
ALTER TABLE machines ADD COLUMN sunshine_server_cert TEXT;

-- sunshine_app_id: l'app configurata lato Sunshine (nel suo Web UI, fuori
-- dal controllo dell'Hub) a cui questo gioco del catalogo corrisponde —
-- l'elenco app va scoperto via GET /applist dopo il pairing, non inventato.
ALTER TABLE games ADD COLUMN sunshine_app_id TEXT;
