# Team & access v26 — screenshot implementation and audit

## Source and design

The supplied November 22, 2026 screenshots show the Settings → Team & access navigation with five modules: Office staff, Bus staff, Agents, Branches and Access. The v26 implementation extends the existing GDS rather than replacing its shared navigation, and uses current authenticated data rather than inventing the screenshot's sample staff or phone numbers.

### Coverage by screen

| Screen | Reference controls represented |
|---|---|
| Header and tabs | Bus logo tile; gradient Team & access; How to; contextual Add User / Add agent; Office staff, Bus staff, Agents, Branches, Access tab cards with dynamic counts and selected gradient |
| Office staff | Avatar and name, phone, role chip, active switch, last login, View/Edit/Delete, search by name or phone; Add office staff modal |
| Bus staff | Staff list and role color, view modal with Phone, Status, Email, Language, Last login, Added, Permissions; Edit/Close |
| Add/Edit User | Phone, Name, Email, language dropdown, role dropdown and capability preview, optional branch, Permissions & routes and Active status; scrollable form with fixed header/footer and Save/Cancel |
| Permissions & routes | Separate dialog with heading, limit-to-chosen-routes No/Yes selector, route checklist, individual permission overrides, warning about sign-out, Save/Cancel |
| Agents | Agent settings link, Active, Mode, last login, View/Edit/Delete; Edit Agent has Agent/Master agent cards, Online/Offline cards, helpful subtitles, settlement terms, master hierarchy, branch and permission controls |
| Branches | Empty state, New branch; Code, Name, City, Contact phone, Address, People explanation, segmented Sales only/Cities/Routes/Both with contextual city and route checkboxes; View/Edit/Delete and member count |
| Access | Roles, Test access, Groups, Advanced; search field; new role; permission legend Off / Own / Branch / Company / On; ten-column horizontal role matrix with sticky headings and API-backed Save |
| Access extras | Test user effective permissions; create, edit and remove groups; limits metadata and role export |

## End-to-end backend

API endpoint group: /api/team-access/v26.

- GET root: users, staff, branches, roles, route and city lists, access matrix schema and caller capabilities.
- POST/PUT/DELETE users: create identities, update role and branch, status and language, agent subtype and mode, commission/credit/settlement settings, route and individual permissions; archive user rather than destroy audit history.
- POST/PUT/DELETE branches: code uniqueness, fields, city/route selection, operations area validation, block deletion with assigned users.
- PUT roles/batch: validates all matrix columns and row options, updates API grant codes and stored scope metadata, revokes affected user sessions.
- POST/DELETE roles: custom role lifecycle, disallow deletion of built-in or assigned roles.
- GET evaluate/:id: server-evaluated permission codes, user branch and route assignments, effective role and group membership.

Source security: server/auth.js disallows OTP or token access to archived identities and Offline agents. Owner protection, self-role/self-disable protection, role rank limits, permission grant validation and session revocation are applied. Agent hierarchy forbids self-parenting, nested unsupported master structures, demotion or deletion of masters with active subagents. Crew and manager identities are matched to Staff records by phone without overwriting payroll or bank details. Access history is audited.

A preexisting issue where platform-billing invoice permissions inadvertently intercepted unrelated API paths was corrected by limiting that middleware to /accounts/invoices-v25. Legacy IAM user reads and branch reads were limited to own branch or privileged organization-wide roles; legacy permission testing no longer exposes other branch identities.

## Automated verification

CI: .github/workflows/team-access-v26.yml

- node tests/check-team-access-v26.cjs: real authenticated API, staff match, unique branch, agent hierarchy, offline OTP, IAM, privacy, batch matrix, archived session revocation, invoice access isolation.
- node tests/team-access-v26-ui.cjs: all five tabs, actions, user dialogs, nested routes, Agent/Master and Online/Offline, branch controls, role matrix, standard dropdowns, Test/Groups/Advanced.
- Existing Settings v16, Communications, Staff v11, Accounts v10, and general npm test regressions.

Tests use a disposable isolated data directory. Existing local operator data is not reseeded.

## Production qualification — material remaining integration work

This is a functional authenticated UI/API implementation within the standalone JavaScript GDS, not certification of production-wide organization authorization. The permission matrix persists real API grant codes, but the fine-grained Own / Branch / Company row-level filtering and selected-route scopes are not yet uniformly enforced across all routes, bookings, trips, staff, reporting, finance, exports and other domain APIs. The UI discloses that fact. Branch operational area scopes likewise need to be incorporated in all operational queries. Do not grant real untrusted staff production access on the assumption these scopes are active until those domain endpoints have been updated and security-tested.

Master Agent links are saved and validated; actual subagent settlement/commission hierarchy still needs separate booking and Accounts integration. Staff identity is matched by phone; salary/bank/document workflow remains in Staff module. A real multi-operator deployment requires tenant-scoped access, transactional financial-grade data storage, production OTP identity provider, secret rotation and session hardening. Existing demonstration login OTP is not a production authentication service.

Screenshot parity is assessed by the supplied controls, hierarchy and style. It has not been certified as exact pixel matching across all viewport sizes and browsers; operator browser UAT remains necessary.
