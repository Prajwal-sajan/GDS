# Daily Ops → Ratings / Settings (v44) — Screenshot implementation audit

## Reference
One browser screenshot provided on 23 November 2026 at `app.savetrip.in/gds`.
The reference shows the **AbhiBus** Settings tab; it does **not** show the content of the **RedBus** settings tab, any downstream success/error dialogs, actual live provider requests, or the server's credential storage design.

## Screenshot elements and implementation
| Screenshot element | GDS implementation | Status |
|---|---|---|
| Daily report / Ratings navigation | Existing `dailyops-parity-v12.js` SVG pill controls | Retained |
| OTA Ratings title / star icon | Existing vector icon / gradient title | Retained |
| Provider selection RedBus / AbhiBus | Active-state segmented selector in rating header | Implemented |
| Settings button with gear SVG | Opens and closes an **inline** settings section, not the old informational modal | Implemented |
| Refresh button with refresh SVG | Refreshes GDS ratings and reports that live OTA refresh is not available | Implemented; OTA feed blocked |
| Settings provider tabs RedBus / AbhiBus | Blue selected state, keyboard-accessible real buttons | Implemented |
| AbhiBus (EDGE) login heading | Inline heading | Implemented |
| AbhiBus EDGE login text and `edge.abhibus.com` | Reference descriptive copy plus an explicit truthful connector status | Implemented |
| EDGE username | Editable text field; server persistence; never hardcoded from someone else's screenshot | Implemented |
| EDGE password | Password-type field; shows "Saved. Leave blank to keep it" only when configured | Implemented |
| Password security notice | Read-only provider intention and never-disclose-again explanation | Implemented |
| Save / Cancel | Save API with validation, Cancel restores closed state without saving | Implemented |
| All services select | Existing service selector, now scoped to active OTA | Implemented |
| From / To date controls | Existing calendar selectors | Retained |
| 7 / 30 / 90 / 180-day shortcuts | Existing quick range filters | Retained |
| Overview / Needs action / All ratings / Not rated | Screenshot's four tabs; legacy Search Rank screen remains in code but hidden from this tab list | Implemented |
| Four ratings KPI cards | Existing vector icons; now scoped to active provider | Implemented |
| Real AbhiBus score 4.30 / 0.0% | Values depend on real records; demo screenshot values deliberately not copied | Data-dependent |
| RedBus settings inner fields | Reference does not expose those fields. A generic username/password interface is provided rather than inventing confirmed RedBus field names | Approximation |
| OTA provider sync every 3 hours | No approved OTA source adapter/endpoint documented; the UI explicitly shows auto collection inactive | Not integrated |

## API
- `GET /api/ota-ratings/settings` — `settings.view`; no plaintext or encrypted password returned; no-store.
- `PUT /api/ota-ratings/settings/:provider` — `settings.modify`; saves username + AES-256-GCM encrypted password only when `OTA_RATINGS_CREDENTIAL_KEY` contains 32 random bytes; blank password preserves existing ciphertext.
- `POST /api/ota-ratings/refresh/:provider` — `dailyops.view`; returns 409 `OTA_CONNECTOR_NOT_AVAILABLE` until an authorized connector is implemented; no fabricated ratings or false last-sync timestamp.
- Existing `GET /api/ratings` continues to provide actual GDS rating records, filtered on the browser by active OTA.

## Security and production readiness
- Never use `novtrvls` or another reference operator's credentials as a seeded default.
- Do not reuse `GDS_SECRET` to encrypt OTA credentials. Set a **separate** strong encryption key using, for example, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- The current GDS is a single-operator, disk-backed JSON database. Credentials are encrypted in this store, but a production multi-tenant deployment requires tenant-isolated secret management, credential rotation, backup protection, audit, and central secrets storage.
- The reference screenshot's statement that Refresh fetches every 3 hours **cannot be treated as live functionality** without provider authorization, endpoint documentation, a vetted read-only adapter, monitoring, and data reconciliation.
- Live OTA connection and actual three-hour polling, service joins, historical backfills, and verified provider permission remain blocking prerequisites before production certification.

## Verification
- JavaScript syntax parsing completed for updated screen, added frontend module, and new backend routes.
- Added `tests/ota-ratings-settings-v44.test.cjs`: API encryption/no key, preserve password, permissions, provider separation, false-sync guard, UI controls.
- Added `.github/workflows/ota-ratings-settings-v44.yml` for Node 20 CI. CI result must be checked independently.
