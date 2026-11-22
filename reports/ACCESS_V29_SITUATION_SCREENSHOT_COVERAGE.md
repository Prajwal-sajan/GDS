# Settings → Team & access → Access → Test access (v29)

Source: two screenshots uploaded on 23 November 2026, showing the open Situation dropdown at different scroll positions. Continuation of the earlier 18-screen Access v28 implementation on savetrip-screenshotcomplete.

The new 23-field selector (plus Choose... placeholder) preserves the exact label wording and order from the screenshots. It is a native HTML select, so native browser scrolling and the selected blue row follow system behavior. The adjacent value editor uses text/numeric/mobile/boolean/app values. More than one situation field can be added or removed; duplicates are blocked. The v28 89-action chooser, Person, Check, result pane, tab navigation, Roles/View/Edit/Groups/Advanced, stored grants and rule enforcement are preserved.

Server: a strict schema validates all 23 values with data type/range checks. The caller identity cannot be forged; route, seat count, block duration, departure lead time, selling branch and visible booking ownership can affect existing policy decisions. Other screenshot fields are accepted as simulation context and explicitly marked as context-only, not falsely represented as authoritative runtime enforcement. The simulator remains non-mutating, deny-first and cannot authorize operations.

Tests: `node tests/team-access-v29-ui.cjs`, `node tests/check-team-access-v28.cjs`, `node tests/team-access-v28-ui.cjs`, and all prior UI suites. The screenshot does not show an expanded rule-edit modal or a Test access result for each new field, so their exact visual parity beyond the dropdown cannot be verified from these two images.
