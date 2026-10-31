# coco – AutoPot-Grow

Passives AutoPot-System (AirBase + AirDome) auf 50/50 Coco/Perlite mit mineralischer Nährlösung.
Das Projekt besteht aus zwei voneinander unabhängigen Seiten: der **Anleitung** zum Lesen und Ausdrucken und der **App** zum Protokollieren.

## Dateien

| Datei | Zweck |
|---|---|
| `anleitung.html` | Meisteranleitung (20 Kapitel) mit klickbarem Inhaltsverzeichnis, Dark Mode, druckfreundlich. Enthält keine Daten. |
| `app.html` | Grow-App: Übersicht mit Tageszähler und Score, Messprotokoll, Diagramme, Galerie, Rechner, Ernte, Rezepte, Timeline, Erinnerungen, Diagnose, Checklisten |
| `data/autopot-grow-backup.json` | Aktueller Datenstand (Schema v4), in der App über „Import“ ladbar |
| `data/autopot-grow-log.csv` | Dieselben Messwerte als CSV (Semikolon, UTF-8 mit BOM, Dezimalkomma) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installierbare Offline-App (PWA), siehe unten |
| `tests/smoke.test.js`, `package.json` | Automatischer Browser-Test (`npm install && npm test`) |

Beide HTML-Dateien funktionieren ohne Server und ohne Internet: einfach im Browser öffnen. Sie verlinken sich gegenseitig (`anleitung.html` ↔ `app.html`), daher im selben Ordner halten.

## Erste Schritte

1. `app.html` öffnen.
2. Oben rechts **Daten → Import** wählen und `data/autopot-grow-backup.json` laden. Die App übernimmt Einträge, Einstellungen und Checklisten.
3. Messwerte im Bereich „Messprotokoll“ eintragen.

Wer bereits die alten Dateien `autopot-grow-dashboard.html` oder `grow-command-center.html` im selben Browser genutzt hat, bekommt deren gespeicherte Daten beim ersten Öffnen von `app.html` automatisch übernommen.

## Funktionen der App

- **Übersicht** mit Grow-Name, **Tag-/Wochenzähler**, Phasenleiste, **Grow-Score** (Anteil der Messwerte der letzten 14 Tage im Zielbereich) und **Messserie** (Tage in Folge). Kacheln für pH, EC, VPD und Tank zeigen Zielbereich-Balken und Mini-Verläufe. Dazu automatische Auffälligkeiten (Werte außerhalb des Zielbereichs, alte Einträge, Tank fast leer, Tankwechsel fällig, fehlendes Backup).
- **Tankwechsel**: „Tank gewechselt“ füllt den Tank, notiert das Ereignis und startet das Wechselintervall.
- **Phasenwechsel** trägt automatisch einen Timeline-Eintrag ein und setzt den Phasenzähler zurück.
- **Messprotokoll** mit Pflanzenhöhe, Schnell-Tags, Suche, Phasen- und Foto-Filter.
- **Galerie** aller Fotos mit Vollbild-Ansicht (Pfeiltasten) als Wachstums-Zeitraffer.
- **Ernte & Archiv**: Trockengewicht, Trocknungsverlust, g/W und Dauer; „Grow abschließen & neu starten“ lädt zuerst ein Backup, archiviert den Grow und beginnt ein leeres Protokoll (rückgängig machbar).
- **Bericht drucken** (Übersicht, Protokoll, Diagramme, Galerie, Ernte).
- **Diagramme** für EC, pH, VPD, Luft- und Wassertemperatur, Luftfeuchte, PPFD und Verbrauch mit grün hinterlegtem Zielbereich. Mit der Maus darüberfahren oder antippen zeigt Datum und Wert. Zeitraum wählbar (7/14/30 Tage, alles); die Wahl wird gemerkt.
- **Fotos** pro Eintrag (verkleinert auf max. 800 px), gespeichert in IndexedDB.
- **Erinnerungen** mit Browser-Benachrichtigung (nur bei geöffneter Seite) und **Kalenderexport (.ics)** mit Wiederholung, damit sie auch bei geschlossenem Browser laufen.
- **Rechner** für VPD, EC/Dünger, pH-Korrektur, Teilwasserwechsel, Tank, **EC ⇄ PPM** (500/640/700), **DLI** (mit Zielbereich aus den PPFD-Richtwerten) und eine **VPD-Heatmap** (Temperatur × Luftfeuchte, optional mit Blatt-Offset, letzter Eintrag markiert).
- **Mobil**: untere Navigation, „Mehr“-Menü und Plus-Knopf zum schnellen Eintragen. Auf unterstützten Browsern gibt es einen „Installieren“-Knopf.

## Daten und Backup

Messwerte und Einstellungen liegen im `localStorage`, Fotos in IndexedDB des Browsers. Beides geht verloren, wenn Browserdaten gelöscht werden oder ein anderer Browser/Rechner genutzt wird. Die App fordert dauerhaften Speicher an, das schützt vor automatischem Aufräumen, ersetzt aber kein Backup.

- **Backup** (Daten-Dialog) exportiert alles als JSON (inklusive Fotos). Die App weist darauf hin, wenn noch kein Backup existiert, das letzte älter als 14 Tage ist oder seitdem 10 neue Einträge hinzugekommen sind.
- **CSV export** schreibt nur die Messwerte (für Excel/Tabellenkalkulation, letzte Spalte „Höhe“).
- **Import** erkennt `.json` (ersetzt den Stand nach Rückfrage) und `.csv` (fügt Zeilen hinzu, Duplikate werden übersprungen). **Letzten Import rückgängig machen** im Dashboard holt den Stand davor zurück.

### Schema v4

```
{ version, settings{name, phase, startDate, phaseStart, tankSize, tankRest, dailyUse, tankInterval, lastTankChange, lastBackup, entriesSinceBackup},
  entries[{id, date, phase, ec, ph, waterTemp, airTemp, humidity, ppfd, use, height, tags, note, hasPhoto}],
  recipes[], events[], reminders[], checks{setup{}, week{}},
  harvest{date, wet, dry, watt, note}, archive[{id, name, start, end, entries, days, wet, dry, watt, avgEc, avgPh}] }
```

- v4 ergänzt nur Felder (Startdatum, Tankintervall, Höhe, Ernte, Archiv); Backups aus v3 und älter werden beim Import automatisch ergänzt.
- Im JSON-Backup tragen Einträge zusätzlich das Feld `photo` (Data-URL); im Browser-Speicher steht nur `hasPhoto`.
- Der VPD wird nie gespeichert, sondern immer aus `airTemp` und `humidity` berechnet.
- Erlaubte Phasen: `Jungpflanze / Anwachsen`, `Vegetation`, `Übergang / frühe Blüte`, `Hauptblüte`, `Endphase`. Ältere Bezeichnungen (`VEG`, `Frühe Blüte`, …) werden beim Import automatisch zugeordnet.
- Alte Feldnamen (`water`, `temp`, `rh`) werden beim Import in `waterTemp`, `airTemp`, `humidity` übersetzt.

## Offline-App (PWA)

Service Worker und „App installieren“ funktionieren nur über `https://` oder `http://localhost`, nicht beim Öffnen per Doppelklick (`file://`). Zum Ausprobieren lokal:

```
python3 -m http.server 8080      # im Projektordner, dann http://localhost:8080/app.html
```

Dauerhaft eignet sich z. B. GitHub Pages: Danach lässt sich die App im Browser installieren und läuft auch ohne Netz. Wenn sich Dateien ändern, in `sw.js` den Namen bei `CACHE` hochzählen (aktuell `autopot-v4-1`).

## Tests

```
npm install      # installiert Playwright
npm test         # startet einen lokalen Server und prüft Anleitung und App im Browser
```

Optional `CHROME_PATH` auf einen vorhandenen Chrome/Chromium setzen. Der Test deckt u. a. Import/Export, Foto-Speicher, Tooltips, Kalenderexport, Migration alter Formate, Offline-Betrieb und die Mobilansicht ab.

## Hinweise zu den vorhandenen Messwerten

- Beide Einträge (2.–3.10.2026) stehen in Phase *Vegetation*, liegen aber bei EC (0,7–0,8) und PPFD (325–350) unter den Vegetations-Richtwerten (EC 1,1–1,6; PPFD 400–650) und eher im Bereich *Jungpflanze / Anwachsen*. Die App zeigt dazu eine Auffälligkeit an. Bei Bedarf die Phase im Eintrag ändern.
- Der letzte Eintrag ist mehrere Wochen alt – das Protokoll sollte fortgeführt werden.

## Richtwerte

Alle Zielbereiche (pH 5,8–6,2, EC, VPD, Klima, PPFD je Phase) stammen aus der Anleitung (Kapitel 7, 9, 10) und sind Orientierungswerte, keine Garantien. Für die **Endphase** gilt: Klima und VPD wie späte Blüte, EC schrittweise absenken, keine feste PPFD-Vorgabe. Der EC-Rechner nutzt ein grobes Modell (1 ml/L ≈ 0,5 EC); die Herstellerangabe des Düngers hat Vorrang.
