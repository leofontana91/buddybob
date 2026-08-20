# BOB Robot Config

Contratto condiviso tra **piattaforma admin** e **APK**.

| File | Ruolo |
|------|--------|
| `bob-robot-config.schema.json` | JSON Schema (schemaVersion **1**) |
| `examples/default.bob-config.json` | Esempio completo |
| `app/src/main/assets/bob-config.json` | Config bundled nell’APK |
| `BobConfig.kt` / `ConfigRepository.kt` | Modello + loader on-device |

## API prevista (admin → robot)

```http
GET /robots/{robotId}/config?since={configVersion}
Authorization: Bearer …

200 → body = BobConfig (se più nuova)
204 → invariata
```

Aggiornamento sul robot: **Impostazioni → Aggiorna configurazione** (+ opzionale fetch all’avvio se `sync.fetchOnLaunch`).

## Campi principali

- `appointments.bookingMode` — `qr` | `in_app` (scelta da admin web)
- `appointments.bookingUrl` / `apiKey` / frasi check-in e operatore
- `modules.reception` — modalità accoglienza (saluto + menu)
- `modules.*` — quali sezioni UI sono attive  
- `reception.buttons` — pulsanti menu (ordine, label, enabled)
- `phrases.welcome` / `howCanIHelp` — TTS accoglienza
- `phrases.*` — TTS / copy (`{place}`, `{reason}`, …)  
- `assets.*` — URL immagini  
- `navigation.placeFilter` / `placeLabels` — filtra/rinomina punti mappa  
- `configVersion` — intero monotono per capire se c’è un update  

## Placeholder frasi

| Chiave | Placeholder |
|--------|-------------|
| `goingTo` / `arrived` / `navigationFailed` | `{place}` |
| `navigationFailed` | `{reason}` opzionale |
