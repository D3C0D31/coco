# Sicherheit

## Sicherheitslücke melden

Bitte nicht öffentlich als Issue, sondern vertraulich an die in `/.well-known/security.txt` hinterlegte Adresse. Wir antworten innerhalb von [7] Tagen.

## Architektur in Kürze

- Ein Node-Prozess (Node ≥ 22.13) ohne Fremdpakete, SQLite (WAL) als Datenbank, statische Dateien aus einer festen Freigabeliste.
- **Schlüssel:** Pro Konto ein zufälliger 256-Bit-Datenschlüssel (DEK). Er wird mit einem aus dem Passwort per scrypt (N=2¹⁵, r=8, p=1) abgeleiteten Schlüssel, zusätzlich mit dem Wiederherstellungscode (160 Bit) und pro Sitzung mit einem per HKDF aus dem Cookie-Token abgeleiteten Schlüssel umhüllt (AES-256-GCM).
- **Daten:** Zustand, Fotos, Gerätebezeichnungen und TOTP-Geheimnis sind mit dem DEK verschlüsselt (AES-256-GCM, zufällige IV, AAD bindet Datensatz an Nutzer und Zweck).
- **Identität:** E-Mail nur als HMAC-SHA-256 mit Server-Geheimnis (Pepper) gespeichert. Sitzungs-Token (256 Bit) nur als SHA-256-Hash.

## Bedrohungsmodell

| Angreifer | Schutz | Grenze |
|---|---|---|
| Diebstahl der Datenbank (Backup, Festplatte) | Alle Inhalte verschlüsselt; ohne Passwort, Wiederherstellungscode oder gültiges Cookie nicht lesbar. E-Mails nur als HMAC; mit zusätzlich gestohlenem Pepper sind bekannte Adressen prüfbar | Passwörter könnten offline per scrypt angegriffen werden – schwache Passwörter bleiben ein Risiko |
| Passwort-Raten online | scrypt, Rate-Limits pro IP und Konto, Sperre pro Konto+IP (8) und Konto (40), dauerhaft gespeichert; optionale 2FA | — |
| Bots / Massenregistrierung | Einladungsmodus, Proof-of-Work, Tageslimit, Höchstzahl, Kontingent pro Konto | Verteilte Angriffe mit viel Rechenleistung: zusätzlich Cloudflare |
| CSRF / Clickjacking | SameSite=Strict, Pflicht-Header, Origin- und Sec-Fetch-Site-Prüfung, `frame-ancestors 'none'` | — |
| XSS | Strikte CSP ohne Inline-Skripte, durchgängiges Escaping, Bilder nur als geprüfte Data-URLs | `style-src 'unsafe-inline'` ist noch erlaubt (Inline-Stilattribute) |
| Kompromittierter laufender Server | — | Wer den laufenden Prozess kontrolliert, sieht Passwörter beim Login und Daten angemeldeter Nutzer. **Keine Ende-zu-Ende-Verschlüsselung gegenüber dem Betreiber.** |
| Verlust von Passwort und Code | — | Daten sind dann nicht wiederherstellbar (gewollt) |

## Team-Bereich, News und geteilte Grows

- Rollen `user`, `moderator`, `admin`. Die erste Admin-Rolle wird nur auf dem Server vergeben (`node server/admin.js role <ID> admin`).
- Der Team-Bereich verlangt eine aktive Zwei-Faktor-Anmeldung (`STAFF_REQUIRE_2FA=0` schaltet das ab – nicht empfohlen). Moderatoren können News verwalten, Konten sperren/entsperren/abmelden und Meldungen bearbeiten; Löschen, Rollen, Einladungen und Einstellungen sind Admins vorbehalten. Niemand kann Konten mit gleicher oder höherer Rolle ändern.
- Alle Team-Aktionen landen im Team-Protokoll (`audit`).
- **Geteilte Grows sind bewusst unverschlüsselt** (öffentliche Momentaufnahme mit Einwilligung). Der Server übernimmt nur erlaubte Felder und geprüfte Bilddaten; die Freigabe-Seite gibt alles maskiert aus. Freigabe-Token: 128 Bit, Seite mit `noindex`.
- News sind öffentlich und werden beim Anzeigen maskiert; erlaubt sind nur wenige Formatierungen und `http(s)`-Links mit `rel="noopener nofollow ugc"`.

## Bekannte Grenzen

- Ein Prozess, eine Datenbank: kein Betrieb mehrerer Instanzen parallel (Rate-Limit-Zähler im Speicher, SQLite lokal).
- `node:sqlite` ist in Node 22 als experimentell markiert; Node-Version wird festgeschrieben (`.nvmrc`, `engines`), Updates vorher mit `npm test` prüfen.
- Kein E-Mail-Versand (der Server kennt die Adressen nicht) – daher keine Benachrichtigungen und kein Zurücksetzen per Mail.
- Die Software wurde vom Autor getestet (Unit-, Browser- und Lasttests), aber **nicht unabhängig auditiert**.

## Für Prüfer

- Einstieg: `server/server.js` (`api()`), `server/crypto.js`, `server/totp.js`, `js/cloud.js` (Konto und Synchronisation), `qr.js`, `pow-worker.js`.
- Tests: `npm test` (Server, App, End-to-End), `npm run test:load`.
