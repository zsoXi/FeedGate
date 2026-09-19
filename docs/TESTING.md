# Test report: FeedGate 3.0.0

## Baseline and results

The preserved 2.1.1 copy was measured before any change (evidence in `evidence/baseline-3.0.0-npm-test.txt` and `evidence/baseline/`).
The 3.0.0 build was measured after the change (evidence in `evidence/`).

| Layer | 2.1.1 baseline | 3.0.0 result | Scope |
| --- | --- | --- | --- |
| JavaScript syntax | Passed | Passed | Node syntax checks on source, scripts and JavaScript tests |
| Node tests | 118 passed, 0 failed | 139 passed, 0 failed | Actual policy, ad-evidence, cosmetic model, recovery, vault, HTTP and worker code with mocked Chrome storage/messaging and controlled HTTP |
| Chromium DOM/UI | 46 passed, 0 failed | 59 passed, 0 failed | Actual adapters, content script (status panel, picker, cosmetics), options and popup on representative HTML; mocked Chrome APIs, page locations and model responses |
| Unpacked extension smoke | 7 checks passed | 7 checks passed | The real `extension/` loaded into a local Chromium profile; demo page collapsed its promoted sample through the real content script |
| Release integrity | 8 checks passed | 8 checks passed | Version agreement, manifest bounds, source/output byte equality, no bridge or dynamic code |
| Real TypeSafe API | Not run | Not run | No user key was used |
| Signed-in X / Reddit / Wykop feed | Not run | Not run | No user accounts were accessed |
| Managed-profile installation | Not run | Not run | Enterprise policy was not altered |

Test browser: Chromium 151.0.7922.34, recorded in `evidence/browser-dom-tests.json`. Node 24.14.0.
Per-suite Node counts (TAP, `evidence/unit-tests.tap`): core 31, policy 34, worker 29, diagnostics 9, HTTP 12, incident replay 4, v3 features 20.

## Reproduce

```sh
npm run check
npm test
npm run build
npm run release:check
python tests/browser.py
python tests/extension_smoke.py
```

## What the suites cover

`tests/core.test.mjs` covers the separated version constants, the structured ad-evidence contract (verified only with ownership, outer-post scope, a known marker and a rendered or metadata basis), legacy boolean flags downgraded to ambiguous, threshold boundaries, truthful rule names, the shuffled-answer API contract with preserved zeros and rejection of malformed values, cache identity including the detector, extraction and item-kind versions, redaction, the selector-safety subset and the vault.

`tests/policy-v21.test.mjs` maps one case to each of the 25 precision-first requirements and replays the six anonymous score vectors from the incident appendix (R1-R6), including the corrected `below_noise_thresholds` reason for R1/R2 and the lowered protection eligibility boundary. The 2.1.1 ad-evidence contracts (verified-only local collapse, legacy flags never hiding) remain in place.

`tests/worker.test.mjs` covers optional permissions, foreign senders, private routes, key lock/unlock, race cancellation, budgets, rate limits, malformed responses, restart behaviour, the bounded 150-entry history window with explicit dropped counts, verified local ads costing zero provider requests and legacy ad flags never hiding content.

`tests/diagnostics-v21.test.mjs` checks privacy, the schema-5 envelope with the build fingerprint, and that raw cosmetic selectors never appear in a diagnostic export.

`tests/http.test.mjs` checks the fixed endpoint, header hygiene and every error mapping. `tests/incident.test.mjs` replays three real diagnostic exports (2.1.0 and 2.1.1 snapshots) as a frozen regression fixture; it skips with `INSUFFICIENT` when the fixtures are absent.

`tests/v3-features.test.mjs` covers the v3 control surface: selector-safety rejects (`body`, `#root`, `div:has(main)`, comma unions, overlength), cosmetic rule sanitization and host matching, legacy-CSS quarantine migration, HUD-mode migration, record kinds and kind-aware cache keys, the new error codes, the Wykop registry and conservative ad evidence, rule lifecycle (add/edit/disable/delete/undo/revalidate), bulk disable/delete, revision conflicts (`STALE_SETTINGS`), per-domain revision independence, recovery persist-first with bounded acknowledgement (including an unresponsive-tab worker), `FG_RELOAD_PAUSED` route guards, cosmetic event accounting, the site-status reason matrix, v4 export/import with quarantine of unverified imports, log-window accounting (`logDropped`) and cleanup tracking.

DOM scenarios cover the previous 46 cases plus the status panel modes (compact pill, expanded panel, genuinely hidden), hidden status never returning on its own while filtering continues, explicit reopen via settings, structural picker rejections (main column, FeedGate's own UI, aggregate sets), tall-card geometry warning instead of rejection, runtime quarantine of a previously safe selector that now matches a container, cosmetic/semantic ownership separation, the bounded breaker, re-injection keeping one controller and one status host, and the Wykop link/entry fixtures (Polish text, reply exclusion, `Poleca` note never a verified ad, auth routes private). Screenshots of the real built UI are stored in `evidence/` (`hud-compact.png`, `hud-expanded.png`, `hud-hidden.png`, `picker-preview.png`, `picker-rejected-root.png`, `wykop-fixture.png`, options pages, popup, setup completion, diagnostics, test feed).

The extension smoke test loads the real `extension/` folder into a local Chromium profile, waits for the service worker, reads the release version, opens the demo feed and verifies that a card names the verified platform label, plus no localhost traffic, no page errors and no worker errors.

## Fixture provenance

All adapter, policy, cosmetic and Wykop fixtures are synthetic HTML and assigned scores. Provider responses are controlled implementations, not captured traffic. Wykop selectors were reviewed against unauthenticated public pages captured on 2026-09-18 (provenance recorded in `docs/WYKOP_SUPPORT.md`); no live Wykop account or promotion state was observed. `tests/fixtures/incident/` contains three real diagnostic exports supplied by the owner (two 2.1.0 schema-3, one 2.1.1 schema-4); by schema design they contain no post text, authors, keys or full URLs, and they are used only for count replay, never as accuracy labels. Screenshots with `fixture` in the name show synthetic harness state, not live provider results.

## Required manual pilot

Use a Chrome profile where unpacked extensions are permitted. Load `extension/`, enter a dedicated provider key, grant consent and complete Connect & start (all six feeds can be preselected; Chrome decides the prompts).

1. Confirm a substantive technical post stays visible under Balanced.
2. Confirm a promotional project post with concrete details is kept, and that if it is ever dimmed the card explains the conflict.
3. Open the Filter policy page and toggle **Labelled ads** off, then on; confirm a locally collapsed labelled placement restores immediately when the switch is off.
4. If a true platform-labelled placement appears, confirm the card states that a verified platform ad label was found, and that no card ever appears for a post that merely mentions advertising words.
5. Press **×** on the status pill; confirm the panel stays gone while filtering continues, and that the popup can bring it back.
6. Use **Pick element** on a sidebar-sized element and confirm the preview states scope and match count before anything is saved; cancel with Escape and confirm nothing was saved.
7. Use **Restore this site** from the popup and confirm the pause survives a reload of the tab; resume when ready.
8. Leave a tab open, reload the extension, and confirm the tab shows the reload prompt instead of silently mixing schemas.
9. Export diagnostics and verify `build.release` is `3.0.0`, `build.detector` is `ad-3.0.0` and the export contains no raw cosmetic selectors.
10. On Wykop, confirm link cards and Mikroblog entries are classified separately, that comments are never extracted, and that an old "Wykop Poleca" note never produces a platform-ad collapse.

## Live validation status

**INSUFFICIENT.** No real TypeSafe key was used, no signed-in feed was evaluated and no labelled live corpus exists for this build. The ad detector is verified against synthetic fixtures that follow documented platform markup, not against current live X, Reddit or Wykop DOM. The Wykop support is a beta surface reviewed against public HTML captures, not against a live account. Do not claim a measured false-positive or false-negative rate from these results.
