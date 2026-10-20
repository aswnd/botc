# Eure erste Runde

## Vor dem Besuch

1. Starte im Projektordner `npm start` und öffne `http://127.0.0.1:3000`.
2. Schließe den Beamer an. Verwende **erweiterte Bildschirme**, damit die Beameransicht getrennt bleibt.
3. Klicke auf **Beamer öffnen**, schiebe dieses Fenster auf den Beamer und aktiviere dort **Ton aktivieren**. Teste Ton und Vollbild. Stelle die Lautstärke so ein, dass die Signale gut hörbar sind.
4. Verbindet eure Handys mit demselben WLAN, öffnet den angezeigten Link oder QR-Code und meldet euch mit Namen und Sitzplatz an. Prüft den Sitzkreis und startet oben **Geführte Lernrunde**. Plant 15–20 Minuten ein. Die Assistenz liest die Aufgaben vor; alle üben mit offenen Rollen zwei kurze Nächte, Bluffen und Abstimmungen. Die 22 Charakterkarten erklären Fähigkeiten mit Beispielen. Die Lernrunde kostet kein KI-Guthaben. Eine unangeleitete **Proberunde** ist zusätzlich verfügbar.
5. Für die echte Partie startest du eine neue Runde und schaltest **Proberunde** aus. Die Personen melden sich auf ihren Handys an; gewählt wird am Laptop nur die Assistenz.
6. Setze vor dem Serverstart `OPENAI_API_KEY` und optional `OPENAI_MODEL` in `.env`. Die KI benötigt einen gültigen Schlüssel und API-Guthaben.

Es werden 7–10 Personen benötigt. Eine davon übernimmt zusätzlich die Assistenz. Alle bekommen einen geheimen Charakter und spielen mit.

## Der Assistenz erklären

Du weißt genauso wenig über die anderen Charaktere wie alle anderen. Wenn der Beamer dich ruft und das Doppelsignal erklingt, gehst du zum Laptop, öffnest **Vorlesetext** und liest ihn laut vor. Bestätige danach mit **Vorgelesen – weiter**.

Tagsüber findest du unter **Assistenz öffnen** den Timer, Nominierungen und Abstimmungen. Du kannst die Diskussion pausieren, verlängern oder beenden. Die voreingestellten sieben Minuten sind eine Orientierung. Die Gruppe entscheidet nicht automatisch, nur weil der Timer abläuft.

Für eine Abstimmung wird die nominierte Person zuletzt gezählt. Gehe im Uhrzeigersinn durch den Kreis und trage die erhobenen Hände ein. Prüfe die angezeigte Summe gemeinsam, bevor du bestätigst. Eine benutzte letzte Stimme ist danach verbraucht.

Nach dem letzten Aufruf bestätigst du **Tag beenden**. Die Anwendung entscheidet regelgerecht über Hinrichtung und Spielende. Einen öffentlichen Schuss kannst du für jede Person eintragen: Auch eine Behauptung gehört zum Spiel.

## Der Gruppe erklären

Eure Charaktere bleiben geheim. Gut versucht, den Dämon zu finden; Böse versucht, unentdeckt zu überleben. Tagsüber redet ihr, tauscht Informationen aus und dürft auch lügen. Eine gute Person muss nicht immer die Wahrheit sagen. Die Spielleitung erklärt die Regeln und ist neutral.

**Nachts bleiben alle am Platz und öffnen gemeinsam ihr Handy**, auch wer tot ist. Lasst die Spielseite offen. Geschlossene Augen und einzelne Aufrufe sind nicht nötig. Sprecht währenddessen nicht miteinander und schaut nicht auf fremde Bildschirme.

Die Nacht läuft ohne gemeinsame zweite Bestätigungsrunde. Erledigt eure Rollenaktion oder findet sechs Zeichen im Nachtspiel; dann wird eure Bereitschaft automatisch bestätigt. Spielt danach weiter am Handy. Neue Informationen unterbrechen das Nachtspiel und müssen gelesen und bestätigt werden. Ohne neue Information ist keine zweite Bestätigung nötig. Alle bleiben bis zum Morgen im Nachtspiel, auch Tote. Das Spiel verändert keine Rollen oder Fähigkeiten. Der Rabenhüter wählt ab der zweiten Nacht vorsorglich ein Ziel; nur bei seinem Nachttod erfährt er dessen Charakter.

**Schnelle Nächte** sind für neue Runden voreingestellt: Die Anwendung wählt regelkonforme Hinweise lokal, ohne KI-Wartezeit. Für individuelle KI-Nachtentscheidungen könnt ihr die Option vor dem Start deaktivieren oder am Laptop den **Nachtmodus** wechseln. In beiden Modi wartet die Auswertung auf die benötigten Spielerentscheidungen.

Tagsüber könnt ihr auf eurem eigenen Handy private Regelfragen stellen. **Bildschirm verbergen** verdeckt Inhalte, ohne euch abzumelden.

Wer stirbt, spielt weiter mit. Der Charakter bleibt geheim; die meisten Fähigkeiten gehen verloren. Tote können nicht mehr nominieren und haben nur eine letzte Stimme für den gesamten Rest des Spiels. Sie gewinnen weiterhin mit ihrem Team.

## Die Signale

| Signal | Bedeutung |
|---|---|
| Tiefe Glocke | Die Nacht beginnt. |
| Zwei helle Töne | Die Assistenz soll einen Text vorlesen. |
| Aufmerksamkeitsglocke | Alle bitte zum Beamer schauen. |
| Absteigende Glocken | Die Diskussionszeit ist vorbei. |

Jedes wichtige Signal hat zusätzlich eine sichtbare Nachricht. Wenn der Ton fehlt, könnt ihr trotzdem weiterspielen.

## Wenn etwas unterbrochen wird

- **Kurze Pause:** Die Assistenz pausiert am Laptop.
- **Browser neu geladen:** Die Anmeldung bleibt erhalten. Bei einem anderen Browser den privaten Wiederherstellungscode eingeben; dadurch wird das vorherige Gerät abgemeldet.
- **Server beendet:** `npm start` erneut ausführen. Der gespeicherte Spielstand wird geladen.
- **KI nicht erreichbar:** Alle Entscheidungen bleiben gespeichert. Die Assistenz nutzt **Auflösung erneut versuchen**. Im KI-Nachtmodus gibt es keinen stillen Ersatz. Alternativ kann die Assistenz ausdrücklich auf schnelle Nächte wechseln und erneut auswerten. Grundregeln und Charakterbeschreibungen bleiben verfügbar.
- **Stimme falsch angeklickt:** Vor der Bestätigung korrigieren und den öffentlichen Gesamtstand gemeinsam prüfen.

Nach dem Spiel werden alle Rollen aufgedeckt. Unter **Was in den Nächten geschah** könnt ihr die nächtlichen Angriffe und Schutzwirkungen gemeinsam nachvollziehen.

## Anfänger-Hausregel: wahre Informationen

Vor dem Start wählt die Assistenz unter „Informationen der Spielleitung“ zwischen „Keine grundlosen Lügen · Anfänger“ (vorausgewählt) und „Fehlinformation nach Spielregeln erlaubt“. Die Auswahl gilt für die gesamte neue Partie, auch für Proberunden. Im Anfängermodus sind falsche Hinweise bei Betrunkenheit, Vergiftung oder einer erlaubten Fehlregistrierung des Einsiedlers möglich. Betrunkener, Einsiedler und Baron können verteilt werden. Fehlregistrierungen des Spions und die falsche Fährte der Wahrsagerin sind deaktiviert. Andere Auswirkungen von Vergiftung bleiben bestehen. Spieler dürfen weiterhin bluffen. Die Startansage erklärt die Hausregel, die abweichenden Standardtexten vorgeht. Im Standardmodus gelten alle üblichen Fähigkeiten einschließlich erlaubter Fehlinformation.
