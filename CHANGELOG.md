# Changelog

Versionen nach [Semantic Versioning](https://semver.org/lang/de/). Die laufende Version steht in `package.json`, unter `/api/health` (`release`) und unten auf der Startseite.

## 1.0.0-rc.2 – 2026-10-31

### Behoben

- **Registrieren und Anmelden hinter einem Proxy, der den Host umschreibt** (z. B. nginx ohne `proxy_set_header Host $host`, manche Hoster-Panels): Jede Anmeldung und Registrierung scheiterte mit „Anfrage abgelehnt“. Der Server akzeptiert jetzt zusätzlich den Host aus `X-Forwarded-Host` (bei `TRUST_PROXY=1`) und aus `PUBLIC_URL`. Fremde Seiten bleiben weiterhin gesperrt. Bei einer Ablehnung schreibt der Server eine Warnung mit erwartetem und tatsächlichem Host ins Log, die Fehlermeldung im Browser ist verständlicher.
- **Ohne erreichbaren Server** (Seite als Datei oder über einen reinen Datei-Hoster geöffnet, offline): „Kostenlos starten“ und „Anmelden“ taten scheinbar nichts. Jetzt öffnet sich der Konto-Dialog und erklärt, warum Konten gerade nicht gehen.
- Nach erfolgreicher Anmeldung bzw. Registrierung blieb „Bitte warten …“ bzw. „Konto wird angelegt …“ stehen.

### Dokumentation

- DEPLOY.md, Abschnitt 3a: Einrichtung hinter nginx, Apache oder Plesk.

## 1.0.0-rc.1 – 2026-10-31

Erster Release Candidate. Funktional vollständig und automatisch getestet, aber noch nicht im echten Betrieb erprobt. Gedacht für den Testlauf im Einladungsmodus (siehe Checkliste für den Testlauf). Bis 1.0.0 kommen nur noch Fehlerbehebungen dazu.

### Enthalten

- **Grow-App:** Tagebuch mit Fotos, Messwerten und Notizen; Diagramme, Heatmap, Score, Galerie, Vorher/Nachher-Vergleich; Fahrplan nach Sorte und Blütedauer; Heute-Karte; Trendwarnungen (pH, EC, Klima); Hygrometer-CSV-Import mit °F-Umrechnung; Ernte, Trocknung, Tankwechsel; Kalender-Export (ICS); Offline-Betrieb als installierbare Web-App.
- **Konten und Sync:** Registrierung, Anmeldung, verschlüsselte Speicherung der Daten (pro Nutzer ein eigener Schlüssel, AES-256-GCM), Wiederherstellungscode, Zwei-Faktor-Anmeldung (TOTP), Geräteverwaltung, Sync mehrerer Geräte mit Zusammenführung.
- **Betrieb:** Registrierungsmodi `open`/`invite`/`closed`, Einladungscodes, Bot-Schutz per Rechenaufgabe, Ratenbegrenzung und Login-Sperren, tägliche Sicherung mit automatischer Wiederherstellungsprobe, Kommandozeilen-Werkzeug `server/admin.js`, Docker-Compose mit Caddy (HTTPS).
- **Team-Bereich:** Rollen Nutzer/Moderator/Admin mit Pflicht-2FA, Nutzerverwaltung, Einladungen, Einstellungen zur Laufzeit, Protokoll aller Team-Aktionen, Meldungen bearbeiten.
- **News und Teilen:** News-Seite mit Atom-Feed; Grows als öffentlicher Link teilen, melden, moderieren.
- **Code:** Client in neun Module unter `js/` aufgeteilt; Server ohne Fremdpakete (Node ≥ 22.13).

### Bekannte Grenzen

- Impressum, Datenschutz und Nutzungsbedingungen sind Vorlagen und müssen vor einem öffentlichen Start geprüft werden.
- Keine unabhängige Sicherheitsprüfung; das Passwort wird beim Anmelden an den Server übertragen (über HTTPS), der daraus die Schlüssel ableitet.
- Geteilte Grows sind bewusst unverschlüsselt, damit der Link ohne Konto funktioniert.
- Auf echten iPhones (Safari, installierte Web-App, Offline) noch nicht getestet.

### Bis 1.0.0

- [ ] Testlauf über einen kompletten Grow mit 2–3 Testern
- [ ] Gefundene Fehler behoben, jeweils als 1.0.0-rc.N
- [ ] Test auf mindestens einem iPhone
- [ ] Entscheidung privat oder öffentlich; bei öffentlich: Rechtstexte und Sicherheitsprüfung
