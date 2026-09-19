# Root cause review: the 2.1.1 picker session

This document separates what the recorded evidence proves from what it only suggests.
It covers the incident export `feedgate-2.1.1-diagnostics-2026-09-18T03-27-28-394Z.json`
(sha256 `dc5cdd43b9a2cd71435d1569d3b8327fd41f55c1156468baeadda27cf1fb957a`), the owner
report about the element picker, and the code review of 2.1.1 that followed.

## What the export records

| Fact | Value | Reading |
| --- | --- | --- |
| Build | release 2.1.1, policy `policy-2.1.1`, detector `ad-2.1.1`, schema 4 | The session ran on the repaired release. |
| Semantic decisions | 253, of which 150 retained | Window capacity is 150 entries; the counters keep counting after the window fills. |
| Provider work | 178 requests, 172 classified, 81 cache hits, 0 errors | The pipeline worked; nothing failed silently. |
| Filter actions | `filterDecisions: 0` | With the recorded scores no category threshold was met. This is consistent with the policy, not proof that the detector is right. |
| Protected | 4 | Protection applied, so the threshold logic ran. |
| Cosmetic rule count | 1 | One rule existed at export time. The export cannot show what it targeted. |
| Allowed authors / kept posts | 1 / 0 | Unrelated settings survived. |
| Page reports | 0 | No content script had reported. An empty list is not proof that no renderer ran; it only means nothing was published to the trusted side. |

The 150 retained entries are all `allow`. The rule histogram is `insufficient_evidence` 85,
`no_noise_rule_matched` 39, `below_noise_thresholds` 21, `useful_or_original_protection` 3,
`promotion_signal_alone` 2. This matches the repaired policy: nothing crossed a threshold
and two entries were reasoned as "promotional signal, no other elevated noise".

## Confirmed defects in 2.1.1 (reproduced before fixing)

1. **A cosmetic rule could hide anything, permanently, without re-validation.**
   2.1.1 stored rules as host + raw selector strings and applied them whenever the host
   matched. There was no ownership record, no structural check at application time, and
   no way to tell which rule had hidden which element. A selector that matched a layout
   wrapper hid the feed shell around the app.
   Reproduction: `picker_runtime_quarantine` (rule that now matches a multi-item container
   is quarantined before applying) and `picker_rejects_structural_targets` /
   `picker_rejects_aggregate_sets` (structural and aggregate rejection), plus the
   screenshot `evidence/picker-rejected-root.png`.

2. **The picker committed on click.** A single click applied the selector immediately.
   There was no preview, no match count, no confirmation, no undo, and no structural
   validation. Selecting a high-level element could hide the page around the content the
   user wanted to keep, and the resulting DOM change re-triggered the observer.
   Reproduction: `picker_tall_target_allowed` (preview with match count and tall-card
   warning) and the transactional preview screenshots `evidence/picker-preview.png`.

3. **Hidden status could not be closed and recovery did not exist.** The status panel
   had no hidden mode and there was no recovery latch: stopping inference and cosmetics
   depended on the page responding. A frozen or busy tab kept its hidden elements.
   Reproduction: `ui_hud_trio` (compact / expanded / genuinely hidden), `ui04` behavior in
   `ui_hidden_keeps_filtering`, `ui_status_reopen_via_settings`, and the worker-level
   recovery tests in `tests/v3-features.test.mjs` (persist-first latch, unacknowledged
   cleanup path, reload-paused route guard).

4. **No rule management.** Rules could only be edited as raw text. There was no per-rule
   enable/disable, no deletion with undo, no quarantine state, and no per-site filter.
   Reproduction: `options_ui` (rule manager) and the lifecycle tests in
   `tests/v3-features.test.mjs`.

5. **Self-authored DOM changes were not clearly attributed.** The renderer inserted cards
   and changed styles; nothing bounded a runaway loop between FeedGate's own writes and
   the observer. Reproduction: `loop_breaker_contains_runaway` (bounded breaker restores
   effects it cannot attribute) and `loop_reinjection_single_controller`.

## Hypotheses that remain hypotheses

- The exact DOM of the owner's screen is not available, so the original page's structure
  cannot be replayed byte-for-byte. The screenshots and the incident fixture capture the
  numbers, not the layout their browser had.
- The owner's "central X app disappeared" report is consistent with a broad or
  container-level rule; the repair assumes that class of selector and rejects it
  structurally. It is not proof that this was the exact rule.
- Provider calibration questions raised after 2.1.1 were not treated as defects. The
  recorded R1/R2-style rows are replayed in `tests/policy-v21.test.mjs` and keep their
  truthful reason names (`below_noise_thresholds`, not "promotional intent alone").

## What 3.0.0 changes, and what it deliberately does not

Changed: validated selector subset with structural and aggregate guards, transactional
picker with preview and undo, per-rule ownership with reversible namespaced effects,
runtime re-validation and quarantine, startup quarantine for legacy rules, HUD modes with
genuinely hidden state, recovery latch persisted in the trusted context before any
cleanup attempt, rule manager with per-rule and bulk controls, cosmetic diagnostics
counters, and a Wykop adapter that stays conservative about ad evidence.

Unchanged: category thresholds, sufficiency guard, quote attribution, ad ownership
proof, fail-open behaviour, budget and concurrency limits, and the storage/privacy
boundaries. 3.0.0 is a control and safety release, not a model or policy retune.

## Reproductions index

| Scenario | File | Purpose |
| --- | --- | --- |
| `picker_rejects_structural_targets` | tests/browser.py | Primary content root is rejected before anything is saved. |
| `picker_rejects_own_ui` | tests/browser.py | FeedGate's own UI cannot be picked. |
| `picker_rejects_aggregate_sets` | tests/browser.py | A match set that would hide most of the page is rejected. |
| `picker_tall_target_allowed` | tests/browser.py | Tall single card is a warning, not a rejection. |
| `picker_runtime_quarantine` | tests/browser.py | Previously safe selector that now matches a container is quarantined. |
| `loop_breaker_contains_runaway` | tests/browser.py | Bounded breaker contains a self-write storm and restores effects. |
| `ui_hud_trio`, `ui_hidden_keeps_filtering`, `ui_status_reopen_via_settings` | tests/browser.py | HUD visibility states and reopen behavior. |
| Rule lifecycle, recovery, revisions | tests/v3-features.test.mjs | Trusted-side persistence and state machines. |
| Incident replay | tests/incident.test.mjs | Appendix-A counts from the three real exports. |
