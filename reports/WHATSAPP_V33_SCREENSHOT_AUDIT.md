# WhatsApp v33 — Settings screenshot and Meta onboarding audit

Reference: the single user-uploaded screenshot of `Settings → WhatsApp` from 22 November 2026.

## Screenshot reconciliation

| Visible detail | Implementation |
| --- | --- |
| Existing global Trips / GDS / Chats / Calls header, language and Settings | Reused existing GDS top navigation |
| White page, centered 1020px content, 55px rounded green icon with outlined speech bubble | `public/css/whatsapp-v33.css` |
| Title: WhatsApp | `public/js/whatsapp-v33.js` |
| Subtitle: Send tickets and trip updates from your own WhatsApp number | Exact screenshot copy |
| Step 1: Log in with the Facebook account of your business owner | Exact screenshot copy |
| Step 2: Create or pick your business, and enter details exactly as on your GST certificate | Exact screenshot copy |
| Step 3: Add the phone number for WhatsApp and verify with Meta's code | Exact screenshot copy |
| Step 4: Add a payment card, when Meta asks | Exact screenshot copy |
| Warning about existing WhatsApp app number and existing passenger messaging | Exact screenshot copy; see note on evolving Meta coexistence |
| Green Connect WhatsApp button with line icon | Real Meta Embedded Signup launcher; no fabricated success |

No other dropdowns, filters, edit fields or buttons are visible in the provided screenshot. They have not been invented in the disconnected screen.

## End-to-end implementation

- On page load, read `GET /api/settings/whatsapp/onboarding` for authorization status and whether deployment has the required Meta credentials.
- If configured and authorized, prepare a short-lived, single-use, user/session-bound connection state and load the **official Meta Facebook JS SDK** on the WhatsApp page.
- On Connect, open **Meta Embedded Signup using the active Facebook Login for Business configuration**, collecting Meta's exchangeable code from the SDK and WhatsApp business/phone IDs from the trusted Facebook `WA_EMBEDDED_SIGNUP` event.
- Backend exchanges the code with Meta Graph API over HTTPS (requires a Meta Tech Provider/Solution Partner app and approved WhatsApp permissions), inspects WABA and verifies selected phone is present in that authorized WABA.
- Business access token is encrypted at rest using AES-256-GCM with `GDS_WA_ENCRYPTION_KEY`. No token or key is returned to the browser or stored in the browser.
- Shows **Pending registration** only after Graph verification. An authorized administrator enters the six-digit registration PIN; the server sends it to Meta `/{phone_number_id}/register`. Shows **Connected** only on confirmed `{success:true}` reply.
- Supports **Disconnect locally** (removes stored token). Revoking partner access inside Meta Business Manager is a separate action.
- All mutations require `settings.modify` and a real owner/admin, deny view-as and read-only actions, bind flow to original user/session, have expiry and one-use semantics, and audit state transitions.
- The original `/api/settings/whatsapp` message-template editor and storage remain unmodified, though the screenshot-aligned page no longer exposes their old local-only controls.

## Required live deployment configuration

```
META_APP_ID=<Meta app ID>
META_APP_SECRET=<Meta app secret, server only>
META_WHATSAPP_CONFIG_ID=<Facebook Login for Business Configuration ID>
GDS_WA_ENCRYPTION_KEY=<32 random bytes expressed as 64 hexadecimal characters>
META_GRAPH_API_VERSION=v24.0  # optional; choose a supported Meta Graph API version
```

Set a valid HTTPS domain in Meta app/business login settings, including the JavaScript SDK allowed domain. The code uses V4-compatible signup arguments, rather than retired V2/V3 `sessionInfoVersion`. Later Meta signup versions can change event payload shape. The handler accepts V4 and message-account-id array shapes and must be retested for the specific Meta app configuration in production.

## What is not falsely asserted

- No Meta credentials are present in this repository, so a live business number was **not** connected or tested.
- WhatsApp templates, approved outbound business messages, webhooks, delivery receipts, prepaid/billing setup, coexistence, and business verification depend on Meta permissions and separate messaging/ops integrations; successful phone registration does not alone activate outbound automated reminders.
- A newer Meta coexistence path may allow select existing WhatsApp Business app numbers. The screenshot's warning is reproduced for fidelity but should be updated if that Meta option is enabled and verified.
- The existing prototype GDS JSON database has a single operator metadata space. True multi-tenant WhatsApp asset isolation and production-grade key custody/storage must be implemented before offering self-service signup to unrelated operators.
- A permanent unrevoked Meta business token may still require partner-managed system-user integration and webhook verification. This module verifies code and phone registration, not message sending.

## Files

`server/api/whatsapp-v33.js`, `server/index.js`, `public/js/whatsapp-v33.js`, `public/css/whatsapp-v33.css`, `public/index.html`, `tests/whatsapp-v33-api.cjs`, `tests/whatsapp-v33-ui.cjs`, `.github/workflows/whatsapp-v33.yml`.

## Acceptance

Run `node tests/whatsapp-v33-api.cjs` and `node tests/whatsapp-v33-ui.cjs`, then `npm test` and pre-existing Settings/Configuration regressions. CI mocks the Meta Graph API; a Meta-approved sandbox/real onboarding test is a separate release gate.
