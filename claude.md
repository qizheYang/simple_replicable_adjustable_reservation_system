# RSVP - Eastwind Mahjong Reservation System

Reservation system for Eastwind Riichi mahjong club. Users book time slots on mahjong machines without login.

## Tech Stack

Follows the Eastwind ecosystem patterns (see `mahjong-recording`, `narts`):

- **Frontend**: React + Vite + TypeScript
- **Backend**: Express + TypeScript (tsx for dev, tsc for build)
- **Database**: Prisma + SQLite
- **Testing**: Vitest
- **UI**: Black and white, modern minimalist design. No color.

## Project Structure

```
rsvp/
  client/          # React SPA (Vite)
  server/          # Express API
    prisma/
      schema.prisma
    src/
      index.ts     # entry point
      routes/
  shared/          # shared types between client/server
```

## Machines

5 mahjong machines, referenced by ID:

All machines seat a maximum of **4 players**.

| ID | Code Name | UI Display |
|----|-----------|------------|
| 0  | White 8   | 白色八口机  |
| 1  | Black 8   | 黑色八口机  |
| 2  | White 4   | 白色四口机  |
| 3  | Large 1   | 国麻桌1    |
| 4  | Large 2   | 国麻桌2    |

## Business Logic

### Booking Rules

- No authentication required for viewing or booking
- When booking, user provides: **username**, **phone number**, **time slot**, and optionally a **specific machine**
- Time slots are hourly divisions within a single day
- A user can book a specific machine or choose "any machine"

### Auto-Assignment ("Any Machine")

When user selects "any machine", they must specify play style:

- **Riichi (立直)**: assign to machines 0, 1, or 2 (White 8 / Black 8 / White 4)
- **Other (国麻)**: assign to machines 3 or 4 (Large 1 / Large 2)

Assignment should prefer machines with the most existing players in the same time slot (to fill tables faster).

### Viewing

Any user can view the full booking status: which usernames are booked on which machine, for which date and time slot.

## Admin Portal

Accessible at `/admin`. Requires password authentication (stored in server `.env` as `ADMIN_PASSWORD`).

Admin capabilities:
- **Lock tables**: Reserve/lock a machine for a time slot (for 包桌 or tournaments). Locked slots show as unavailable to regular users.
- **Cancel bookings**: Remove any player's reservation.
- **View all bookings**: Full overview of all reservations.

## API Design

```
GET    /api/bookings?date=YYYY-MM-DD          # all bookings for a date
POST   /api/bookings                           # create booking
DELETE /api/bookings/:id?phone=xxx             # cancel (verify phone)
GET    /api/machines                           # list machines

# Admin (requires Authorization header)
POST   /api/admin/login                        # verify password, return token
DELETE /api/admin/bookings/:id                 # cancel any booking
POST   /api/admin/locks                        # lock a machine/time slot
DELETE /api/admin/locks/:id                    # unlock
GET    /api/admin/locks?date=YYYY-MM-DD        # list locks for a date
```

## Development

```bash
# Install
npm install

# Dev (runs both client and server)
npm run dev

# Client only
npm run dev:client

# Server only
npm run dev:server

# Build
npm run build

# Test
npm test
```

## Deployment

- URL: `eastwindriichi.com/rsvp`
- Server: `ssh root@137.184.81.194` (same as other Eastwind services)
- Deploy path: `/var/www/eastwindriichi.com/rsvp/`
- Process manager: PM2 (consistent with `eastwind-api`, `riichi-api`)
- Always test locally before deploying
- Client build output served as static files; server runs behind Nginx reverse proxy
