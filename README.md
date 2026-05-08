# E-Waste Platform

Three-sided web app that connects users with local e-waste recyclers. Three roles (User, Recycler, Admin), JWT auth with refresh-token rotation, MySQL via Prisma, and a Next.js + TypeScript frontend that uses the browser Geolocation API to sort approved stores by distance.

> See [SRS.md](SRS.md) for the full Software Requirements Specification (functional + non-functional + database + hardware + software requirements, test cases, and result tracking).

## Stack
- **Backend**: Node.js + Express, Prisma + MySQL, JWT (15 m access + 30 d refresh, with rotation), bcrypt, Zod, Multer (logo / avatar / pickup-item uploads), Nodemailer.
- **Frontend**: Next.js 14 (App Router) + TypeScript, hand-written CSS (no UI library), light + dark theme.
- **Database**: MySQL 8.

## Setup

### 1. Database
Create an empty MySQL database and note the URL.
```sql
CREATE DATABASE ewaste;
```

### 2. Backend
```bash
cd backend
cp .env.example .env       # fill in DATABASE_URL, JWT_SECRET, SMTP_* (optional)
npm install
npx prisma migrate dev
npm run prisma:seed        # creates the admin user (auto email-verified)
npm run dev                # API on http://localhost:4000
```
Default seeded admin (override via env): `admin@ewaste.local` / `ChangeMe!123`.

### 3. Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3000
```

## Roles & flow
- **Recycler** registers (auto-logged-in) → adds **one or more** store profiles (each: lat / lng + categories + hours + service mode + payment policy) → every new store starts `Pending` and is approved independently by an admin. The recycler dashboard lists all of their stores as selectable cards with an **+ Add store** button; the form, Pickups, Reviews, and Contacts all scope to whichever card is selected.
- **Admin** logs in (seeded) → `/admin/dashboard` → Analytics panel + per-status moderation queue → approve or reject (with optional reason). Each store from a multi-store recycler shows up as its own pending row. Approval emails the recycler.
- **User** registers (auto-logged-in, verification email sent) → `/user/dashboard` → grants location → sees approved stores sorted by distance, filterable by radius and category. From a store they can:
  - **Contact** (lightweight expression of interest, revocable; a confirmation prompt explains what info will be shared) — *requires a verified email*.
  - **Schedule pickup** with item-level inventory (category, quantity, weight, condition, optional photo).
  - **Leave a review** after a pickup is marked `Completed`.

## Auth flow
- **Registration is soft-verification:** the new account is logged in immediately and a verification email is sent. The user can browse and explore right away.
- **Sensitive actions (contacting a store) require a verified email** — both server-side (`403 email_unverified`) and in the UI (Contact button disabled, banner with a Resend button).
- **Password reset** (`/forgot-password` → `/reset-password`) and **email verification** (`/verify-email`) work via tokenised links (1 h and 24 h TTLs respectively). Tokens are stored as SHA-256 hashes server-side.
- **Refresh tokens** rotate on every `/api/auth/refresh`. If a revoked refresh token is replayed, the entire token chain for that user is invalidated.
- The frontend transparently retries any 401 once after silently refreshing the access token; if the refresh fails it sends the user to `/login?expired=1`.

## Features at a glance
| Area | Highlights |
|---|---|
| Auth | Register / login / logout / forgot-password / reset-password / verify-email / resend-verification / refresh-token rotation with reuse detection |
| Profile | Edit name / email / phone / password / profile picture from a dropdown opened by clicking the avatar in the top nav |
| Discovery | Geolocation-based search, Haversine in raw SQL, radius + category filters, average rating + count on each card |
| Contact | One-click lightweight contact, revocable; gated by verified email |
| Pickups | Date + 2-hour time slot, 1-15 items per pickup with category enum / quantity / estimated weight / condition / optional photo, server-enforced status FSM (`requested → confirmed | declined`, `confirmed → completed`, user-cancellable while not yet completed) |
| Reviews | One per completed pickup, 1-5 stars + optional comment, aggregates surfaced on store cards & detail modal, recycler can read reviews on their store |
| Admin | Approve / reject (with reason via inline form), Analytics panel (totals, pickups by status, top categories, top stores, signups in 30 d) — CSS-only bars, no chart library |

## API surface

### Auth
| Method | Path | Role |
|---|---|---|
| POST | `/api/auth/register` | public |
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | any authed |
| PATCH | `/api/auth/me` | any authed |
| POST | `/api/auth/me/avatar` | any authed (multipart `avatar`) |
| POST | `/api/auth/forgot-password` | public |
| POST | `/api/auth/reset-password` | public |
| POST | `/api/auth/verify-email` | public |
| POST | `/api/auth/resend-verification` | public (rate-limited 1/min) |
| POST | `/api/auth/refresh` | public (with refresh token in body) |
| POST | `/api/auth/logout` | public (with refresh token in body) |

### Recycler
All endpoints are scoped to a specific store the recycler owns; ownership is verified on every request.
| Method | Path | Role |
|---|---|---|
| GET | `/api/recycler/stores` | recycler |
| POST | `/api/recycler/stores` | recycler |
| GET | `/api/recycler/stores/:id` | recycler |
| PUT | `/api/recycler/stores/:id` | recycler |
| POST | `/api/recycler/stores/:id/logo` | recycler (multipart `logo`) |
| GET | `/api/recycler/stores/:id/contacts` | recycler |
| POST | `/api/recycler/stores/:id/contacts/:contactId/connect` | recycler |
| GET | `/api/recycler/stores/:id/reviews` | recycler |

### Admin
| Method | Path | Role |
|---|---|---|
| GET | `/api/admin/stores?status=` | admin |
| POST | `/api/admin/stores/:id/approve` | admin |
| POST | `/api/admin/stores/:id/reject` | admin |
| GET | `/api/admin/analytics/summary` | admin |

### User-facing stores
| Method | Path | Role |
|---|---|---|
| GET | `/api/stores?lat&lng&radiusKm&category` | user |
| GET | `/api/stores/contacted` | user |
| POST | `/api/stores/:id/contact` | user (verified email required) |
| DELETE | `/api/stores/:id/contact` | user |
| GET | `/api/stores/:id/reviews` | user |

### Pickups
| Method | Path | Role |
|---|---|---|
| POST | `/api/pickups` | user |
| GET | `/api/pickups/mine` | user |
| GET | `/api/pickups/:id` | user (own) or recycler (own store) |
| PATCH | `/api/pickups/:id/cancel` | user |
| POST | `/api/pickups/:id/items/:itemId/photo` | user (own, while requested) |
| GET | `/api/pickups/store?storeId=&status=` | recycler |
| PATCH | `/api/pickups/:id/status` | recycler |

### Reviews
| Method | Path | Role |
|---|---|---|
| POST | `/api/reviews` | user (own completed pickup, once) |

## Data model (10 tables)
`User`, `Store`, `Contact`, `Pickup`, `PickupItem`, `Review`, `EmailVerificationToken`, `PasswordResetToken`, `RefreshToken`, plus Prisma's `_prisma_migrations`.

Enums: `Role`, `StoreStatus`, `ServiceMode`, `PaymentPolicy`, `PickupStatus`, `ItemCondition`, `EwasteCategory`.

## Repo layout
```
backend/
  prisma/           # schema.prisma, migrations, seed.js
  src/
    config/         # prisma client, mailer transport
    controllers/    # auth, recycler, admin, store, pickup, review
    middleware/     # auth (JWT), role
    routes/         # one per controller
    utils/          # jwt helpers, notify (email templates)
    server.js       # entry point
  uploads/          # logos/, avatars/, pickups/<id>/<itemId>.<ext>
frontend/
  app/              # App Router pages (login, register, forgot-password, reset-password, verify-email, user/recycler/admin dashboards)
  components/       # Avatar, Nav, ProfileEditModal, PasswordInput, PickupForm, ReviewForm, ReviewList, RoleGuard, StoreCard, StoreDetail, ThemeProvider, Toast
  lib/              # api (with auto-refresh), auth (session helpers), geolocation, types
SRS.md              # full requirements spec — keep in sync with every requirement change
README.md           # this file
```

## Development notes
- Distance sorting uses the Haversine formula via `prisma.$queryRaw` against the MySQL `Store` table.
- Access + refresh tokens live in `localStorage` (matches the `Bearer` pattern used by the API client). For production prefer httpOnly cookies + a CSRF strategy.
- Geolocation requires HTTPS in production browsers; on `localhost` it works over HTTP.
- All file uploads (logos, avatars, item photos) accept jpg / png / webp up to 2 MB and are served from `/uploads` via `express.static`.
- If `SMTP_HOST` is not set, the dev mailer logs every email to the API console — convenient for testing the verification / reset flows without an SMTP relay.
- Frontend type-check: `cd frontend && npx tsc --noEmit` — strict mode is on.

## Roadmap (out of scope for now)
Tracked in [SRS.md §1.3](SRS.md): map UI, payments, disposal certificates, image-based ML classification, push / SMS notifications, i18n, accessibility audit, automated test suite + CI/CD, OpenAPI + shared types, secret hygiene cleanup.
