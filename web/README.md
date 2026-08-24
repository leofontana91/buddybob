# BOB Admin — multi-tenant

## Ruoli

| Ruolo | Login demo | Cosa fa |
|-------|------------|---------|
| **Super Admin** | `super@bobrobotics.com` / `super123` | Crea admin, crea robot, associa robot↔admin |
| **Admin** | `admin@bobrobotics.com` / `admin123` | Crea utenti, agenda/inbox/settings dei robot assegnati |
| **Utente** | `mario@example.com` / `user123` | Vede i propri appuntamenti |

## Avvio

```bash
cd web
npm install
npx prisma migrate reset --force   # o migrate dev + db:seed
npm run db:seed
npm run dev
```

http://localhost:3000

## Collegare un robot (APK)

1. Super admin crea il robot → ottiene `id` + `apiKey`
2. Super admin lo associa a un admin
3. Nell’APK / `bob-config.json`:
   - `robot.id`
   - `appointments.apiKey`
   - `sync.endpoint`

## Android OTA-like aggiornamenti (Super Admin)

Il Super Admin può caricare un nuovo APK nella sezione "Aggiornamenti Android".
Il robot controllerà un manifest endpoint autenticato via `Authorization: Bearer <robot.apiKey>`.

Env vars (server-side, necessari per Supabase Storage):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANDROID_APK_BUCKET` (bucket Storage per gli APK, privato)
- `ANDROID_UPDATE_SIGNED_URL_TTL_SEC` (opzionale, default: `3600`)

Su Supabase → Storage crea un bucket privato con quel nome (es. `bob-android-apks`).
L’APK viene caricato dal browser verso Storage (Vercel non accetta file > ~4,5 MB).
