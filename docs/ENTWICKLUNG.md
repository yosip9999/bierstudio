# Entwicklung

Bierstudio kommt ohne Build-Schritt und ohne Abhängigkeiten aus: Der Server nutzt nur die Python-Standardbibliothek, das Frontend ist reines HTML, CSS und JavaScript.

```
app/
  server.py          HTTP-Server, Datenhaltung, Aktionen, Migration, Sicherungen, Papierkorb
  lookup.py          Wikidata-Suche und Brauerei-Logos
  static/
    index.html       App-Shell
    app.js           komplette Oberfläche (Event-Delegation über data-act / data-on, CSP-tauglich)
    app.css          Design-Tokens, hell/dunkel
    catalog.json     hinterlegter Bier-Katalog (aus tools/catalog.tsv erzeugt)
    sw.js            Service Worker (App-Shell offline, immer zuerst Netz)
    manifest.webmanifest, icons/, vendor/qrcode.js
tools/               Katalog-Quelle und Konverter
truenas/             YAML-Vorlagen für TrueNAS
```

## Lokal starten

```bash
python3 app/server.py
```

Die App läuft dann unter http://localhost:8000, die Daten liegen in `./data`. Mit `LOG_REQUESTS=1` protokolliert der Server jede Anfrage.

## Datenmodell (Version 3)

```jsonc
{
  "version": 3,
  "rev": 42,                       // steigt bei jeder Änderung, Clients fragen mit ?since=rev
  "people": ["Alex", "Sam"],
  "beers": [{ "id": "16 hex", "name": "", "brewery": "", "style": "", "abv": 5.2,
              "country": "DE", "site": "rothaus.de", "barcode": "", "image": "", "source": "katalog",
              "created_by": "Alex", "created_at": "ISO" }],
  "sessions": [{ "id": "", "name": "", "date": "YYYY-MM-DD", "place": "", "people": [],
                 "beers": ["bier-id", "..."], "reveal": true, "closed": false, "current": "bier-id" }],
  "ratings": [{ "beer": "", "user": "", "session": "abend-id oder null (Solo)", "value": 7.5,
                "detail": { "Aussehen": 4, "...": 3 } | null, "tags": [], "note": "", "favorite": false, "ts": "ISO" }],
  "active": "abend-id",            // „LIVE“-Abend
  "settings": { "off_contact": "" },
  "trash": [{ "tid": "", "kind": "beer|session|rating", "at": "ISO", "by": "", "label": "", "...": "gelöschte Daten" }]
}
```

Eine Bewertung ist eindeutig über `(beer, user, session)`. Biere sind global (Bierbuch). Ein Abend verweist nur auf sie.

## API

Alle Antworten sind JSON. Schreibende Aufrufe sind `POST` mit JSON-Body. Fremde `Origin`-Header werden abgelehnt.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/state?user=&since=` | Daten (bei Blindverkostung serverseitig gefiltert); `{unchanged:true}`, wenn `since` aktuell ist |
| GET | `/api/lookup?q=` | Weltweite Suche (Wikidata + Open Food Facts), nach spätestens 12 s mit Teilergebnis |
| GET | `/api/off/barcode?code=` | Produkt per Barcode: Open Food Facts, dann Such-API, dann UPCitemdb → `{products, notes}` |
| GET | `/api/logo?s=<domain>` | Brauerei-Logo von Logo.dev (128 px, Graustufen, zwischengespeichert) oder 404; braucht `LOGO_DEV_TOKEN` bzw. den Schlüssel aus den Einstellungen |
| GET | `/api/backups` | Liste der Server-Sicherungen |
| GET | `/api/backup` | Komplettes JSON-Backup |
| GET | `/api/csv?session=<id>\|all&user=` | CSV-Export |
| GET | `/healthz` | Health-Check |
| POST | `/api/person` | `{name}` |
| POST | `/api/rate` | `{beer, user, session, value \| detail, tags, note, favorite}` |
| POST | `/api/rating/delete` | `{beer, user, session}` → `{tid}` |
| POST | `/api/beer` | Anlegen (dasselbe Bier wird wiederverwendet, siehe „Bier-Zuordnung“) oder mit `id` bearbeiten |
| POST | `/api/beer/delete` | `{id, user}` → `{tid}` |
| POST | `/api/beer/merge` | `{keep, drop, user}` → `{tid}`: `drop` geht in `keep` auf (Bewertungen, Tastings, leere Felder) |
| POST | `/api/session` | `{new}` oder `{id}` plus Felder, `reveal`, `closed`, `current` |
| POST | `/api/session/beers` | `{session, op: add\|remove\|move, id, dir}` |
| POST | `/api/session/delete` | `{id, user}` → `{tid}` |
| POST | `/api/active` | LIVE-Abend setzen |
| POST | `/api/trash/restore` | `{tid}` |
| POST | `/api/backup/restore` | `{name}` (aktueller Stand wird vorher gesichert) |
| POST | `/api/restore` | Komplettes Backup einspielen (auch Version 1/2) |
| POST | `/api/settings` | `{off_contact}` |

Schlägt eine Aktion fehl, wird der Stand im Speicher zurückgerollt, damit nichts halb geändert bleibt.

## Online-Quellen

`net_json()` in `server.py` holt jede Antwort mit zwei Versuchen und legt sie in `DATA_DIR/cache/lookup.json` ab (bis 1500 Einträge, 60 Tage). Ist eine Quelle gerade weg, kommt das letzte bekannte Ergebnis zurück.
Open Food Facts wird über die Such-API `search.openfoodfacts.org` abgefragt; die alte `cgi/search.pl` antwortet häufig mit 503 und dient nur noch als Ausweichweg.

## Bier-Zuordnung

`beer_key()` in `server.py` und `beerKey()` in `app.js` sind identisch: Kleinschreibung, Umlaute (ä→ae, ß→ss), Akzente und Satzzeichen weg, Füllwörter (`bier`, `brauerei`, `premium`, `original` …) weg, Varianten vereinheitlicht (`pilsener`→`pils`, `helles`→`hell`, `hefeweissbier`→`weizen`, `0,0`/`alkoholfrei`→`af`), Wörter sortiert.
Beim Anlegen gilt ein Bier als vorhanden bei gleichem Barcode, gleichem Schlüssel oder wenn beide Namen zum selben Katalog-Eintrag gehören (Name oder Spitzname).
Die unscharfe Suche im Frontend (`simTokens`) vergleicht Wort für Wort mit Präfix, Tippfehler-Toleranz (Levenshtein inkl. Buchstabendreher) und Teilwörtern. Sie schlägt nur vor; zusammengeführt wird nie automatisch.

## Frontend-Prinzipien

- Alle Klicks laufen über `data-act="name"` → `ACT.name(el)`, Eingaben über `data-on` / `data-change`. Es gibt keine Inline-Handler, deshalb gilt eine strikte Content-Security-Policy.
- Navigation über den Hash: `#/`, `#/biere`, `#/bier/<id>`, `#/leute`, `#/person/<name>`, `#/tastings`, `#/tasting/<id>`, `#/ich`.
- Abfrage alle 4 s mit `?since=rev`. Neu gezeichnet wird nur bei Änderungen und nie, während jemand tippt.
- Offline-Warteschlange (`localStorage: bs-outbox`) für Bewertungen und neue Biere.
- Entwürfe von Bewertungen bleiben pro Bier und Person erhalten, bis sie gespeichert werden.

## Katalog bauen

```bash
python3 tools/build_catalog.py
```
