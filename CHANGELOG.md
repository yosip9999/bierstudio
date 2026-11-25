# Changelog

## Unveröffentlicht: Fläschle
- Neuer Name **Fläschle** (vorher Bierstudio) in App, Startbildschirm-Name und Icon (ein kleines Fläschle); Docker-Image und Repository heißen weiter `bierstudio`
- Neu: Tab **Weine** zum Merken guter Flaschen: Etikett-Foto (vorne, optional hinten), Weingut, Jahrgang, Farbe, Rebsorte, Region, Alkohol, „Passt zu“, **Preis pro Flasche** und Einkaufsort; Note mit Weinglas, Eindrücke, Notiz
- Weine als Raster aus Etikett-Fotos mit Note und Preis; Suche, Filter nach Farbe, „Nochmal kaufen“ und „Von mir“; sortierbar nach Datum, Note, Preis und Name
- „Nochmal kaufen“ pro Person, auch direkt auf der Wein-Seite umschaltbar
- Wein-Bereich in Bordeaux: ＋-Knopf, Links und Schalter werden rot, das Weinglas füllt sich in der Farbe des Weins
- Übersicht: „Bier eintragen“ und „Wein merken“ nebeneinander, zuletzt gemerkte Weine, Weinnoten im Verlauf; Personenseiten zeigen auch Weine
- Tastings sind von der Tab-Leiste auf die Übersicht gezogen (Karte „Tastings“, laufende Tastings oben als LIVE)
- Löschen von Weinen und Weinnoten mit Papierkorb und Rückgängig; Umbenennen nimmt Weinnoten mit
- Neue Schnellaktion „Wein merken“ für das Homescreen-Icon
- Datenformat: neue Listen `wines` und `wine_ratings`; bestehende Daten laufen ohne Migration weiter

## Unveröffentlicht
- Neues Erscheinungsbild „Kaltes Glas“: kühler, frostiger Hintergrund, weiße Flächen, Stout-Dunkel für Text und Bernstein nur dort, wo Bier ist
- Neu: Beim Bewerten füllt sich ein Glas bis zur Note, mit Schaumkrone, aufsteigenden Perlen und der Farbe des Bierstils (Helles golden, Stout dunkel, Weizen trüb hell …); in Blindverkostungen bleibt die Farbe neutral
- „Was trinkst du gerade?“ als Fläche aus Bier mit Schaumkante; der Eintragen-Knopf in der Tableiste ist jetzt bernsteinfarben
- Überschriften und große Zahlen schmal gesetzt (Instrument Sans, 80 % Laufweite)
- Neue Farben für Bier-Kacheln, Personen und Noten (Hopfen, Bernstein, Kirsch), Dunkelmodus in tiefem Porter statt Delft Blue
- Neues App-Icon: volles Glas mit Schaumkrone
- Bewegung reduziert, wenn das System es wünscht: Perlen und Einschenk-Animation entfallen dann
- Neu: echtes 3D-Glas (Three.js) beim Bewerten und auf der Startseite: Glas mit Spiegelungen, Flüssigkeit in Stilfarbe, Schaumkrone, Perlen, schwappt bei jeder Änderung, lässt sich mit dem Finger drehen und stößt beim Speichern kurz an. Three.js wird erst geladen, wenn ein Glas zu sehen ist; ohne WebGL bleibt das gezeichnete Glas
- Neu: Bewegung mit GSAP: Seitenwechsel wie in iOS (tiefer hinein von rechts, zurück von links), Bierliste sortiert und filtert mit gleitenden Einträgen (Flip), Zahlen zählen hoch, das Tasting-Podium steigt nacheinander auf
- Öffnet sich ein Sheet, tritt die Seite dahinter zurück wie eine Karte im Stapel; Haarlinien auf Retina-Displays
- Server liefert Textdateien gzip-komprimiert aus (Three.js 690 KB → 171 KB)
- Bibliotheken liegen lokal unter `app/static/vendor/` (GSAP 3.12 mit Flip, Three.js r170) und sind offline verfügbar

## v3.0.0
- Neu: Fotos zu jeder Bewertung (werden auf dem Handy verkleinert und auf dem Server gespeichert), Ausschank (Fass/Flasche/Dose) und Ort
- Neu: „Prost!“ – auf Bewertungen der anderen anstoßen
- Neu: Merkliste („Will ich probieren“) pro Person, als Filter unter Biere und auf der Übersicht
- Neu: Brauerei-Seiten mit allen probierten Bieren und Vorschlägen aus dem Katalog
- Bier-Kacheln einheitlich: Marken-Kürzel mit Farbe nach Bierstil statt zusammengewürfelter Logos aus Wikidata und Website-Icons; optional Brauerei-Logos über Logo.dev (Schlüssel per `LOGO_DEV_TOKEN` oder in der App), vom Server in Graustufen geholt und zwischengespeichert; falsche Logos lassen sich pro Brauerei korrigieren (andere Website mit Vorschau oder ausblenden), bekannte Fehlzuordnungen wie corona.com sind vorkorrigiert
- Neu: Namen ändern (Bewertungen, Prost und Merkliste wandern mit)
- Erscheinungsbild: Palette Eggshell, Delft Blue, Sage, Sunset, Terra Cotta mit festen Rollen und geprüftem Kontrast; Hintergrund mit sanftem Verlauf, im Dunkelmodus helleres Delft Blue statt Fast-Schwarz; Glas nur für schwebende Bedienelemente
- Schrift Instrument Sans, lokal eingebunden; Laufweite und Zeilenabstand je nach Größe
- Neues, flaches App-Icon; Emojis in der Oberfläche durch schlichte Linien-Icons ersetzt
- Übersicht zeigt groß das zuletzt bewertete Bier statt des laufenden Tastings
- Katalog von 87 auf über 1.700 Biere erweitert: 338 von Hand gepflegt, über 1.400 aus Open Food Facts (ODbL) mit Import-Skript `tools/import_off.py`; knapp 2.000 Barcodes für den Scanner ohne Internet
- Online-Suche zuverlässiger: neue Such-API von Open Food Facts (alte nur noch als Ausweichweg), Wiederholung bei Aussetzern, Cache auf der Platte mit Rückgriff auf das letzte Ergebnis, UPCitemdb für Barcodes, keine Kontakt-E-Mail mehr nötig
- Neue Oberfläche: Landing-Page, Übersicht mit „Was trinkst du gerade?“, Feed, Bestenliste; Tastings sind ein eigener Bereich statt der Startseite
- Neu: Leute-Liste und Personenseiten mit allen bewerteten Bieren, Statistik und Geschmacksverwandtschaft
- Neu: Navigation über Adressen (#/biere, #/bier/…, #/person/…, #/tasting/…), Zurück funktioniert überall
- Bier-Zuordnung überarbeitet: Server und App erkennen dasselbe Bier über Umlaute, Satzzeichen, Wortreihenfolge, Füllwörter, Schreibvarianten, Barcode und Katalog-Spitznamen; die Suche verzeiht Tippfehler
- Neu: „Meinst du …?“ vor dem Anlegen, Doppelte finden und zusammenführen (API `beer/merge`, rückgängig über den Papierkorb)
- Bottom-Sheets lassen sich nach unten wegziehen; reduzierte Bewegung, Transparenz und erhöhter Kontrast werden berücksichtigt
- Datenformat unverändert (Version 3): bestehende Daten laufen ohne Migration weiter

## v2.1.1
- Logos: Fehlversuche bei Netzproblemen werden nach 10 Minuten wiederholt (statt 7 Tagen), echte Fehltreffer nach einem Tag
- Logos: Website der Brauerei wird zusätzlich unter www. versucht und notfalls aus Wikidata übernommen
- User-Agent enthält eine Kontaktangabe (Pflicht bei Wikimedia), auch ohne hinterlegte E-Mail
- Neuer Knopf „Logos erneut suchen“ unter Mehr → Produktsuche

## v2.1.0
- Hinterlegter Bier-Katalog (offline), weltweite Suche über Wikidata und Open Food Facts, Brauerei-Logos
- „Fehlende Infos ergänzen“ für das ganze Bierbuch
- Papierkorb (30 Tage), Rückgängig nach dem Löschen, Server-Sicherungen zum Zurückspringen – für alle, ohne Admin
- Eigene Dialoge statt Browser-Popups
- Container übernimmt den Datenordner selbst (PUID/PGID), kein manuelles chown mehr
- Fix: JSON-Backup-Download war doppelt kodiert

## v2.0.0
- Komplett überarbeitet: globales Bierbuch, Solo-Bewertungen, Live-„Im Glas“, echte Blindverkostung, PWA, Offline-Warteschlange, Docker/TrueNAS
