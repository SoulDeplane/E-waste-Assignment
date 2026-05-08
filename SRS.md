# Software Requirements Specification — E-Waste Platform

> **Living document.** Update this file every time a new requirement is added, changed, or removed.
> Last updated: 2026-05-08 (added Recycler-initiated Connect requirement, F-CON-01..05).

---

## 1.0 Project Overview

### 1.1 Introduction
The **E-Waste Platform** is a three-sided web application that connects ordinary users (people with electronic waste to dispose of) with authorised recyclers operating physical drop-off / pickup locations. Administrators moderate the platform by approving recycler listings before they become publicly visible.

The system is implemented as a Node.js + Express REST API backed by MySQL via Prisma, and a Next.js 14 (App Router) + TypeScript frontend. JWT-based authentication is used end-to-end, with short-lived access tokens and rotating refresh tokens.

### 1.2 Purpose
The platform exists to:
- Reduce informal e-waste disposal by making it easy for users to find a verified recycler near them.
- Give recyclers a low-friction channel to publish their service profile (categories accepted, hours, payment policy, pickup radius) and receive contact / pickup requests.
- Give regulators / platform admins a moderation surface to enforce quality and compliance (licence number, location accuracy, rejection reasons).
- Track recycling activity end-to-end (request → confirmed → completed → reviewed) so the platform can surface trust signals (ratings) and analytics (top categories, top stores, signups, pickups by status).

### 1.3 Scope
**In scope:**
- Account creation, email verification, password reset, refresh-token rotation.
- Geolocation-based store discovery with radius and category filters (Haversine formula in raw SQL).
- Recycler self-service profile (basic, about, hours, service mode, payment policy) plus logo upload.
- Admin moderation workflow (approve / reject with reason) and analytics summary.
- Pickup scheduling with item-level inventory (category, quantity, weight, condition, photos).
- Reviews & star ratings tied to completed pickups.
- User profile editing (name, email, phone, password, profile picture).
- Contact / revoke-contact lightweight expression of interest, kept alongside Pickups.

**Out of scope (deferred / future roadmap):**
- Map UI (Leaflet / Mapbox) — explicitly deferred per stakeholder direction.
- Online payments (Razorpay / Stripe) for `paymentPolicy = fee | pays`.
- Disposal certificate / PDF receipt after a completed pickup.
- Image-based ML classification of e-waste items.
- Push notifications, SMS, or in-app notifications (email only today).
- Internationalisation (English only today).
- Full WCAG accessibility audit.
- Tests (unit / integration / e2e) and CI/CD pipelines.
- OpenAPI / shared cross-stack types.
- Secret hygiene cleanup (`backend/.env` is currently committed).

---

## 2.0 Requirements

### 2.1 Functional Requirements

#### 2.1.1 Authentication & Account Lifecycle
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-AUTH-01 | A visitor can register with name, email, password (≥ 8 chars), role (`user` / `recycler`), optional phone. | Implemented | `POST /api/auth/register` |
| F-AUTH-02 | On successful registration the user is **logged in immediately** (soft-verification flow); a verification email is dispatched. | Implemented | Stakeholder change: "verification must be done after account is created not before" |
| F-AUTH-03 | Login authenticates by email + password and returns `{ accessToken, refreshToken, user }`. | Implemented | `POST /api/auth/login` |
| F-AUTH-04 | Login is **not** blocked for unverified users; sensitive actions (contacting a store) are gated separately. | Implemented | Replaces earlier hard-block decision |
| F-AUTH-05 | The user can request a password reset via email; the reset link is valid for 1 hour. | Implemented | `/forgot-password` → `POST /api/auth/forgot-password` |
| F-AUTH-06 | The user can reset their password with a valid token; all refresh tokens for the account are revoked on success. | Implemented | `POST /api/auth/reset-password` |
| F-AUTH-07 | Email verification is performed by clicking a tokenised link; the token is valid for 24 hours. | Implemented | `POST /api/auth/verify-email` |
| F-AUTH-08 | The user can re-request the verification email (rate-limited to 1/min per email). | Implemented | `POST /api/auth/resend-verification` |
| F-AUTH-09 | Access tokens are short-lived (15 m); refresh tokens are long-lived (30 d) and rotate on every refresh. | Implemented | `POST /api/auth/refresh` |
| F-AUTH-10 | If a revoked refresh token is replayed, **all** of that user's refresh tokens are revoked (reuse detection). | Implemented | Defence against token theft |
| F-AUTH-11 | Logout revokes the presented refresh token. | Implemented | `POST /api/auth/logout` |
| F-AUTH-12 | The frontend transparently refreshes the access token on `401` and retries the original request once. | Implemented | `frontend/lib/api.ts` |
| F-AUTH-13 | If refresh fails, the session is cleared and the user is sent to `/login?expired=1` with a banner. | Implemented | |
| F-AUTH-14 | Auth pages (login / register / forgot / reset / verify-email) all live under `/`. | Implemented | |
| F-AUTH-15 | Auth-related rate limiting: 30 requests / 15 min on the auth router. | Implemented | `express-rate-limit` |

#### 2.1.2 User Profile
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-PROF-01 | The Nav shows only a circular profile button on the right; details + theme toggle + log out only appear on click. | Implemented | Stakeholder requirement |
| F-PROF-02 | If the user has uploaded a profile picture, the avatar shows it; otherwise a default silhouette icon is shown. | Implemented | `Avatar.tsx` |
| F-PROF-03 | The dropdown menu contains: name + email + role badge, Edit profile, theme toggle, Log out — labels are centre-aligned. | Implemented | Stakeholder requirement |
| F-PROF-04 | Theme toggle in the dropdown shows plain text "Light mode" / "Dark mode" (no sun / moon emojis). | Implemented | Stakeholder requirement |
| F-PROF-05 | Edit profile modal supports updating name, email, phone, password, and profile picture. | Implemented | `ProfileEditModal.tsx` |
| F-PROF-06 | Email change requires the current password; resets `emailVerifiedAt` and triggers a fresh verification email. | Implemented | `PATCH /api/auth/me` |
| F-PROF-07 | Password change requires the current password and revokes all other refresh tokens. | Implemented | |
| F-PROF-08 | Profile picture upload accepts jpg / png / webp, max 2 MB; stored at `/uploads/avatars/{userId}.{ext}`. | Implemented | `POST /api/auth/me/avatar` |
| F-PROF-09 | Logout calls `POST /api/auth/logout` to revoke the current refresh token before clearing the session. | Implemented | |

#### 2.1.3 Recycler — Store Management
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-REC-01 | A recycler can create / update one store (1:1 with their account). | Implemented | `POST /api/recycler/store` |
| F-REC-02 | Store fields: name, address, latitude, longitude, accepted categories (≥ 1), description, year established, licence number, website, open days / time, service mode (drop-off / pickup / both), pickup radius, payment policy (pays / free / fee). | Implemented | |
| F-REC-03 | The "Languages spoken" field has been removed from the form. | Implemented | Stakeholder requirement; existing language data is preserved in DB / detail view. |
| F-REC-04 | The recycler can use the browser geolocation API to autofill latitude / longitude. | Implemented | `getCurrentPosition()` |
| F-REC-05 | Store starts as `pending`. Changing the location resets it to `pending` and clears the prior approval. | Implemented | |
| F-REC-06 | The recycler can upload a store logo (jpg / png / webp, max 2 MB). | Implemented | `POST /api/recycler/store/logo` |
| F-REC-07 | The recycler dashboard shows: contacts received, pickups (status-filtered) with action buttons, reviews of their store. | Implemented | |

#### 2.1.4 User — Store Discovery & Contact
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-USR-01 | The user dashboard auto-detects geolocation and lists approved stores sorted by Haversine distance. | Implemented | `GET /api/stores` |
| F-USR-02 | The list can be filtered by radius (5 / 10 / 25 / 50 / 100 km) and by category. | Implemented | |
| F-USR-03 | Each store card shows logo, name, distance, categories, year established, service mode, payment policy, and the average rating + review count when available. | Implemented | |
| F-USR-04 | Clicking **Details** opens the store-detail modal with full info, embedded review list, and a Schedule pickup CTA (when service mode allows pickup). | Implemented | |
| F-USR-05 | Clicking **Contact** records a Contact row, sends an email to the recycler, and shows a `Contacted` badge. | Implemented | `POST /api/stores/:id/contact` |
| F-USR-06 | The user can revoke a previously made contact. | Implemented | `DELETE /api/stores/:id/contact` — stakeholder requirement |
| F-USR-07 | **Users with an unverified email cannot contact a store.** Server returns `403 email_unverified`. The Contact button is disabled with an explanatory tooltip and the user dashboard shows a "Verify your email" banner with a Resend button. | Implemented | Stakeholder requirement (re-emphasised) |
| F-USR-08 | The dashboard refreshes `/api/auth/me` on mount so a verification clicked in another tab is reflected without re-login. | Implemented | |
| F-USR-09 | Contact list (`Contacted` set) is shared between revoke / contact actions and persists via `GET /api/stores/contacted`. | Implemented | |

#### 2.1.4a Recycler-Initiated Connection (Connect-back)
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-CON-01 | After a user has contacted a store, the recycler sees a **Connect** button next to that contact in the recycler dashboard's Contacts table. | Implemented | Stakeholder requirement |
| F-CON-02 | Clicking **Connect** marks `Contact.recyclerConnectedAt = now()`. The button is replaced with a `Connected` badge plus the "Sent {date}" label. | Implemented | `POST /api/recycler/contacts/:id/connect` |
| F-CON-03 | When `recyclerConnectedAt` is set, the user sees the message **"Recycler wants to connect"** on that store's card (replacing the `Contacted` + `Revoke contact` controls). | Implemented | Stakeholder requirement |
| F-CON-04 | After the recycler has connected, the user **cannot revoke** the contact. Server returns `400 connection_locked`; the UI hides the Revoke button and shows an explanatory toast if invoked otherwise. | Implemented | Stakeholder requirement |
| F-CON-05 | The connect endpoint is recycler-only and verifies that the contact belongs to the recycler's store (`403 Forbidden` otherwise). Repeated connects are idempotent (returns `already: true`). | Implemented | |

#### 2.1.5 Pickup Scheduling
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-PIC-01 | A user can schedule a pickup at an approved store from the store-detail modal (when service mode is `pickup` or `both`). | Implemented | `POST /api/pickups` |
| F-PIC-02 | A pickup carries: scheduled date, time slot (one of four 2-hour preset slots), pickup address, optional notes, and 1-15 items. | Implemented | |
| F-PIC-03 | Each item has: category (Prisma enum `EwasteCategory`), quantity (1-99), optional estimated weight (kg, 0-500), optional condition (`working` / `broken` / `unknown`), optional notes. | Implemented | |
| F-PIC-04 | The user can upload one optional photo per item while the pickup is still `requested`. | Implemented | `POST /api/pickups/:id/items/:itemId/photo` |
| F-PIC-05 | Status flow is server-enforced: `requested → confirmed | declined`, `confirmed → completed`, and the user can `cancel` while `requested` or `confirmed`. | Implemented | |
| F-PIC-06 | The user dashboard shows "My pickups" with a status badge, item summary, total estimated weight, cancel and "Leave a review" actions when applicable. | Implemented | |
| F-PIC-07 | The recycler dashboard shows pickups for their store, filterable by status, with Confirm / Decline / Mark completed buttons. | Implemented | `GET /api/pickups/store`, `PATCH /api/pickups/:id/status` |
| F-PIC-08 | Status transitions trigger emails to the user (`notifyPickupStatus`); creation triggers an email to the recycler (`notifyPickupRequested`). | Implemented | |
| F-PIC-09 | The legacy `Contact` action is **kept alongside** the new Pickup flow (lightweight "express interest" + heavier scheduled pickup). | Implemented | Stakeholder decision |

#### 2.1.6 Reviews
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-REV-01 | After a pickup transitions to `completed`, the user can leave one review with a 1-5 star rating and optional comment (up to 1000 chars). | Implemented | `POST /api/reviews` |
| F-REV-02 | Reviewing a non-completed pickup or a pickup that already has a review returns `400` / `409` respectively. | Implemented | |
| F-REV-03 | Store cards and the store-detail modal show `★ avgRating (count)` when ≥ 1 review exists. | Implemented | `GET /api/stores` returns aggregates |
| F-REV-04 | The store-detail modal embeds a paginated review list. | Implemented | `GET /api/stores/:id/reviews` |
| F-REV-05 | The recycler dashboard surfaces incoming reviews on their store. | Implemented | `GET /api/recycler/reviews` |

#### 2.1.7 Admin Moderation & Analytics
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-ADM-01 | Admin can list stores filtered by status (`pending` / `approved` / `rejected` / all). | Implemented | `GET /api/admin/stores` |
| F-ADM-02 | Admin can approve a store (sends email to recycler) or reject with an optional reason via an inline form (no `window.prompt`). | Implemented | `POST /api/admin/stores/:id/approve|reject` |
| F-ADM-03 | Admin sees an Analytics panel: totals (users, recyclers, stores, pickups), pickups by status, top categories (PickupItem.groupBy), top 5 stores by pickup count, signups over the last 30 days. | Implemented | `GET /api/admin/analytics/summary` |
| F-ADM-04 | Charts are rendered as CSS-only stat cards + horizontal bar lists (no external chart library). | Implemented | Stakeholder decision |

#### 2.1.8 Cross-Cutting UX Requirements
| ID | Requirement | Status | Notes |
|---|---|---|---|
| F-UX-01 | Every password input has an inline show / hide toggle (eye icon) at the right edge. | Implemented | `PasswordInput.tsx` |
| F-UX-02 | Every `<button>` element centre-aligns its label by default. | Implemented | `globals.css` rule |
| F-UX-03 | Dropdown-menu buttons are explicitly centre-aligned. | Implemented | |
| F-UX-04 | The "Resend verification email" button is full-width — same size as the Log in button — and centred on both the login form and the registration "check your email" screen. | Implemented | |
| F-UX-05 | Warnings, loading states, and placeholders end with three-dot ellipsis (`...`) — the single-character `…` is not used in user-facing strings. | Implemented | Sweep across all pages / components |

### 2.2 Non-Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| NF-01 | Passwords are hashed with bcrypt at cost factor 12. | Implemented |
| NF-02 | Refresh tokens, password reset tokens, and email verification tokens are stored as **SHA-256 hashes** server-side; the raw value is only ever sent to the user (cookie / email). | Implemented |
| NF-03 | All authenticated endpoints require a `Bearer` JWT; role enforcement via `requireRole(...)` middleware. | Implemented |
| NF-04 | CORS is locked to `FRONTEND_ORIGIN` with credentials enabled. | Implemented |
| NF-05 | Helmet security headers are applied (with `crossOriginResourcePolicy: cross-origin` so logos / avatars load). | Implemented |
| NF-06 | Auth endpoints are rate-limited to 30 req / 15 min. | Implemented |
| NF-07 | Email verification re-send is rate-limited to 1 / minute per email. | Implemented |
| NF-08 | All file uploads are limited to 2 MB and restricted to jpg / png / webp. | Implemented |
| NF-09 | All inputs at the API boundary are validated with Zod. | Implemented |
| NF-10 | Status transitions (pickups) and one-shot operations (review per pickup) are enforced server-side, never trusting client-supplied state. | Implemented |
| NF-11 | The UI must work without crashing on a 401 — silently refreshing the access token where possible. | Implemented |
| NF-12 | The user must not be able to escalate role via profile edit (role is excluded from `PATCH /api/auth/me`). | Implemented |
| NF-13 | The frontend `tsconfig` runs with `strict: true`. | Implemented |
| NF-14 | The dev mailer logs to console when `SMTP_HOST` is unset, so emails are debuggable without an SMTP account. | Implemented |
| NF-15 | The frontend caches geolocation for 60 s and times out after 10 s. | Implemented |
| NF-16 | The `Contact` revoke endpoint is idempotent (`deleteMany` returning `count`). | Implemented |
| NF-17 | The dev API server boots within ~3 s on a typical workstation. | Validated |

### 2.3 Database Requirements

**Engine:** MySQL 8.x. ORM: Prisma 5.22.

**Tables (10):**

| Table | Purpose |
|---|---|
| `User` | Account: name, email (unique), passwordHash, role enum, phone, profilePicUrl, emailVerifiedAt, createdAt |
| `Store` | Recycler-owned listing: location (Decimal 10,7), categories (JSON), service / payment policy, hours, status enum, approval metadata |
| `Contact` | Lightweight "expressed interest" record, unique per (userId, storeId), revocable |
| `Pickup` | Scheduled pickup: date, slot, address, status enum, transition timestamps |
| `PickupItem` | Per-pickup line items: enum category, quantity, weight (Decimal 6,2), condition, photoUrl |
| `Review` | One per completed Pickup; rating 1-5, optional comment, indexed by storeId |
| `EmailVerificationToken` | sha256-hashed verification tokens, 24 h TTL |
| `PasswordResetToken` | sha256-hashed reset tokens, 1 h TTL |
| `RefreshToken` | sha256-hashed refresh tokens, 30 d TTL, with rotation + revocation chain |

**Enums:** `Role`, `StoreStatus`, `ServiceMode`, `PaymentPolicy`, `PickupStatus`, `ItemCondition`, `EwasteCategory`.

**Indexes (representative):**
- `Store.status`
- `Pickup(storeId, status)`, `Pickup(userId, status)`, `Pickup.scheduledDate`
- `PickupItem.pickupId`
- `Review.storeId`, `Review.userId`
- `EmailVerificationToken.userId`, `PasswordResetToken.userId`
- `RefreshToken(userId, revokedAt)`

**Migrations applied (in order):**
1. `20260507094120_init`
2. `20260507214755_pickups_reviews_auth` — adds Pickup / PickupItem / Review / token tables and `User.emailVerifiedAt`.
3. `20260508002136_add_profile_pic` — adds `User.profilePicUrl`.
4. `20260508011521_recycler_connect_request` — adds `Contact.recyclerConnectedAt`.

### 2.4 Hardware Requirements

**Development workstation (validated):**
- CPU: any x86_64 (Intel / AMD) — 2 cores or more.
- RAM: ≥ 4 GB free (Next.js dev server + node + MySQL together comfortably fit in 4 GB; 8 GB+ recommended).
- Disk: ≥ 2 GB free for `node_modules` and the MySQL data directory.
- Network: localhost-only is sufficient for development; outbound HTTPS only required if using a real SMTP relay.

**Production target (recommended baseline):**
- App server: 1 vCPU / 1 GB RAM minimum (Node 18+) per replica.
- Database: a managed MySQL 8 instance with at least 1 GB RAM and persistent SSD storage.
- Object storage / disk for `/uploads` (logos, avatars, pickup item photos).
- SMTP relay (Mailtrap, SES, Mailgun, or similar).
- Browser geolocation requires HTTPS in production.

### 2.5 Software Requirements

**Runtime:**
- Node.js 18+ (CommonJS backend, ESM Next.js frontend).
- MySQL 8.x.
- npm 9+ (or compatible package manager).
- Modern evergreen browser with the Geolocation API (Chrome / Edge / Firefox / Safari).

**Backend dependencies (`backend/package.json`):**
- `express ^4.21`, `helmet ^8`, `cors ^2.8`, `express-rate-limit ^7`
- `@prisma/client ^5.22` (engine), `prisma ^5.22` (CLI, dev)
- `bcryptjs ^2.4`, `jsonwebtoken ^9`, `zod ^3.23`
- `multer ^1.4` (file uploads), `nodemailer ^6.9`, `dotenv ^16.4`
- `nodemon ^3` (dev only)

**Frontend dependencies (`frontend/package.json`):**
- `next 14.2`, `react 18.3`, `react-dom 18.3`
- `typescript` (strict mode), `@types/react`, `@types/node`
- No additional UI library; styles are hand-written CSS variables in `app/globals.css`.

**Environment variables:**

*Backend (`backend/.env`)*
- `DATABASE_URL` — MySQL connection string
- `PORT` — default 4000
- `FRONTEND_ORIGIN` — for CORS, e.g. `http://localhost:3000`
- `JWT_SECRET` — required
- `JWT_ACCESS_TTL` — default `15m`
- `JWT_REFRESH_TTL` — default `30d`
- `JWT_EXPIRES_IN` — legacy single-token expiry (default `24h`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`

*Frontend (`frontend/.env.local`)*
- `NEXT_PUBLIC_API_BASE` — e.g. `http://localhost:4000`

---

## 3.0 Testing

### 3.1 Types of Testing Done
| Type | Where | How |
|---|---|---|
| Static type-checking | Frontend | `npx tsc --noEmit` against `tsconfig` with `strict: true`. Run after every change. |
| Backend boot smoke test | API | `node -e "require('./src/server.js')"` to catch require / syntax errors. |
| HTTP smoke test | API | `curl` against representative endpoints to verify status codes (200 / 201 / 400 / 401 / 403 / 404 / 409). |
| Database migration verification | DB | `npx prisma migrate dev` with manual inspection of generated `migration.sql` and a `SHOW TABLES` count. |
| Manual end-to-end test | Full stack | Browser + dev console + DB queries against the verification scenarios in §3.2. |

**No automated test suite (Jest / Vitest / Playwright) exists yet.** This is acknowledged in §1.3 (out of scope) and tracked as a future requirement.

### 3.2 Test Cases

#### 3.2.1 Authentication
| TC | Steps | Expected | Status |
|---|---|---|---|
| TC-AUTH-01 | `POST /api/auth/register` with valid body. | `201` + `{ accessToken, refreshToken, user, verificationEmailSent: true }`; user is auto-logged-in. | Pass |
| TC-AUTH-02 | `POST /api/auth/register` with missing fields. | `400` with Zod fieldErrors. | Pass |
| TC-AUTH-03 | `POST /api/auth/register` with duplicate email. | `409 Email already in use`. | Pass |
| TC-AUTH-04 | `POST /api/auth/login` with bad password. | `401 Invalid credentials`. | Pass |
| TC-AUTH-05 | `POST /api/auth/login` with unverified user. | `200` (login is **not** blocked). | Pass |
| TC-AUTH-06 | `POST /api/auth/forgot-password` for unknown email. | `200 ok` (no leakage). | Pass |
| TC-AUTH-07 | `POST /api/auth/verify-email` with bogus token. | `400 Invalid or expired token`. | Pass |
| TC-AUTH-08 | `POST /api/auth/refresh` with bogus refresh token. | `401`. | Pass |
| TC-AUTH-09 | Replay a rotated refresh token. | `401` and **all** refresh tokens for that user are revoked. | Pass (manual DB check) |
| TC-AUTH-10 | Wait > 15 min, call any authed endpoint from the browser. | UI silently refreshes the access token and retries. | Pass (manual) |
| TC-AUTH-11 | Delete user's `RefreshToken` rows in DB; trigger an authed call. | Browser is redirected to `/login?expired=1`. | Pass (manual) |

#### 3.2.2 Profile
| TC | Steps | Expected | Status |
|---|---|---|---|
| TC-PROF-01 | Open Nav profile button. | Dropdown opens with avatar / name / email / role / phone, Edit profile, theme toggle, Log out. | Pass |
| TC-PROF-02 | Click outside or press Escape. | Dropdown closes. | Pass |
| TC-PROF-03 | Edit name only and save. | `PATCH /api/auth/me` succeeds; Nav avatar / name update without page reload. | Pass |
| TC-PROF-04 | Change email without current password. | `400 Current password is required ...`. | Pass |
| TC-PROF-05 | Change email with correct current password. | Email updated, `emailVerifiedAt` reset to null, verification email dispatched, session cleared and routed to `/login`. | Pass |
| TC-PROF-06 | Change password with mismatched confirm. | Client-side error "New passwords do not match." | Pass |
| TC-PROF-07 | Upload a PNG ≤ 2 MB as avatar. | Stored at `/uploads/avatars/{userId}.png`; Nav avatar updates. | Pass |
| TC-PROF-08 | Upload a 3 MB JPG. | `413 File too large`. | Pass |

#### 3.2.3 Store discovery & contact
| TC | Steps | Expected | Status |
|---|---|---|---|
| TC-USR-01 | Visit `/user/dashboard` with location allowed. | Stores listed in ascending distance order, ≤ radius. | Pass |
| TC-USR-02 | Apply category filter. | Only stores with that category remain. | Pass |
| TC-USR-03 | As **unverified** user, attempt to contact a store. | Contact button is **disabled** with tooltip; banner shows; if forced via API, server returns `403 email_unverified`. | Pass |
| TC-USR-04 | As verified user, click Contact. | `200`, badge flips to `Contacted`, recycler receives email. | Pass |
| TC-USR-05 | Click "Revoke contact" on a contacted store. | `DELETE /api/stores/:id/contact` returns `200`, badge disappears, button reverts. | Pass |
| TC-USR-06 | Click "Resend verification email" on the banner. | `POST /api/auth/resend-verification` returns `200`; second click within 60 s shows the rate-limit toast. | Pass |
| TC-USR-07 | Verify email in another tab, then reload dashboard. | Banner disappears; Contact button re-enables. | Pass |

#### 3.2.3a Recycler Connect-back
| TC | Steps | Expected | Status |
|---|---|---|---|
| TC-CON-01 | As verified user, contact a store. As recycler, click **Connect** in the Contacts row. | `POST /api/recycler/contacts/:id/connect` returns `200`; the Contacts row flips to `Connected` + "Sent {date}". | Pass |
| TC-CON-02 | As the user, reload the dashboard. | The store card now shows the message **"Recycler wants to connect"**; Revoke contact button is gone. | Pass |
| TC-CON-03 | As the user, attempt `DELETE /api/stores/:id/contact` directly (e.g., via curl) on a connected store. | `400 { error: "connection_locked" }`. | Pass |
| TC-CON-04 | As recycler B (with a different store), `POST /api/recycler/contacts/:id/connect` for a contact owned by recycler A's store. | `403 Forbidden`. | Pass |
| TC-CON-05 | Click **Connect** twice in rapid succession. | Second call is idempotent (`200` with `already: true`); only one `recyclerConnectedAt` timestamp is set. | Pass |

#### 3.2.4 Pickups
| TC | Steps | Expected | Status |
|---|---|---|---|
| TC-PIC-01 | Schedule a pickup with 2 items + 1 photo. | `201`, pickup row visible in user dashboard with status `Requested`. | Pass |
| TC-PIC-02 | As recycler, click Confirm. | `PATCH /api/pickups/:id/status` succeeds; status flips to `Confirmed`; user receives email. | Pass |
| TC-PIC-03 | As recycler, click Mark completed on a confirmed pickup. | Status → `Completed`, `completedAt` set. | Pass |
| TC-PIC-04 | As user, cancel a `requested` pickup. | Status → `Cancelled`. | Pass |
| TC-PIC-05 | As user, attempt to cancel a `completed` pickup. | `400 Cannot cancel a pickup that is completed.` | Pass |
| TC-PIC-06 | As an unrelated recycler, attempt to PATCH another store's pickup. | `403 Forbidden`. | Pass |
| TC-PIC-07 | Submit a pickup with `scheduledDate` in the past. | `400 Scheduled date must be today or later.` | Pass |
| TC-PIC-08 | Open a pickup with an item missing a photo. | OK; photo is optional. | Pass |

#### 3.2.5 Reviews & analytics
| TC | Steps | Expected | Status |
|---|---|---|---|
| TC-REV-01 | Leave a 5-star review on a completed pickup. | `201`; store card now shows `★ 5.0 (1)`. | Pass |
| TC-REV-02 | Submit a second review for the same pickup. | `409 You have already reviewed this pickup.` | Pass |
| TC-REV-03 | Try to review a non-completed pickup via API. | `400 You can only review completed pickups.` | Pass |
| TC-REV-04 | Open `/admin/dashboard`. | Analytics section renders totals, pickups-by-status bars, top categories, top stores, signups (last 30 d). | Pass |
| TC-REV-05 | Approve a pending store. | Approval email sent; admin counters update on next reload. | Pass |

#### 3.2.6 Cross-cutting UX
| TC | Steps | Expected | Status |
|---|---|---|---|
| TC-UX-01 | Click eye icon on any password field. | Field becomes plain text; click again → masked again. | Pass |
| TC-UX-02 | Inspect button labels site-wide. | All labels centre-aligned. | Pass |
| TC-UX-03 | Trigger any loading / warning state. | Text ends with `...` (three dots), not `…`. | Pass |

---

## 4.0 Result

### 4.1 Status
The project is a working MVP that fulfils every requirement listed in §2 with the exceptions called out in §1.3. All three planned deliverables (Pickups + Items, Reviews + Analytics, Auth completeness) plus the subsequent stakeholder requests (revoke contact, profile button + dropdown, avatar upload, profile editor, password visibility toggle, centred buttons, `...` style, soft-verification, verified-email gate on contact, language field removal, recycler-initiated Connect-back with revoke lock) have been implemented and manually verified.

### 4.2 What was delivered (high-level)
- 3 Prisma migrations producing 10 tables and 7 enums.
- 6 backend route files mounted under `/api/{auth,recycler,admin,stores,pickups,reviews}`.
- 9 frontend route pages (auth flows + 3 role dashboards).
- 14 React components (Avatar, Nav, ProfileEditModal, PasswordInput, PickupForm, ReviewForm, ReviewList, RoleGuard, StoreCard, StoreDetail, ThemeProvider, Toast, plus existing).
- A consistent UI style: dark / light theme, centred button labels, `...` ellipsis, a profile dropdown with avatar.
- A defence-in-depth verified-email gate for contacting a store.

### 4.3 Known gaps / next steps
Tracked, not done:
- Map UI (Leaflet / Mapbox) for browse + recycler picker.
- Payments (Razorpay / Stripe) tied to `paymentPolicy`.
- Disposal certificate PDF post-completion.
- Image-based ML classification for pickup items.
- SMS / push / in-app notifications.
- i18n + WCAG accessibility audit.
- Automated test suite (Jest + Supertest backend, Playwright e2e) and CI/CD.
- OpenAPI spec + shared TS types between backend and frontend.
- Secret hygiene: `backend/.env` is currently committed to the repo with real secrets; rotate `JWT_SECRET`, switch to `.env.example` only.

### 4.4 Verification commands
```bash
# Backend
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev          # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # strict type-check
```

### 4.5 Maintenance
This document is **a living specification.** Whenever a new requirement is stated, accepted, or completed:
1. Add or update the corresponding row in §2.
2. Add a corresponding test case in §3.2 (mark `Pending` until verified, then flip to `Pass`).
3. Update §4 status / known gaps as needed.
4. Bump the "Last updated" date at the top of this file.
