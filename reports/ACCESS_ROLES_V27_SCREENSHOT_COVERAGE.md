# Team & access / Access / Roles v27 — 20-screenshot coverage audit

**Source**: 20 uploaded SaveTrip screenshot captures (2026-11-22 19:40–19:49). The screenshots depict **one long scrollable Access → Roles permission matrix**; do not mistake the repeated header and footer in each scrolled capture for independent screens.

**Target**: \`#/settings/team-access/access/roles/viewer\` in the standalone GDS, on top of v26. Operator data is not seeded or overwritten from screenshot examples.

## Screenshot structure and controls

- **Header**: Team & access, bus symbol, How to, Add User. Office staff, Bus staff, Agents, Branches, Access tabs and counts. Access selection gradient.
- **Access subtabs**: Roles, Test access, Groups, Advanced.
- **Roles intro**: "For one person only, use Edit user → Permissions & routes"; "What each role can do"; instructions about picking roles and areas.
- **Toolbar**: ‹ Back to one role (now opens the actual single-role editor), + New role (actual create), Search (filters full matrix), compact legend Off / Own / Branch / Company / On and em dash for disallowed role/action combinations.
- **Table**: sticky WHAT row and leftmost WHAT column, horizontally scrollable across ten screenshot roles. Each capability has a real native dropdown with precisely either Off/On or Off/Own/Branch/Company options. Inapplicable combinations render "—", no dropdown.
- **Section headers**: soft gray band, uppercase labels.
- **Inline numeric limits**: Cancel tickets (cut-off hours before departure); Block seats (maximum seats and maximum block duration in hours). Empty means no limit.
- **Footer**: Save changes button (disabled when unchanged or not authorized), limit explanation, unsaved-changes counter. Save validates every changed cell, preserves other roles, rejects stale concurrent updates, persists, audits and revokes sessions.

## Full screenshot action inventory (89 distinct rows)

| Section | Count | Captured action labels |
|---|---:|---|
| TRIPS & PICKUPS | 4 | View trip sheets & pickup charts; Mark boarded / no-show, passenger notes; See bus location; Call passengers and crew |
| BOOKINGS | 11 | Book tickets; View bookings; Edit passengers & points; Cancel tickets; Shift seat / date; Send passenger messages (delay, pre-boarding, resend ticket); Add comments to a PNR; Book on behalf of agents; Block seats; Unblock seats / book a blocked seat; See passenger phone numbers |
| SCHEDULES | 12 | View schedules & seat layouts; See who is booked on a schedule; View income & expenses; Edit timings, coach & delay; Edit expenses; Change cities, pickups & drops; Assign bus; Assign crew (driver, conductor, helper); Edit fares; Switch schedules on / off; Create schedules / import trip sheets; Delete schedules |
| ROUTES | 11 | View routes; Create routes; Edit general details (name, coach, settings, route map); Change cities & timings; Change pickups, drops & breaks; Change fares; Block seats on the route; Change cancellation rules; Change expenses; Update (shift the timings of its schedules); Delete routes |
| FLEET | 8 | View vehicles & fleet map; Add vehicles; Edit vehicles & documents; Delete vehicles; Share a bus location link; View coaches / seat layouts; Create & edit coaches; Delete coaches |
| CHATS | 5 | View trip chats; Reply / send photos; Change chat status / mark read; Delete chats, block or report passengers; Share / revoke chat links |
| CALLS | 4 | Make calls; View call history; Listen to recordings; Manage speed dials |
| ACCOUNTS | 10 | Sales; Transactions & receivables; Add / delete ledger entries; Reports; Invoices & statements (view / pay); Settlements (view); Upload & match settlements; Agent settings (terms, credit, commission); Send payment links / collect; Export / download |
| DAILY OPS | 4 | Daily report; View ratings; Follow up on ratings (status, comments); Import ratings |
| STAFF & HR | 5 | View staff; Add / edit staff; Attendance (view, correct, approve); Advances & reimbursements; Payouts (generate, approve, mark paid) |
| OFFERS & LOYALTY | 4 | Coupons; Branch offers at the counter; Loyalty program settings; Seat-upgrade settings |
| USERS & ACCESS | 6 | View users; Add users (roles below their own); Edit users (name, branch, status, routes); Change a user's role; Remove users; Change what roles can do |
| SETTINGS | 5 | Configuration & notifications; Branding; Branches; WhatsApp setup; Use Sarathi (AI assistant) |

**Role column order**: Viewer; Bus crew (Driver, Conductor, Helper); Agent; Service Associate; Booking Executive; Pickup Manager; Service Agent; Accountant; Branch Admin; Manager. Additional user-created roles appear after the standard screenshot columns, without replacing them.

## Code changed

- \`server/team-access-schema-v27.js\`: canonical screenshot inventory, per-cell allowed options, per-role impossible combinations, v26 label migration, numeric limit definitions
- \`server/api/team-access-v26.js\`: revision-checked saving of granular per-role matrix values and limits; validate all submitted cells before persistence; audit and revoke sessions
- \`public/js/team-access-v26.js\`: matrix dropdowns, search, unavailable cells, limits, dirty state, 10-column and one-role modes, New role dialog, targeted Save
- \`public/css/team-access-v26.css\`: screenshot table proportions, sticky headers and column, row dividers, colored On/Off/Own/Branch/Company fields, limit inputs, scroll and mobile behavior
- \`server/access-runtime-v27.js\`: runtime policy checks on supported GDS operations
- \`server/api/ops.js\`: booking Own/Branch policy, masking passenger phones, cancel cut-off, seat block seat/hour limits, assignments, comments and on-behalf booking
- \`server/api/master.js\`: fine-grained route/fleet/staff mutation/view permission checks
- \`server/api/accounts.js\`: export/download authorization for CSV sales, receivables and reports
- \`server/domain.js\`: expiry-aware seat block occupancy calculation
- \`server/auth.js\`: new distinct API permission codes for actions that were incorrectly conflated
- \`server/api/settings-v16-iam-bridge.js\`: preserve v27 granular policy when legacy advanced role fields are saved

## Verification and operational safety

\`node tests/check-team-access-v27.cjs\` validates all 89 rows, ten columns, impossible cells, disallowed role changes, stale update protection, persisted limits, session revocation and selected live GDS API permissions. \`node tests/team-access-v27-ui.cjs\` tests every group, toolbar, native dropdown values, disabled cells, search, limits, single-role view, creating a role and saving without overwriting other roles. The existing v26 Team and GDS regression suites are also run in GitHub Actions.

**Data integrity:** The screenshots' example role settings are used as reference for structure and applicability; they are *not silently imposed as actual permissions*. Operator role assignments and data remain authoritative. No script reseeds the normal operator database.

**Production boundary:** Some permission codes are enforced in the actual API paths listed above. The 89-cell editor is NOT a certification that every row and Own/Branch/Company scope is enforced on every possible downstream endpoint. Remaining work includes trip/driver visibility, reports and export formats outside the guarded Accounts CSV routes, chat/call integrations, permissions for unsupported screen actions, and full tenant/branch filtering across all GDS modules. These must be finished and security-tested before production delegation. Visual screenshot styling also requires real Chrome viewport-by-viewport UAT for pixel-perfect certification.
