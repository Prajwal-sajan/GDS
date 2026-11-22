# Team & access — Access continuation v28
## Screenshot-by-screenshot implementation and functional evidence

Source: 18 supplied SaveTrip screenshots from 2026-11-22, spanning the Access sub-tabs and a long native Test access dropdown. Continuation of **v27**, not a replacement for the 89-row permission matrix. Each image corresponds to the saved timestamp below. No screenshot demo users, counts, roles, or grants are hardcoded as live operator data.

| Screenshot | Exact observed element(s) | Implementation |
|---|---|---|
| \`200153.png\` | Advanced selected; intro explaining extra rules and role precedence; primary **+ New rule**; four round preset chips; YOUR RULES; "No rules yet. Everyone works by their role until you add one." | \`public/js/team-access-v28.js\` Advanced, \`team-access-v28.css\`; persistent rule CRUD in \`server/api/team-access-v28.js\` |
| \`195014.png\` | Original Roles grid; Bookings; compact grey/blue/green status dropdowns; 10 role columns; sticky Save/footer | Retained v27 matrix; not overwritten |
| \`195123.png\` | Chats action list and scoped dropdown (Off, Own, Branch, Company) | Retained v27 Chats; same native dropdown options |
| \`195159.png\` | Calls / call history; native scope dropdown and Accounts transition | Retained and updated screenshot-specific Call history dropdown to Off/Own/Company |
| \`195219.png\` | Accounts section, sales, transactions, ledger, reports, invoices, settlements | Retained v27 Accounts matrix |
| \`195236.png\` | Accounts native dropdown and same financial rows | Retained v27 Accounts matrix |
| \`195304.png\` | Daily Ops, Daily report scoped dropdown Off/Branch/Company, View ratings and staff transition | Captured in v27 schema with exact Daily report choices |
| \`195339.png\` | Users & Access, View users native Off/Branch/Company reach levels; add/edit/change/remove users | Captured in v27 schema with exact View users choices |
| \`195444.png\` | **New role** inline form with NEW ROLE label, Name (e.g. City Supervisor), Starts from (Choose a role), disabled Create, Cancel, explanatory inheritance note | Inline form added to the existing Roles grid; backend creates custom role with validated starting role permission snapshot |
| \`195543.png\` | **Test access** selected; "Check what a person can or cannot do, and why"; CAN THIS PERSON...?; Person / 10-digit mobile, action picker, + Situation (e.g. route, seats), disabled Check and help text | v28 Test access page, POST evaluator and expandable situation form |
| \`195642.png\` | Native Test access dropdown begins with trip/pickup and booking permission items | 89-action native select, first item "Add something to check...", trip and booking actions in source order |
| \`195703.png\` | Dropdown continues with Schedule actions (including edit expenses, assign bus, assign crew) and Routes | Full action list, Schedule ordering aligned to screenshot |
| \`195736.png\` | Dropdown Routes actions through Fleet and Chats | All distinct action labels preserved from v27 schema |
| \`195802.png\` | Dropdown Chats, Calls, Accounts start, including Sales, Transactions, Ledger, Reports, Export/download | Accounts picker orders Export immediately after Reports |
| \`195829.png\` | Dropdown Accounts end, Daily Ops, Staff/HR, Offers and Users start | All actions included |
| \`195915.png\` | Dropdown Users & Access and Settings end, including WhatsApp setup and Sarathi | Full final action options, no invented section headers inside dropdown |
| \`195942.png\` | Dropdown end with all Users & Access and Settings options and persistent Situation/Check below | Native scrollable dropdown with complete list |
| \`200136.png\` | **Groups** selected; explanatory line, one-line New group field, grey disabled + Create, empty state with no rows | v28 group quick-create screen, live member editing/removal and group CRUD |

### Advanced rules — actual behavior

All four screenshot preset buttons work and prefill editable rule forms:

1. **Limit seat blocks (3 seats, 24 h):** server-side caps on booking seat blocks by actual operator/role/group/person subject; max seat count and expiry duration enforced by the GDS seat-block endpoint.
2. **No cancelling within 2 h of departure:** actual departure-relative cancellation gate on the booking cancel endpoint, with Test access scenario explanation.
3. **Seat blocks only on routes with the person's corridor tag:** fail-closed check of route \`tags\` against user \`corridor_tags\`; person tags are now manageable from Edit user → Permissions & routes.
4. **Read-only (view everything, change nothing):** restricts mutating authenticated API requests; never grants otherwise missing read access. The organization owner is protected from locking out operator recovery using an Everyone rule.

The rule builder supports subjects **Role, Group, One person, Everyone**, deny and limit effect, conditions (always, departure within hours, corridor mismatch, mutable action), numeric inputs, Save/Cancel, edit, enable/disable and delete. Rule changes and group membership updates are audited; affected active sessions are revoked. Deny takes precedence over permitted role grants, and multiple seat limits combine using the strictest maximum.

### Test access — full dropdown and decision output

The source screenshots show the native options list but no selected action result or open Situation form. The implementation therefore uses the screenshot's observed shell precisely while completing unseen workflow details using conservative behavior.

The actual Test flow takes a **10-digit existing user phone** and one of **89** canonical actions; optionally route, seat quantity, seat-block duration, departure lead time, or branch. The backend returns **Allow, Deny, or Conditional** with the underlying role setting, matching advanced rule, group membership and why. Missing Own/Branch ownership or conditional-rule context reports **Conditional** rather than pretending access is granted. Results clearly distinguish policy evaluation from live API transaction testing.

### Groups — actual behavior

Screenshot empty state renders no artificial data. New group name becomes creatable when valid; created groups appear with name, member count, edit member controls and delete action. Groups have real membership in the operator database, and member changes immediately affect group-targeted rules. A group with active rule references cannot be deleted without removing its rules first.

### New role — actual behavior

Name and Starts from are required; Create disabled until both are provided. The backend rejects owner/admin source roles and duplicate custom names. A new role is initialized from the selected source role's **current permissions, scopes and numeric limits (snapshot)**, then opens in one-role editing mode. It does not silently inherit arbitrary future privilege escalations.

### Validations and architecture notes

- All APIs are authenticated and require appropriate \`settings.view\`, \`iam.manage_users\` or \`iam.manage_roles\` rights.
- Rule/Group writes are audited and persisted locally; resource ownership checks are applied to person/group management where available.
- V28 installs after V27 using separate scoped CSS/JS assets; v27 role matrix and all previous settings screens remain intact.
- Screenshot content is the reference for visual shell and visible choices; the images do **not** reveal an Advanced rule editor, group member editor, open Situation form or Test result. Those unseen states are intentionally designed from functional requirements rather than falsely claimed to be pixel-identical to an unseen competitor screen.
- **Production boundary:** Some of the 89 matrix permissions still require endpoint-specific scope guards across all GDS modules (notably chat/calls, reports and some operational records). V28 Test access makes that distinction clear. User-specific corridor tags are available, but bus route tags must also be maintained in route configuration for corridor matching.
- Screenshot comparisons were not performed in a real browser against the competitor DOM; visual parity is based on the provided screenshots, HTML/CSS structure and automated DOM assertions.

### Files and tests

- \`server/team-access-policy-v28.js\` — restrictive policy evaluator, rule precedence, scoped decisions, read-only flag.
- \`server/api/team-access-v28.js\` — groups, advanced rules, 89-action simulator endpoints.
- \`server/access-runtime-v27.js\` — apply advanced rules on actual cancellation, seat block limits and previously guarded calls.
- \`server/api/team-access-v26.js\` — starting-role clone and corridor tag persistence, screenshot option restrictions.
- \`server/index.js\` — authenticated v28 API routes and global read-only mutation gate.
- \`public/js/team-access-v28.js\` — screens, buttons, forms, native options, result explanation and groups.
- \`public/css/team-access-v28.css\` — screenshot alignment and responsive styles.
- \`tests/check-team-access-v28.cjs\` — real GDS role cloning, group CRUD/session changes, rule CRUD/deny precedence, actual booking/corridor/seat cap enforcement.
- \`tests/team-access-v28-ui.cjs\` — DOM screenshot controls, action options, template and group CRUD, person/situation/check, and new-role flows.
- \`.github/workflows/team-access-v28.yml\` — v28 tests and prior v26/v27/GDS regressions.
