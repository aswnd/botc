# Eure erste Runde

## Vor dem Besuch

1. Starte im Projektordner `npm start` und öffne `http://127.0.0.1:3000`.
2. Schließe den Beamer an. Verwende **erweiterte Bildschirme**, damit der Laptop privat bleibt.
3. Klicke auf **Beamer öffnen**, schiebe dieses Fenster auf den Beamer und aktiviere dort **Ton aktivieren**. Teste Ton und Vollbild. Stelle die Lautstärke so ein, dass die Signale gut hörbar sind.
4. Tragt eure Namen ein und startet oben **Geführte Lernrunde**. Plant 15–20 Minuten ein. Die Assistenz liest die Aufgaben vor; alle üben mit offenen Rollen zwei kurze Nächte, Bluffen und Abstimmungen. Die 22 Charakterkarten erklären Fähigkeiten mit Beispielen. Die Lernrunde kostet kein KI-Guthaben. Eine unangeleitete **Proberunde** ist zusätzlich verfügbar.
5. Für die echte Partie startest du eine neue Runde und schaltest **Proberunde** aus. Trage die Namen in der tatsächlichen Sitzreihenfolge ein.
6. Setze vor dem Serverstart `OPENAI_API_KEY` und optional `OPENAI_MODEL` in `.env`. Die KI benötigt einen gültigen Schlüssel und API-Guthaben.

Es werden 7–10 Personen benötigt. Eine davon übernimmt zusätzlich die Assistenz. Alle bekommen einen geheimen Charakter und spielen mit.

## Der Assistenz erklären

Du weißt genauso wenig über die anderen Charaktere wie alle anderen. Wenn der Beamer dich ruft und das Doppelsignal erklingt, gehst du zum Laptop, öffnest **Vorlesetext** und liest ihn laut vor. Bestätige danach mit **Vorgelesen – weiter**.

Tagsüber findest du unter **Assistenz öffnen** den Timer, Nominierungen und Abstimmungen. Du kannst die Diskussion pausieren, verlängern oder beenden. Die voreingestellten sieben Minuten sind eine Orientierung. Die Gruppe entscheidet nicht automatisch, nur weil der Timer abläuft.

Für eine Abstimmung wird die nominierte Person zuletzt gezählt. Gehe im Uhrzeigersinn durch den Kreis und trage die erhobenen Hände ein. Prüfe die angezeigte Summe gemeinsam, bevor du bestätigst. Eine benutzte letzte Stimme ist danach verbraucht.

Nach dem letzten Aufruf bestätigst du **Tag beenden**. Die Anwendung entscheidet regelgerecht über Hinrichtung und Spielende. Einen öffentlichen Schuss kannst du für jede Person eintragen: Auch eine Behauptung gehört zum Spiel.

## Der Gruppe erklären

Eure Charaktere bleiben geheim. Gut versucht, den Dämon zu finden; Böse versucht, unentdeckt zu überleben. Tagsüber redet ihr, tauscht Informationen aus und dürft auch lügen. Eine gute Person muss nicht immer die Wahrheit sagen. Die Spielleitung erklärt die Regeln und ist neutral.

**Nachts kommt jede Person zweimal zum Laptop**, auch wer tot ist. Der Beamer zeigt den nächsten Namen. Sprecht währenddessen nicht miteinander und schaut nicht auf fremde Bildschirme. Ihr müsst nicht wissen, welche Rollen nachts etwas tun: Die Anwendung führt euch durch euren eigenen Besuch.

In Runde A trefft ihr Entscheidungen. In Runde B erhaltet ihr Ergebnisse. Manche sehen nur eine neutrale Nachricht. Geht jeweils mit **Fertig – Bildschirm verbergen** zurück zu eurem Platz. Wenn ihr Informationen länger lesen wollt, nehmt euch Zeit. Die Mindestbesuchszeit ist für alle gleich.

Tagsüber könnt ihr am Laptop euren Namen wählen und eine private Frage stellen. Verlasst den Bildschirm wieder mit **Fertig** oder **Bildschirm verbergen**.

Wer stirbt, spielt weiter mit. Der Charakter bleibt geheim; die meisten Fähigkeiten gehen verloren. Tote können nicht mehr nominieren und haben nur eine letzte Stimme für den gesamten Rest des Spiels. Sie gewinnen weiterhin mit ihrem Team.

## Die Signale

| Signal | Bedeutung |
|---|---|
| Tiefe Glocke | Die Nacht beginnt. |
| Ein heller Ton | Die nächste Person ist am Laptop dran. |
| Zwei helle Töne | Die Assistenz soll einen Text vorlesen. |
| Aufmerksamkeitsglocke | Alle bitte zum Beamer schauen. |
| Absteigende Glocken | Die Diskussionszeit ist vorbei. |

Jedes wichtige Signal hat zusätzlich eine sichtbare Nachricht. Wenn der Ton fehlt, könnt ihr trotzdem weiterspielen.

## Wenn etwas unterbrochen wird

- **Kurze Pause:** Bildschirm verbergen, Assistenz öffnen und das Spiel pausieren.
- **Browser neu geladen:** Am Laptop bei Bedarf **Laptop freigeben** wählen. Die Reihenfolge wird dadurch nicht übersprungen.
- **Server beendet:** `npm start` erneut ausführen. Der gespeicherte Spielstand wird geladen.
- **KI nicht erreichbar:** Die lokale Ersatzspielleitung übernimmt. Grundregeln und Charakterbeschreibungen bleiben verfügbar.
- **Stimme falsch angeklickt:** Vor der Bestätigung korrigieren und den öffentlichen Gesamtstand gemeinsam prüfen.

Nach dem Spiel werden alle Rollen aufgedeckt. Unter **Was in den Nächten geschah** könnt ihr die nächtlichen Angriffe und Schutzwirkungen gemeinsam nachvollziehen.
