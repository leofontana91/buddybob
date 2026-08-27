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

Produzione: **https://buddybob.app**

Su Vercel imposta (Production):
- `NEXT_PUBLIC_APP_URL=https://buddybob.app` (consigliato)
- `RESEND_FROM=BOB Robotics <noreply@buddybob.app>` dopo aver verificato il dominio su Resend

## Collegare un robot (APK)

1. Super admin crea il robot → ottiene `id` + `apiKey`
2. Super admin lo associa a un admin
3. Nell’APK / `bob-config.json`:
   - `sync.endpoint` = `https://buddybob.app`
   - dopo il pairing: `robot.id` + `appointments.apiKey` arrivano dal server

## Android OTA-like aggiornamenti (Super Admin)

Il Super Admin può caricare un nuovo APK nella sezione "Aggiornamenti Android".
Il robot controllerà un manifest endpoint autenticato via `Authorization: Bearer <robot.apiKey>`.

Env vars Storage:
- `SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_URL` (di solito già iniettate dall’integrazione Vercel)
- `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEY` (stesso, già iniettate)
- `SUPABASE_ANDROID_APK_BUCKET` opzionale (default: `bob-android-apks`)

Su **Supabase → Storage** crea una volta un bucket **privato** chiamato `bob-android-apks`
(oppure lascia che l’API lo crei al primo upload).

**Limite dimensione APK:** non impostiamo `file_size_limit` sul bucket via API
(se supera il Global file size limit, Supabase blocca anche la preparazione upload).
Il limite effettivo è quello globale del progetto (es. 45 MB). Gli APK Buddybob
sono ~7 MB. Se manca, crea un bucket **privato** `bob-android-apks` a mano.

Le tabelle Prisma (`RobotAndroidRelease`, ecc.) si aggiornano da sole al deploy (`prisma db push`).
L’integrazione **non** crea i bucket Storage se mancano le env.
