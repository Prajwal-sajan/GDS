# SaveTrip-inspired Settings v16 — Implementation and Reverification

## Scope

Rebuilt the user-supplied Settings, Team & access, Access/Roles and Branding interfaces and wired their available workflows to the bundled Node.js/Express GDS. This work builds on the cumulative v14 frontend and v15 visual Settings patch, which already contains previous GDS modules.

### UI surfaces implemented

- Global header: pill navigation, language picker with 13 entries, active option checkmark, operator Settings dropdown, scrollable menu.
- Settings links: Team & access; Branding; Configuration; WhatsApp; Loyalty Program; Switch User; Change Password; My devices; About.
- Team & access: Office staff, Bus staff, Agents, Branches, Access. Live IAM users/roles/branch listing; staff adapter where permitted; search; dynamic counts; create/view/edit/delete modal workflows; role dropdown; active switch; agent commission, credit and mode; editable individual Permissions & routes.
- Access: Roles, Test access, Groups, Advanced. The screenshot permission surface has **77 permission rows**, divided into Trips & pickups, Bookings, Schedules, Routes, Fleet, Chats, Calls, Accounts, Daily Ops, Staff & HR, Offers & Loyalty, Users & access and Settings. Four-way scope chips, toggles, role creation/saving/deletion, actual user permission evaluation, group CRUD, audit/limits/export controls.
- Branding: Preview, Reset, Save, identity inputs, hex color and swatches, font selection, Light/Dark/System scheme with preview and saved styling, five independently uploadable assets, and PWA name and short name.
- Configuration: notification subscriptions, alert preferences, calling/GPS flags and bot preferences.
- WhatsApp: number identity, template list and add/edit/remove, with disconnected provider state.
- Loyalty: miles, weekdays, tiers, blackout dates, seat-upgrade rules/windows.
- Switch User: uses real user **ID** (fixes legacy phone-vs-ID mismatch), with backend-restricted view-as permissions.
- My devices: session list and revoke endpoint; OTP login now tracks session, last login, login count.
- Change Password: OTP-only architecture is identified, and the UI routes to actual device security instead of falsely changing an unimplemented password.
- About: build metadata and reload/update check UI.

## API changes

- New `server/api/settings-complete.js`: branding, branding assets (validated PNG/JPEG/WebP <= 1 MiB), WhatsApp templates, configuration UI data, branch editing/deletion safeguards, group CRUD, access evaluator, user deletion, session listing/logout/revocation.
- `server/api/misc.js`: properly scoped IAM user fields, individual grants/denials and route assignments; role UI scope/limit metadata persistence; role hierarchy checks; OTP user agent context.
- `server/auth.js`: session-backed OTP tokens and last-login metadata; revocation in middleware. Legacy tokens remain accepted until their existing expiry.
- `server/index.js`: registration of new routes before the existing `misc.r` fallback.

## Verification performed

| Check | Result |
| --- | --- |
| All source JS `node --check` | Passed |
| Existing static cumulative checks | Passed |
| Existing visual/reconciliation checks | Passed |
| Existing v14 communications assertions | Passed |
| New Settings API contract tests | 10 passed |
| Playwright headless browser with mocked API | Passed, zero page errors |
| Clicks covered by browser smoke | Branding Save, User Add, Role Save, Branch Add, WhatsApp template Save, Loyalty Save, Language selection |
| Browser rendering covered | 23 Settings routes/tab states, including Team, dropdown, 77-row Roles, Branding, Configuration, WhatsApp, Loyalty, Security and About |
| `npm test` full HTTP suite | **Not run successfully in current container** — Express dependency unavailable; run `npm ci` locally first |
| Live WhatsApp/telephony/SMS/PWA delivery | **Not verified** — no provider integrated |
| Screenshot pixel-by-pixel visual diff | **Not certified** — browser preview reviewed manually; environment/fonts can differ |

## Known limitations (not silently simulated as successful production behavior)

1. Per-resource Own/Branch/Company scopes and numerical limits are UI metadata. API permission keys are enforced where the underlying GDS already uses them, but scope rules still need query-level checks on each endpoint.
2. Team/agent counts and operators come from actual local data. Screenshot fixture identities and counts are not automatically substituted into production.
3. WhatsApp templates are persisted but not approved, submitted or delivered by an official WhatsApp Business provider. Cloud calling preferences do not place calls.
4. This app signs in by OTP. A reusable password does not exist, so changing a password would be misleading. Device revocation works only for newly tracked sessions; existing legacy tokens remain until expiry.
5. Branding uploads allow PNG/JPEG/WebP; SVG requires sanitization. PWA name/short name are stored, but an installable manifest and service-worker update are separate deployment tasks. Full UI translations beyond the selected language label are not implemented.
6. Browser tests used mocked API data; the new backend handlers were separately unit-tested without Express. An integrated server/browser run must be repeated locally with dependencies installed.

## Apply to the correct checkout

Use the standalone `Prajwal-sajan/GDS` Node.js repository, **not** the older `SupriyaPejavara/E-Yatra` .NET checkout in `C:\JourneyOS\GDS-Dev`.

For a checkout with the prior v15 patch already applied, apply `SaveTrip_GDS_Settings_v16_incremental.patch` using `git apply --check` followed by `git apply` if clean.

For the v14/v15 cumulative demo checkout, the ZIP overlay replaces only the new or updated files. The full cumulative source archive is a convenience snapshot; do not overwrite locally modified files without reviewing the diff.
