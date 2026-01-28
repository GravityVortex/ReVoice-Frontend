# Auth Redirect + Access Control Implementation Plan (Next.js App Router)

This document describes the standard, production-grade pattern to protect pages and APIs:

- Unauthenticated users visiting protected pages are redirected to `/{locale}/sign-in?callbackUrl=...`
- After successful sign-in, users return to the original page.
- Real security is enforced at the API / server-action layer (session + ownership checks). Page redirects are UX.

The goal is to implement this with minimal complexity (KISS) and eliminate bypass opportunities.

---

## 1) Current Situation (Repo-Specific)

- There is already a middleware-like implementation in `src/proxy.ts`, but Next.js only runs `middleware.ts` at the repo root, so this code is currently not active.
- Some protected pages do ad-hoc `getUserInfo()` checks and render `Empty message="no auth"` instead of redirecting.
- Several APIs accept `userId`/`key` from the client or do not check resource ownership. This enables horizontal privilege escalation even if pages are protected.

---

## 2) Requirements (Behavior Spec)

### 2.1 Unauthenticated access to protected pages

- If a user is not signed in and visits a protected page:
  - Redirect to `/{locale}/sign-in`
  - Include `callbackUrl` containing the originally requested *relative* path + query string (no host).
  - Example:
    - Request: `GET /zh/settings/billing?page=2`
    - Redirect: `302 /zh/sign-in?callbackUrl=/settings/billing?page=2`

### 2.2 Successful sign-in

- On sign-in success, redirect to `callbackUrl` (or `/` if missing/invalid).

### 2.3 Authenticated but unauthorized (RBAC/admin)

- Not-authenticated: redirect to sign-in.
- Authenticated but lacking permission: return `403` (API) or redirect to `/{locale}/no-permission` (page).

### 2.4 Security constraints (must-have)

- `callbackUrl` must be sanitized to prevent open redirects:
  - Must start with `/`
  - Must not start with `//`
  - Must not contain a scheme (`http:` / `https:`)
  - Should have a length cap (to avoid header/query bloat attacks)
- Protected APIs must enforce:
  - `401` if no valid session
  - `403` or `404` if resource does not belong to the current user (ownership checks)
  - Never trust client-provided `userId` to select/modify another user’s data

---

## 3) Route Classification (What Is Protected)

### 3.1 Protected (requires sign-in)

These should redirect to sign-in when unauthenticated:

- `/dashboard` and all subpaths
- `/settings` and all subpaths
- `/activity` and all subpaths
- `/video_convert` and all subpaths
- `/chat` and all subpaths (including `/chat/history` and `/chat/[id]`)

### 3.2 Admin-only (requires sign-in + permission)

- `/admin` and all subpaths

### 3.3 Public (no sign-in required)

- Landing pages, pricing, docs, etc.
- Auth pages:
  - `/sign-in`, `/sign-up`
- Legal pages:
  - `/privacy`, `/terms` and the stable aliases

---

## 4) Standard Architecture (Two Layers)

### Layer A: Page-level redirect (UX + performance)

Use Next.js middleware to stop unauthenticated users *before* rendering protected pages.

- Pros: fast, consistent, prevents UI from flashing.
- Cons: a cookie-existence check is not always a full session validation (depends on auth mechanism). This is acceptable as a first gate as long as Layer B is correct.

### Layer B: API/server-action authorization (real security)

Every API route and server action that reads/writes user data must enforce:

- Authentication: session must be valid.
- Authorization: resource ownership / RBAC permission.

Without Layer B, users can bypass page redirects by calling APIs directly.

---

## 5) Implementation Plan (Phased)

### Phase 1: Activate middleware (single source of truth)

1) Create repo-root `middleware.ts` and have it call the existing implementation (or move `src/proxy.ts` to `middleware.ts`).
   - Avoid duplicate logic; keep one implementation.

2) Expand the protected prefixes in the middleware:
   - Add `/dashboard`, `/video_convert`, `/chat` to the existing `/admin`, `/settings`, `/activity`.

3) Redirect target:
   - Keep: `/{locale}/sign-in?callbackUrl=...`
   - `callbackUrl` should be the *relative path without locale prefix* + query string.
     - This matches how `SignIn` currently prefixes locale client-side.

4) Sanitize `callbackUrl`:
   - Even though middleware constructs the callback, the sign-in page must still sanitize the incoming query parameter.
   - Add a single helper function, used in both:
     - `src/app/[locale]/(auth)/sign-in/page.tsx` (server-side sanitize)
     - `src/shared/blocks/sign/sign-in.tsx` (defensive client-side sanitize)

Definition of done (Phase 1):
- Visiting `/zh/settings/profile` while logged out always yields a redirect to `/zh/sign-in?callbackUrl=/settings/profile`.
- Visiting `/zh/video_convert/myVideoList` while logged out also redirects correctly.
- After sign-in, user lands back on the original page.

### Phase 2: Server-side guard in layouts (optional hardening)

Goal: eliminate the “cookie exists but session invalid” edge case without spreading logic.

Approach:
- Add a server wrapper layout for protected route groups that can call `getSignUser()` and redirect if missing.
- For route groups with client layouts (e.g. `(dashboard)`, `(chat)`), split layout:
  - `layout.tsx` (server): auth check + render client layout
  - `layout.client.tsx` (client): UI only, no redirect logic

Definition of done (Phase 2):
- With an expired/invalid cookie, protected pages still redirect to sign-in instead of rendering partial UI.

### Phase 3: Secure APIs (mandatory for “no bypass”)

Start with the highest-risk issues (known bypass paths):

1) Chat messages ownership:
   - `/api/chat/messages` must verify that `chatId` belongs to `currentUser.id` before returning messages.

2) Side-effect pages/handlers:
   - `/activity/ai-tasks/[id]/refresh` must require sign-in and verify `task.userId === currentUser.id`.

3) Video conversion APIs:
   - Eliminate client-provided `userId` authority:
     - `/api/video-task/list` must use session userId (ignore query `userId`)
     - `/api/video-task/create` must use session userId (ignore form `userId`)
   - Any mutation must require sign-in + ownership check:
     - delete, update, subtitle edits, etc.
   - Download signing must not accept arbitrary `key`:
     - accept `taskId/fileId`, look up the key in DB, check ownership, then sign.
   - Remove “GET deletes data” patterns:
     - convert destructive endpoints to POST/DELETE.

Definition of done (Phase 3):
- No API returns another user’s data.
- No API allows modifying/deleting resources not owned by the caller.
- Download endpoints cannot be used to sign arbitrary paths.

---

## 6) Testing Plan (Minimal but Effective)

### 6.1 Manual (smoke)

- Logged out:
  - Access `/zh/settings/profile` -> redirect to `/zh/sign-in?callbackUrl=/settings/profile`
  - Sign in -> lands back on `/zh/settings/profile`
- Logged in:
  - Access protected pages directly -> no redirect
- Admin:
  - Logged in without permission -> `/admin/*` -> redirect to `/no-permission`

### 6.2 Security checks

- Open redirect attempts:
  - `/zh/sign-in?callbackUrl=https://evil.com` must ignore and default to `/`
  - `/zh/sign-in?callbackUrl=//evil.com` must ignore and default to `/`
- Ownership checks:
  - Using a known `chatId` of another account must not return messages.
  - Using another user’s `fileId/taskId` must not return video resources or signed URLs.

---

## 7) Notes / Principles (Keep It Simple)

- Middleware protects pages; APIs protect data. Do not confuse UX with security.
- Prefer a single helper for:
  - “is this path protected?”
  - “sanitize callbackUrl”
- Avoid sprinkling `if (!user) return <Empty ...>` throughout pages once middleware/layout guard is correct.

