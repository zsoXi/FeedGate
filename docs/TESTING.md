# Test report: FeedGate 2.0.0

## Results from this build

| Layer | Result | Scope |
| --- | --- | --- |
| JavaScript syntax | Passed | Node syntax checks on source, scripts and JavaScript tests |
| Node tests | 110 passed, 0 failed | Actual policy, vault, HTTP and worker code with mocked Chrome storage/messaging and controlled HTTP where needed |
| Chromium DOM/UI | 31 passed, 0 failed | Actual adapters, content script and UI on representative HTML; mocked Chrome APIs, page locations and model responses |
| Real TypeSafe API | Not run | No user key was used |
| Native extension installed in Chrome | Not run | Managed build environment blocks installation; policy was not altered |
| Current signed-in X / other feed | Not run | No user accounts were accessed |
| Windows user workflow | Not run natively | Ready-made browser assets are supplied; there is no Windows-specific runtime process |
| GitHub Actions | Workflow supplied, not executed remotely | No repository was published or changed |

Test browser: Chromium 144.0.7559.96. Node: 22.16.0. Detailed results are in `evidence/unit-tests.tap` and `evidence/browser-dom-tests.json`.

## Important regression cases

The deterministic tests cover useful promotion preservation, promotion alone, explicit risk despite positive value, contradictory model estimates, profile softening, insufficient evidence, truncation, user exclusions, observe mode, caching after a threshold change and per-post exceptions after edits.

Worker tests cover fixed endpoint use, optional permissions, foreign senders, subframes, private routes, key lock/unlock, race cancellation, vault tampering, secret-free exports, bounded queues, request budgets, rate limits, malformed responses and worker/browser restart simulations.

DOM tests cover appended posts, recycled nodes while inference is pending, previously hidden nodes with changed content, local-ad false positives from names and quoted ads, extraction exclusions, existing-style restoration, selector changes, element picking, BFCache lifecycle, duplicate injection, quote separation, profile context, saved post choices, keyboard overrides, setup permission denial, key field clearing, preset controls, diagnostic-file construction and narrow layouts.

UI screenshots in `evidence/` are fixture captures. Files with `fixture` in their name can show synthetic results or connection flags from the test harness. They are not evidence of live provider availability, cost or classification quality. The shipped local test feed itself does not include mock model probabilities.

## Required manual pilot

Use a Chrome profile where installing unpacked extensions is permitted. Load `extension/`, enter a dedicated provider key, grant consent and complete Connect & start. Refresh X. Confirm the on-page counter increases, real provider attempts and token counts increase, and a substantive project post remains visible under Balanced. Confirm any filtered post can be restored. Check an intentionally opened profile and a message route.

Restart Chrome. Without a persistent vault, the key should be locked. With a vault, the passphrase should unlock it without a terminal or pairing code. Open Diagnostics, export JSON and inspect it before sharing. Revoke the test key after validation.

These pilot checks are not automatically marked complete in the package. The fictional evaluation corpus is a starting point for regression work, not a representative accuracy benchmark. Do not claim a false-positive rate until actual labelled live-model results exist.
