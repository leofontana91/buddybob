# Buddybob — OrionStar Robot Control APK

App Android basata su **RobotOS SDK** (`robotservice.jar`) per comandare un robot OrionStar: movimento, voce (TTS/ASR), focus-follow (testa/monitor + chassis) e navigazione.

Documentazione di riferimento: [APK development](https://doc.orionstar.com/en/knowledge-base-category/apk-development/)

## Requisiti

- Android Studio 4.2+ / JDK 8+
- Robot con RobotOS (GreetBot / Mini / Lucki / …)
- SDK jar allineato al firmware del robot (`app/libs/robotservice.jar`)

## Build

```bash
./gradlew assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

## Installazione e autorizzazione SDK

Le API funzionano **solo** se l’app è in foreground ed è stata avviata da **RobotOS Home** (o come boot app). Un launch diretto da Android Studio non autorizza il chassis.

1. Installa l’APK sul robot
2. Aprila dal launcher RobotOS Home
3. (Opzionale) Settings → Other Settings → Boot apps → Buddybob

## Architettura

```
BuddybobApp          → connessione RobotApi + SkillApi
RobotFacade          → entry-point unico
  ├─ MotionController     goForward / turn / moveHead / stop
  ├─ SpeechController     TTS + ASR mode
  ├─ FollowController     startFocusFollow / startSmartFocusFollow
  ├─ NavigationController punti mappa / startNavigation / charge
  └─ StatusMonitor        battery / pose / emergency
```

Uso da codice:

```kotlin
val robot = BuddybobApp.instance.robot
robot.motion.goForward(0.4f)
robot.speech.speak("Ciao")
robot.follow.startSmartFocusFollow()   // monitor + rotazione corpo
robot.haltAllMotion()
```

## Schermate

| Schermata | Funzioni |
|-----------|----------|
| Home | stato SDK, log eventi, STOP globale |
| Movimento | avanti/indietro/rotazione + testa |
| Voce | TTS, start/stop riconoscimento |
| Follow | rileva persone, focus follow volto / smart |
| Navigazione | localizzazione, punti, go-to, ricarica |

## Note importanti

- **Focus follow** e **navigazione/movimento** sono mutuamente esclusivi (stesso chassis).
- Su evento `onSuspend` (emergenza, low battery, OTA) le API sono invalide fino a `onRecovery`.
- Se il jar non matcha il firmware, scarica la versione corretta dal [RobotSample](https://github.com/OrionStarGIT/RobotSample) / portale OrionStar e sostituisci `app/libs/robotservice.jar`.

## Prossimi passi suggeriti

1. Comandi vocali custom in `BuddyModuleCallback` (`onSendRequest`)
2. Logica “segui e cammina dietro” (body follow / lead) se supportata dal modello
3. UI remota (tablet) che chiama `RobotFacade` via socket/HTTP
