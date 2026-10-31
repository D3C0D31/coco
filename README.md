# AutoPot Grow

Grow-Tagebuch für passive AutoPot-Systeme (AirBase + AirDome, 50/50 Coco/Perlite, mineralische Nährlösung) – als Website mit Benutzerkonten und verschlüsselter Cloud-Synchronisation, installierbar als App auf Handy und Rechner.

**Version 1.0.0-rc.2** (Release Candidate, für den Testlauf im Einladungsmodus) – Änderungen und bekannte Grenzen: [CHANGELOG.md](CHANGELOG.md).

| Seite | Zweck |
|---|---|
| `/` (`index.html`) | Landingpage mit Funktionen, Sicherheit, FAQ, Registrieren/Anmelden |
| `/app` (`app.html`) | Die Grow-App (läuft auch ohne Konto, dann nur lokal im Browser) |
| `/anleitung` (`anleitung.html`) | Meisteranleitung mit 20 Kapiteln, druckfreundlich |
| `/news` (`news.html`) | Öffentliche News mit Atom-Feed (`/news/feed.xml`) |
| `/share.html#…` | Öffentlich geteilter Grow (Momentaufnahme, mit Melde-Funktion) |
| `/admin` (`admin.html`) | Team-Bereich für Moderatoren und Admins (nur mit Zwei-Faktor-Anmeldung) |
| `/datenschutz`, `/impressum`, `/nutzungsbedingungen` | **Vorlagen** – vor dem Livegang ausfüllen und rechtlich prüfen lassen |

**Zum Online-Stellen bitte [DEPLOY.md](DEPLOY.md) lesen** (Docker Compose + Caddy, Cloudflare, Sicherungen, Überwachung, Checkliste). Sicherheitskonzept und Grenzen: [SECURITY.md](SECURITY.md).

## Schnellstart

Voraussetzung: **Node.js ≥ 22.13** (siehe `.nvmrc`). Es gibt **keine Fremdpakete** – kein `npm install` nötig, um den Server zu betreiben.

```
npm start                         # oder: node server/server.js
# → http://localhost:8080
```

Daten landen in `server-data/` (SQLite-Datenbank + Server-Geheimnis). Diesen Ordner sichern, aber nie ins Git einchecken (steht in `.gitignore`).

### Konfiguration (Umgebungsvariablen, siehe `.env.example`)

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Adresse |
| `DATA_DIR` | `./server-data` | Ort der Datenbank |
| `REGISTRATION` | `open` | `open` = jede/r (mit Bot-Schutz), `invite` = nur mit Einladungscode, `closed` = keine neuen Konten |
| `POW_BITS` | `16` | Schwierigkeit der Rechenaufgabe gegen Bots bei offener Registrierung (ca. 0,1–1 s im Browser), `0` = aus |
| `MAX_USERS` / `REG_DAILY_MAX` | `0` / `50` | Höchstzahl Konten (0 = unbegrenzt) / neue Konten pro 24 h |
| `USER_QUOTA_MB` | `200` | Speicher pro Konto |
| `CLIENT_IP_HEADER` | – | Nur hinter Cloudflare: `cf-connecting-ip` (siehe DEPLOY.md) |
| `METRICS_TOKEN` | – | Aktiviert `/api/metrics` (Prometheus) mit `Authorization: Bearer …` |
| `LOG` | `on` | Zugriffsprotokoll ohne IP-Adressen auf stdout |
| `PUBLIC_URL` | – | Öffentliche Adresse für Links im News-Feed |
| `STAFF_REQUIRE_2FA` | `1` | Team-Bereich nur mit Zwei-Faktor-Anmeldung |
| `TRUST_PROXY` | `0` | `1` hinter einem Reverse-Proxy mit HTTPS (Render, Fly, Caddy, nginx). Nötig für `Secure`-Cookies und korrekte IP-Begrenzung |
| `SESSION_DAYS` | `30` | Laufzeit einer Anmeldung ab der letzten Nutzung |
| `SESSION_MAX_DAYS` | `90` | Höchstdauer einer Anmeldung, danach immer neu anmelden |
| `API_RATE_PER_MIN` | `300` | Anfragen pro Minute und IP bzw. Konto |
| `KDF_CONCURRENCY` | `4` | Gleichzeitige Passwort-Berechnungen (scrypt, je 32 MB RAM); weitere warten in einer Schlange |
| `BACKUP_KEEP` | `14` | Anzahl aufbewahrter Datenbank-Sicherungen (`npm run backup`) |
| `AUTOPOT_SECRET` | – | Mind. 32 Zeichen. Ohne Angabe wird `server-secret.key` erzeugt. **Nie nachträglich ändern**, sonst findet der Server die Konten nicht mehr |

## Online stellen

**Pflicht: HTTPS.** Ohne HTTPS sind Passwörter auf dem Weg ungeschützt, und die App lässt sich nicht installieren.

- **Empfohlen – eigener Server mit Docker Compose:** `cp .env.example .env`, Werte eintragen, `docker compose up -d --build`. Startet App, Caddy (automatisches HTTPS) und eine tägliche Sicherung mit Wiederherstellungsprobe. Container laufen schreibgeschützt, ohne Root-Rechte und mit Speicherlimit. Details in DEPLOY.md.
- **Render.com:** `render.yaml` liegt bei (Docker + persistenter Speicher). Persistenter Speicher braucht einen bezahlten Plan; ohne ihn gehen bei jedem Neustart alle Konten verloren.
- **Nur statisch (GitHub Pages):** funktioniert ebenfalls, dann aber **ohne Konten** – die App merkt das und blendet den Konto-Knopf aus.

Vor dem Livegang: `impressum.html`, `datenschutz.html`, `nutzungsbedingungen.html` und `.well-known/security.txt` mit echten Angaben füllen (Platzhalter in eckigen Klammern) und rechtlich prüfen lassen.

### Datenbank sichern

```
npm run backup                    # konsistente Kopie nach server-data/backups/, mit Integritätsprüfung
```

Läuft im Betrieb (`VACUUM INTO`), behält die letzten 14 Sicherungen. `npm run restore-test` startet einen Server auf der neuesten Sicherung und prüft ihn (Wiederherstellungsprobe); `node server/restore.js <Datei> --yes` stellt wirklich wieder her.

### Team-Bereich (Admin-/Moderations-Panel)

Ersten Admin auf dem Server festlegen: Konto in der App anlegen, Zwei-Faktor-Anmeldung aktivieren, dann `npm run admin -- find deine@mail.de` und `npm run admin -- role <ID> admin` (optional `name <ID> "Redaktion"`). Danach unter `/admin`:

- **Übersicht:** Kennzahlen und 30-Tage-Diagramme (Registrierungen, Anmeldungen, Fehlversuche)
- **Nutzer:** Suche per ID oder vollständiger E-Mail, Filter (Team, gesperrt, inaktiv), sperren/entsperren, überall abmelden, Rolle ändern und löschen (nur Admin)
- **News:** Beiträge mit Vorschau, Entwürfen und Anheften
- **Meldungen:** gemeldete geteilte Grows ansehen, ausblenden, verwerfen, löschen
- **Einladungen, Einstellungen** (Registrierungsmodus, Limits, Speicher, Teilen an/aus, Ankündigung – sofort wirksam), **Team-Protokoll** (nur Admin)

### Verwaltung auf der Kommandozeile

`npm run admin -- stats` · `invite create --uses 3 --days 7` · `users` · `find <email>` · `disable <ID>` · `delete <ID> --yes` · `purge-inactive 730 --yes` · `role <ID> admin|moderator|user` · `name <ID> "Anzeigename"` – Übersicht in DEPLOY.md, Abschnitt 7. Inhalte der Nutzer sind auch hier nicht lesbar. Die Sicherung ist genauso verschlüsselt wie die Datenbank; zum Anmelden wird zusätzlich `server-secret.key` bzw. `AUTOPOT_SECRET` gebraucht – getrennt aufbewahren. Per Cron z. B. täglich: `0 3 * * * cd /app && npm run backup`.

## Sicherheit

| Thema | Umsetzung |
|---|---|
| Passwörter | scrypt (N = 2¹⁵, r = 8), nie im Klartext gespeichert; mind. 10 Zeichen |
| Daten im Ruhezustand | AES-256-GCM mit zufälligem 256-Bit-Schlüssel pro Nutzer (DEK); jeder Datensatz mit eigener Zufalls-IV und Zuordnung zum Nutzer (AAD) |
| Schlüsselschutz | DEK verschlüsselt mit einem aus dem Passwort abgeleiteten Schlüssel, zusätzlich mit dem Wiederherstellungscode (160 Bit). Pro Sitzung wird der DEK mit einem Schlüssel aus dem Cookie-Token verpackt – in der Datenbank steht nur der Hash des Tokens |
| E-Mail-Adressen | nur als HMAC-SHA-256-Blindindex gespeichert, nie im Klartext |
| Sitzungen | 256-Bit-Token, Cookie `HttpOnly`, `SameSite=Strict`, `Secure` + `__Host-`-Präfix unter HTTPS |
| CSRF | SameSite-Cookie + Pflicht-Header `X-Requested-With` + Origin-Prüfung |
| Zwei-Faktor | Optional per TOTP (RFC 6238, jede Authenticator-App), Schlüssel AES-verschlüsselt mit dem Nutzerschlüssel, ±30 s Toleranz, jeder Code nur einmal gültig. QR-Code wird ohne Fremdbibliothek im Browser erzeugt |
| Missbrauch | Begrenzung pro IP und Konto (alle Anfragen, Registrierung, Login, Wiederherstellung), Sperre 15 min nach 8 Fehlversuchen pro Konto **und IP** sowie nach 40 Fehlversuchen pro Konto insgesamt – ein Angreifer kann die Inhaberin so nicht aussperren. Gleiche Antwortzeit für unbekannte Konten. Warteschlange für scrypt gegen Überlastung |
| Geräte & Protokoll | Liste aller Anmeldungen mit (verschlüsselter) Gerätebezeichnung, einzelne oder alle anderen Geräte abmelden; Sicherheitsprotokoll (letzte 60 Ereignisse, ohne IP) mit Warnung bei Fehlversuchen. Sitzungen laufen nach 30 Tagen Inaktivität, spätestens nach 90 Tagen ab |
| Passwörter (Regeln) | mind. 10 Zeichen, keine Allerweltspasswörter, nicht die E-Mail-Adresse; Stärkeanzeige beim Eintippen |
| Backups | Optional mit eigenem Passwort verschlüsselt (PBKDF2-SHA-256 mit 600 000 Runden, AES-256-GCM, im Browser per Web Crypto) |
| Browser | strikte CSP (`script-src 'self'`, keine Inline-Skripte), `nosniff`, `frame-ancestors 'none'`, HSTS unter HTTPS, `Permissions-Policy`, keine Drittanbieter |
| Anfragen | nur JSON (`415` sonst), Größenlimits, Prüfung von `Origin` und `Sec-Fetch-Site`, URL-Länge begrenzt, Zeitlimits gegen langsame Verbindungen |
| Dateifreigabe | Server liefert nur eine feste Liste öffentlicher Dateien aus (Datenbank, Server-Code, Tests sind nicht abrufbar) |
| Datenschutz | Export aller Daten und endgültiges Löschen des Kontos in der App |

**Grenzen (ehrlich):** Der Server sieht das Passwort beim Anmelden kurz im Arbeitsspeicher. Es ist Verschlüsselung der gespeicherten Daten, keine Ende-zu-Ende-Verschlüsselung gegenüber dem Betreiber. Wer Passwort **und** Wiederherstellungscode verliert, verliert die Daten – das ist gewollt. Der Server kann keine E-Mails senden (er kennt die Adressen nicht), deshalb gibt es kein „Passwort per Mail zurücksetzen“.

## Synchronisation

- Offline zuerst: Die App speichert immer lokal (localStorage, Fotos in IndexedDB) und überträgt Änderungen 1,5 s später verschlüsselt zum Server; offline gesammelte Änderungen werden nachgeholt.
- Mehrere Geräte: Versionsnummern erkennen gleichzeitige Änderungen; Einträge, Rezepte, Ereignisse, Erinnerungen und Archiv werden dann zusammengeführt, bei Einstellungen gewinnt das Gerät, das zuletzt speichert. Löschungen werden als Löschmarker mitsynchronisiert (180 Tage aufbewahrt), damit gelöschte Einträge nicht auf anderen Geräten wiederauftauchen.
- Fotos werden einzeln übertragen und erst bei Bedarf auf neue Geräte geladen.
- Beim ersten Anmelden werden vorhandene lokale Daten ins Konto übernommen. Beim Abmelden fragt die App, ob die Daten vom Gerät entfernt werden sollen (auf fremden Geräten: ja). Daten eines anderen Kontos auf demselben Gerät werden nie ins neue Konto übernommen.

## API (kurz)

`POST /api/register | /api/login (optional `totp`) | /api/recover | /api/logout | /api/password`, `POST /api/2fa/setup | /api/2fa/enable | /api/2fa/disable`, `GET /api/sessions`, `DELETE /api/sessions/:id | /api/sessions/others`, `GET /api/security-log`, `GET /api/session | /api/me | /api/export`, `GET/PUT /api/state` (mit `baseVersion`, 409 bei Konflikt), `GET /api/photos`, `GET/PUT/DELETE /api/photos/:id`, `GET /api/news`, `GET /api/news/:id`, `POST/GET/DELETE /api/shares…` (teilen, öffentlich lesen, melden), `/api/admin/*` (Team-Bereich), `POST /api/recovery-code`, `GET /api/challenge` (Bot-Schutz), `DELETE /api/account`, `GET /api/health | /api/config | /api/metrics`. Alle schreibenden Anfragen brauchen `X-Requested-With: autopot`.

## Funktionen der App

**Heute-Karte** (Messung fällig, Erinnerungen, Tank, Fahrplan-Woche) · **News-Vorschau** mit Ungelesen-Zähler und Ankündigungen · Übersicht mit Tageszähler, Phasenleiste, Grow-Score, Messserie, **Ernteprognose** (Blütewoche, voraussichtlicher Erntetermin) und **Tipp passend zur Phase** · **Wochenbericht** (Ø-Werte mit Trend zur Vorwoche, Zuwachs, Zielquote) · „Letzte Werte übernehmen“ beim Eintragen, Löschen mit **Rückgängig** · Messprotokoll mit Höhe, Schnell-Tags, Suche und Filtern · Diagramme mit Zielband und Zeitraum · Foto-Galerie · Rechner (VPD, EC/Dünger, pH, Mischung, Tank, EC⇄PPM, DLI, **Stromkosten**, VPD-Heatmap) · **Grow-Fahrplan** (Woche für Woche: Phase, Licht, Zielwerte) · **Sortenbibliothek** (Typ, Züchter, Blütedauer → Prognose) · **Trendwarnungen** (pH-Drift, Salzaufbau, warmes Wasser, Schimmelgefahr) · **Hygrometer-CSV-Import** (Govee, Inkbird …, °F werden umgerechnet) · **Vorher/Nachher-Vergleich** mit Schieberegler · **Grow teilen** per Link · **Wissen**: Richtwerte-Tabelle je Phase, Nährstoff-Lexikon (mobil/immobil, Anzeichen, Ursachen), Glossar · Tankwechsel-Assistent · Ernte & Archiv · Rezepte, Timeline, Erinnerungen (mit .ics-Export), Diagnose, Checklisten · JSON-Backup (mit Fotos, optional passwortverschlüsselt), CSV-Export/-Import · Dunkelmodus · installierbar und offline nutzbar.

### Datenformat (Schema v7)

```
{ version, settings{name, phase, strainId, startDate, phaseStart, flowerStart, flowerWeeks, lightHours, tankSize, tankRest, dailyUse, tankInterval, lastTankChange, lastBackup, entriesSinceBackup},
  entries[{id, date, phase, ec, ph, waterTemp, airTemp, humidity, ppfd, use, height, tags, note, hasPhoto}],
  recipes[], events[], reminders[], checks{setup{}, week{}},
  harvest{date, wet, dry, watt, note}, archive[{id, name, start, end, entries, days, wet, dry, watt, avgEc, avgPh}],
  strains[{id, name, breeder, type, flowerWeeks, notes}],
  deleted{entries{}, recipes{}, events{}, reminders{}, archive{}, strains{}} }   // Löschmarker: id → Zeitpunkt
```

Backups älterer Versionen werden beim Import ergänzt. `data/autopot-grow-backup.json` enthält den bisherigen Datenstand zum Import.

## Aufbau des Codes

Kein Build-Schritt, keine Fremdpakete. Die App besteht aus klassischen Skripten in `js/`, die sich einen gemeinsamen Skript-Bereich teilen – dadurch läuft sie weiterhin auch per Doppelklick (`file://`). Die **Reihenfolge in `app.html` ist wichtig**:

| Datei | Inhalt |
|---|---|
| `js/core.js` | Konstanten und Richtwerte (`PROFILE`), Hilfsfunktionen, Datenmodell (`normalize`, `load`, `save`), Foto-Speicher (IndexedDB) |
| `js/analysis.js` | Bewertung: Zielbereiche, Grow-Infos, Score, Serie, Auffälligkeiten und Trendwarnungen |
| `js/views.js` | Übersicht, Protokoll-Tabelle, Galerie |
| `js/charts.js` | Diagramme (Canvas, Zielband, Zeitraum, Tooltip) |
| `js/tools.js` | Rechner, VPD-Heatmap, Ernte & Archiv, Erinnerungen und Kalenderexport, Diagnose, Checklisten |
| `js/data.js` | Eingabeformular, Export/Import (JSON, CSV), Einstellungen, Theme, Dialoge, Navigation |
| `js/features.js` | Wissen, Wochenbericht, Prognose, Strom, verschlüsseltes Backup, Sorten, Fahrplan, Heute, News, Teilen, Hygrometer-Import, Vorher/Nachher |
| `js/cloud.js` | Konto und Synchronisation, Anmeldung, Zwei-Faktor, Geräte, Sicherheitsprotokoll |
| `js/main.js` | Ereignis-Verteilung und `init()` – immer zuletzt laden |

Dazu kommen eigenständige Seiten-Skripte (`site.js`, `news.js`, `share.js`, `admin.js`, `anleitung.js`) und kleine Bibliotheken ohne Abhängigkeiten (`qr.js`, `newsfmt.js`, `pow-worker.js`). Server: `server/server.js` (Kern, Konten, Daten), `server/routes.js` (News, Teilen, Team-Bereich), `server/crypto.js`, `server/totp.js`, `server/db.js` (Schema und Migrationen), dazu `admin.js`, `backup.js`, `restore.js` für die Kommandozeile.

Neue Funktion einbauen: Logik in die passende Datei, Bedienelemente in `app.html`, Verdrahtung in `init()` (`js/main.js`), dann einen Test in `tests/` ergänzen.

## Tests

```
npm install            # nur für die Browser-Tests (Playwright)
npm test               # Server-Tests, App-Tests, End-to-End mit zwei Geräten
```

- `tests/server.test.js` (21 Testgruppen) – Team-Bereich mit Rollen und 2FA-Pflicht, News inkl. Feed, Freigaben und Meldungen, Bot-Schutz, Altersbestätigung, Einladungen, Verwaltungswerkzeug, Kontingent, gesperrte Konten, dauerhafte Sperren, Metriken, Wiederherstellungsprobe, Registrierung, Login, Sperre pro Konto+IP, Verschlüsselung in der Datenbankdatei, Trennung der Nutzer, CSRF, Dateifreigabe, Passwortwechsel, Wiederherstellung, Zwei-Faktor (inkl. RFC-Testvektoren und Replay-Schutz), Geräte, Protokoll, Härtung, Backup-Skript, Export, Löschen
- `tests/smoke.test.js` (123) – Sorten, Fahrplan, Heute-Karte, Trends, Hygrometer-Import, Vorher/Nachher, Überlauf-Prüfung bis 320 px, Eingabeprüfung, App und Anleitung (Import/Export, verschlüsseltes Backup, Fotos, Diagramme, Rechner, Stromkosten, Wochenbericht, Ernteprognose, Rückgängig, Wissen, Offline, Mobilansicht)
- `tests/e2e.test.js` (62) – News in der App, Grow teilen und melden, Moderation im Panel, Abmelden offline, Altbestände, Löschungen über Geräte hinweg, Einladungsmodus, Landingpage, Registrierung im Browser, Sync von Einträgen und Fotos zwischen zwei Geräten, Zusammenführen, Geräte abmelden, Sicherheitsprotokoll, Passwortwechsel, Zwei-Faktor im Browser (QR-Code wird mit OpenCV gegengelesen, falls vorhanden), Abmelden, Konto löschen

- `tests/load.js` – Lasttest (`npm run test:load`). Ergebnis auf 2 CPU-Kernen: ~1 500 Anfragen/s an die Daten-API (p95 56 ms, keine Fehler), 40 gleichzeitige Logins in 1,3 s, ~265 MB RAM.

Barrierefreiheit und Kompatibilität: „Zum Inhalt springen“-Link, Beschriftungen für alle Bedienelemente, Kontraste nach WCAG AA (≥ 4,5:1 für Text) in beiden Farbschemata geprüft, Ersatzfarben für Browser ohne `color-mix()` (z. B. iOS < 16.2), reduzierte Bewegung wird respektiert.

## Richtwerte

Alle Zielbereiche stammen aus der Anleitung (Kapitel 7, 9, 10) und sind Orientierungswerte ohne Gewähr. Der EC-Rechner nutzt ein grobes Modell (1 ml/L ≈ 0,5 EC); die Herstellerangabe hat Vorrang.
