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
