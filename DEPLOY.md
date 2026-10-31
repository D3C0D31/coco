# AutoPot Grow online stellen

Diese Anleitung bringt die Seite sicher ins Netz. Empfohlen: ein kleiner eigener Server (VPS, 1–2 vCPU, 1–2 GB RAM, z. B. bei einem deutschen Anbieter) mit Docker Compose. Lasttest auf 2 CPU-Kernen: rund 1 500 Daten-Anfragen pro Sekunde (p95 ≈ 56 ms), 40 gleichzeitige Logins in 1,3 s – das reicht für mehrere tausend Nutzer.

## 1. Server vorbereiten (Docker Compose + Caddy)

```bash
# auf dem Server (Debian/Ubuntu), Docker installiert
git clone <dein-repo> autopot && cd autopot
cp .env.example .env
openssl rand -hex 32            # Ergebnis bei AUTOPOT_SECRET eintragen
nano .env                       # DOMAIN, REGISTRATION=invite, …
mkdir backups && sudo chown 1000:1000 backups
docker compose up -d --build
docker compose logs -f app      # „AutoPot Grow läuft …“
```

- DNS: A-/AAAA-Eintrag der Domain auf den Server zeigen lassen. Caddy holt das HTTPS-Zertifikat selbst.
- Firewall: nur 22 (SSH, am besten nur mit Schlüssel), 80 und 443 öffnen. `ufw allow 22,80,443/tcp && ufw allow 443/udp && ufw enable`
- Den Wert von `AUTOPOT_SECRET` zusätzlich **getrennt** aufbewahren (Passwortmanager). Ohne ihn funktionieren nach einem Serverumzug keine Logins mehr.

## 2. Erste Schritte nach dem Start

```bash
docker compose exec app node server/admin.js invite create --uses 1 --days 14 --note "für mich"
# → Einladungscode im Browser unter https://DOMAIN/app?mode=register eingeben
docker compose exec app node server/admin.js stats
```

1. Eigenes Konto anlegen, **Zwei-Faktor-Anmeldung aktivieren**, Wiederherstellungscode sicher ablegen.
2. Weitere Personen per Einladungscode einladen (`invite create --uses 5 --days 7`).
3. Erst wenn alles läuft und die Rechtstexte stehen, bei Bedarf `REGISTRATION=open` (dann schützt die Rechenaufgabe POW_BITS vor Bots, zusätzlich `REG_DAILY_MAX` und `MAX_USERS` setzen).

## 3. Cloudflare davor (optional, empfohlen bei offener Registrierung)

Schützt vor Überlastungsangriffen und verbirgt die Server-IP.

1. Domain in Cloudflare aufnehmen, DNS-Eintrag auf „Proxied“ (orange Wolke).
2. SSL/TLS-Modus **Full (strict)**. Caddy holt weiterhin ein gültiges Zertifikat.
3. In `.env`: `CLIENT_IP_HEADER=cf-connecting-ip` – **nur** zusammen mit Schritt 4, sonst kann jeder seine IP fälschen.
4. Firewall des Servers so einstellen, dass 80/443 nur von den Cloudflare-IP-Bereichen erreichbar sind (Liste: cloudflare.com/ips).
5. Unter Security: „Bot Fight Mode“ an; Rate-Limiting-Regel z. B. für `/api/login` und `/api/register` (10 Anfragen/Minute pro IP).
6. Datenschutzerklärung um Cloudflare ergänzen (Auftragsverarbeiter, Drittlandübermittlung) – Vertrag (DPA) bei Cloudflare abschließen.

## 4. Sicherungen

- Der Dienst `backup` sichert täglich nach `./backups/` und macht danach automatisch eine **Wiederherstellungsprobe** (startet einen Server auf der Kopie und prüft ihn). Ergebnis: `docker compose logs backup`.
- **Kopie an einem zweiten Ort** ist Pflicht (Festplattendefekt, Hoster-Ausfall), z. B. mit restic oder rclone:
  `restic -r sftp:user@backup-host:/autopot backup ./backups` (per Cron täglich).
  Die Sicherungen enthalten nur verschlüsselte Nutzerdaten; zum Wiederherstellen wird `AUTOPOT_SECRET` gebraucht – **nicht** im selben Backup ablegen.
- Ernstfall: `docker compose stop app && docker compose run --rm app node server/restore.js /backups/autopot-….sqlite --yes && docker compose start app`

## 5. Überwachung

- **Erreichbarkeit:** Uptime Kuma, UptimeRobot o. Ä. auf `https://DOMAIN/api/health` (liefert 503, wenn die Datenbank nicht antwortet). Alarm per E-Mail/Push.
- **Kennzahlen:** `METRICS_TOKEN` setzen; Prometheus fragt `https://DOMAIN/api/metrics` mit `Authorization: Bearer <Token>` ab (Konten, Sitzungen, Anfragen nach Statusklasse, Logins ok/fehlgeschlagen, Registrierungen, Rate-Limits, DB-Größe). Alarm z. B. bei stark steigenden fehlgeschlagenen Logins oder 5xx-Antworten.
- **Protokoll:** `docker compose logs app` – eine JSON-Zeile pro Anfrage, ohne IP-Adressen. Fehler stehen auf stderr.
- **Wöchentlich:** `docker compose exec app node server/admin.js stats`

## 6. Updates

```bash
git pull
docker compose build --pull && docker compose up -d
```

Mindestens monatlich (Sicherheitsupdates für Node und Alpine). Betriebssystem: `unattended-upgrades` aktivieren.

## 7. Verwaltung

| Aufgabe | Befehl (`docker compose exec app node server/admin.js …`) |
|---|---|
| Überblick | `stats` |
| Einladung | `invite create --uses 3 --days 7 --note "Freunde"` · `invite list` · `invite revoke <ID>` |
| Konten | `users` · `users --inactive 365` · `find name@example.org` |
| Sperren / Entsperren | `disable <ID>` (meldet überall ab) · `enable <ID>` |
| Alle Geräte abmelden | `logout <ID>` |
| Löschen | `delete <ID> --yes` · `purge-inactive 730 --yes` |

Inhalte der Nutzer kann auch der Betreiber nicht lesen – das ist gewollt.

## 8. Checkliste vor dem öffentlichen Start

- [ ] Impressum, Datenschutzerklärung, Nutzungsbedingungen und `.well-known/security.txt` ausgefüllt (alle `[Platzhalter]`) und **rechtlich geprüft**
- [ ] Vertrag zur Auftragsverarbeitung (AVV/DPA) mit dem Hoster (und ggf. Cloudflare) abgeschlossen
- [ ] HTTPS aktiv, `TRUST_PROXY=1`, Firewall eingerichtet, SSH nur mit Schlüssel
- [ ] `AUTOPOT_SECRET` gesetzt und getrennt gesichert
- [ ] Registrierungsmodus bewusst gewählt (`invite` empfohlen), `MAX_USERS`/`REG_DAILY_MAX` passend
- [ ] Tägliche Sicherung + Kopie an zweitem Ort + einmal selbst `restore.js` geübt
- [ ] Erreichbarkeits-Überwachung mit Alarm
- [ ] Eigenes Konto mit Zwei-Faktor-Anmeldung
- [ ] Unabhängige Sicherheitsprüfung (Code-Review / Penetrationstest) – siehe SECURITY.md
- [ ] Auf echten Geräten getestet (iPhone ab iOS 16.2, Android Chrome, Desktop Firefox/Safari/Chrome)
