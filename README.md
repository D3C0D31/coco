# AutoPot Grow

Grow-Tagebuch für passive AutoPot-Systeme (AirBase + AirDome, 50/50 Coco/Perlite, mineralische Nährlösung) – als Website mit Benutzerkonten und verschlüsselter Cloud-Synchronisation, installierbar als App auf Handy und Rechner.

| Seite | Zweck |
|---|---|
| `/` (`index.html`) | Landingpage mit Funktionen, Sicherheit, FAQ, Registrieren/Anmelden |
| `/app` (`app.html`) | Die Grow-App (läuft auch ohne Konto, dann nur lokal im Browser) |
| `/anleitung` (`anleitung.html`) | Meisteranleitung mit 20 Kapiteln, druckfreundlich |
| `/datenschutz`, `/impressum` | **Vorlagen** – vor dem Livegang ausfüllen und prüfen lassen |

## Schnellstart

Voraussetzung: **Node.js ≥ 22.5**. Es gibt **keine Fremdpakete** – kein `npm install` nötig, um den Server zu betreiben.

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
| `REGISTRATION` | `open` | `closed` = keine neuen Konten (z. B. nur für dich und Freunde) |
| `TRUST_PROXY` | `0` | `1` hinter einem Reverse-Proxy mit HTTPS (Render, Fly, Caddy, nginx). Nötig für `Secure`-Cookies und korrekte IP-Begrenzung |
| `SESSION_DAYS` | `30` | Laufzeit einer Anmeldung |
| `AUTOPOT_SECRET` | – | Mind. 32 Zeichen. Ohne Angabe wird `server-secret.key` erzeugt. **Nie nachträglich ändern**, sonst findet der Server die Konten nicht mehr |

## Online stellen

**Pflicht: HTTPS.** Ohne HTTPS sind Passwörter auf dem Weg ungeschützt, und die App lässt sich nicht installieren.

- **Docker (überall):** `docker build -t autopot . && docker run -p 8080:8080 -v autopot-data:/data -e TRUST_PROXY=1 autopot` – davor einen Reverse-Proxy mit HTTPS (z. B. Caddy: `deine-domain.de { reverse_proxy localhost:8080 }`).
- **Render.com:** `render.yaml` liegt bei (Docker + persistenter Speicher). Persistenter Speicher braucht einen bezahlten Plan; ohne ihn gehen bei jedem Neustart alle Konten verloren.
- **Nur statisch (GitHub Pages):** funktioniert ebenfalls, dann aber **ohne Konten** – die App merkt das und blendet den Konto-Knopf aus.

Vor dem Livegang: `impressum.html` und `datenschutz.html` mit echten Angaben füllen (Platzhalter in eckigen Klammern) und rechtlich prüfen lassen.

## Sicherheit

| Thema | Umsetzung |
|---|---|
| Passwörter | scrypt (N = 2¹⁵, r = 8), nie im Klartext gespeichert; mind. 10 Zeichen |
| Daten im Ruhezustand | AES-256-GCM mit zufälligem 256-Bit-Schlüssel pro Nutzer (DEK); jeder Datensatz mit eigener Zufalls-IV und Zuordnung zum Nutzer (AAD) |
| Schlüsselschutz | DEK verschlüsselt mit einem aus dem Passwort abgeleiteten Schlüssel, zusätzlich mit dem Wiederherstellungscode (160 Bit). Pro Sitzung wird der DEK mit einem Schlüssel aus dem Cookie-Token verpackt – in der Datenbank steht nur der Hash des Tokens |
| E-Mail-Adressen | nur als HMAC-SHA-256-Blindindex gespeichert, nie im Klartext |
| Sitzungen | 256-Bit-Token, Cookie `HttpOnly`, `SameSite=Strict`, `Secure` + `__Host-`-Präfix unter HTTPS |
| CSRF | SameSite-Cookie + Pflicht-Header `X-Requested-With` + Origin-Prüfung |
| Missbrauch | Begrenzung pro IP (Registrierung, Login, Wiederherstellung), Kontosperre 15 min nach 8 Fehlversuchen, gleiche Antwortzeit für unbekannte Konten |
| Browser | strikte CSP (`script-src 'self'`, keine Inline-Skripte), `nosniff`, `frame-ancestors 'none'`, HSTS unter HTTPS, keine Drittanbieter |
| Dateifreigabe | Server liefert nur eine feste Liste öffentlicher Dateien aus (Datenbank, Server-Code, Tests sind nicht abrufbar) |
| Datenschutz | Export aller Daten und endgültiges Löschen des Kontos in der App |

**Grenzen (ehrlich):** Der Server sieht das Passwort beim Anmelden kurz im Arbeitsspeicher. Es ist Verschlüsselung der gespeicherten Daten, keine Ende-zu-Ende-Verschlüsselung gegenüber dem Betreiber. Wer Passwort **und** Wiederherstellungscode verliert, verliert die Daten – das ist gewollt. Der Server kann keine E-Mails senden (er kennt die Adressen nicht), deshalb gibt es kein „Passwort per Mail zurücksetzen“.

## Synchronisation

- Offline zuerst: Die App speichert immer lokal (localStorage, Fotos in IndexedDB) und überträgt Änderungen 1,5 s später verschlüsselt zum Server; offline gesammelte Änderungen werden nachgeholt.
- Mehrere Geräte: Versionsnummern erkennen gleichzeitige Änderungen; Einträge, Rezepte, Ereignisse, Erinnerungen und Archiv werden dann zusammengeführt, bei Einstellungen gewinnt das Gerät, das zuletzt speichert. Gelöschte Einträge können bei gleichzeitiger Bearbeitung auf einem zweiten Gerät zurückkehren.
- Fotos werden einzeln übertragen und erst bei Bedarf auf neue Geräte geladen.
- Beim ersten Anmelden werden vorhandene lokale Daten ins Konto übernommen. Beim Abmelden fragt die App, ob die Daten vom Gerät entfernt werden sollen (auf fremden Geräten: ja). Daten eines anderen Kontos auf demselben Gerät werden nie ins neue Konto übernommen.

## API (kurz)

`POST /api/register | /api/login | /api/recover | /api/logout | /api/password`, `GET /api/session | /api/me | /api/export`, `GET/PUT /api/state` (mit `baseVersion`, 409 bei Konflikt), `GET /api/photos`, `GET/PUT/DELETE /api/photos/:id`, `DELETE /api/account`, `GET /api/health | /api/config`. Alle schreibenden Anfragen brauchen `X-Requested-With: autopot`.

## Funktionen der App

Übersicht mit Tageszähler, Phasenleiste, Grow-Score und Messserie · Messprotokoll mit Höhe, Schnell-Tags, Suche und Filtern · Diagramme mit Zielband und Zeitraum · Foto-Galerie · Rechner (VPD, EC/Dünger, pH, Mischung, Tank, EC⇄PPM, DLI, VPD-Heatmap) · Tankwechsel-Assistent · Ernte & Archiv · Rezepte, Timeline, Erinnerungen (mit .ics-Export), Diagnose, Checklisten · JSON-Backup (mit Fotos), CSV-Export/-Import · Dunkelmodus · installierbar und offline nutzbar.

### Datenformat (Schema v4)

```
{ version, settings{name, phase, startDate, phaseStart, tankSize, tankRest, dailyUse, tankInterval, lastTankChange, lastBackup, entriesSinceBackup},
  entries[{id, date, phase, ec, ph, waterTemp, airTemp, humidity, ppfd, use, height, tags, note, hasPhoto}],
  recipes[], events[], reminders[], checks{setup{}, week{}},
  harvest{date, wet, dry, watt, note}, archive[{id, name, start, end, entries, days, wet, dry, watt, avgEc, avgPh}] }
```

Backups älterer Versionen werden beim Import ergänzt. `data/autopot-grow-backup.json` enthält den bisherigen Datenstand zum Import.

## Tests

```
npm install            # nur für die Browser-Tests (Playwright)
npm test               # Server-Tests, App-Tests, End-to-End mit zwei Geräten
```

- `tests/server.test.js` – Registrierung, Login, Sperre, Verschlüsselung in der Datenbankdatei, Trennung der Nutzer, CSRF, Dateifreigabe, Passwortwechsel, Wiederherstellung, Export, Löschen
- `tests/smoke.test.js` – App und Anleitung (Import/Export, Fotos, Diagramme, Rechner, Offline, Mobilansicht)
- `tests/e2e.test.js` – Landingpage, Registrierung im Browser, Sync von Einträgen und Fotos zwischen zwei Geräten, Zusammenführen, Passwortwechsel, Abmelden, Konto löschen

## Richtwerte

Alle Zielbereiche stammen aus der Anleitung (Kapitel 7, 9, 10) und sind Orientierungswerte ohne Gewähr. Der EC-Rechner nutzt ein grobes Modell (1 ml/L ≈ 0,5 EC); die Herstellerangabe hat Vorrang.
