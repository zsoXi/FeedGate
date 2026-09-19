# Test report: FeedGate 3.3.0

## Baseline and results

The preserved 3.2.0 release was measured before any change; its results are the baseline column. (Older 2.1.x and 3.x baselines remain in `evidence/baseline/`.)
The 3.3.0 build was measured after the change (evidence in `evidence/`).

| Layer | 3.2.0 baseline | 3.3.0 result | Scope |
| --- | --- | --- | --- |
| JavaScript syntax | Passed | Passed | Node syntax checks on source, scripts and JavaScript tests |
| Node tests | 146 passed, 0 failed | 164 passed, 0 failed | Actual policy, ad-evidence, author lists and Undo, topic rules, grouping helpers, thrift helpers, cosmetic model, recovery, vault, HTTP and worker code with mocked Chrome storage/messaging and controlled HTTP |
| Chromium DOM/UI | 62 passed, 0 failed | 66 passed, 0 failed | Actual adapters, content script (status panel, pickers, cosmetics, author and topic mutes, grouping bar, thrift deferral), options and popup on representative HTML; mocked Chrome APIs, page locations and model responses |
| Unpacked extension smoke | 8 checks passed | 8 checks passed | The real `extension/` loaded into a local Chromium profile; demo page collapsed its promoted sample through the real content script; loaded id matches the manifest key |
| Release integrity | 9 checks passed | 9 checks passed | Version agreement, manifest bounds, source/output byte equality, packaged `build.json` agreement, no bridge or dynamic code |
| Real TypeSafe API | Not run | Not run | No user key was used |
| Signed-in X / Reddit / Wykop feed | Not run | Not run | No user accounts were accessed |
| Managed-profile installation | Not run | Not run | Enterprise policy was not altered |

Test browser: Chromium 151.0.7922.34, recorded in `evidence/browser-dom-tests.json`. Node 24.14.0.
Per-suite Node counts (TAP, `evidence/unit-tests.tap`): core 34, policy 34, worker 33, diagnostics 9, HTTP 12, incident replay 4, v3 features 20, v330 features 18.

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

`tests/core.test.mjs` covers the separated version constants, the structured ad-evidence contract (verified only with ownership, outer-post scope, a known marker and a rendered or metadata basis), legacy boolean flags downgraded to ambiguous, threshold boundaries, truthful rule names, the deterministic author-mute branch (precedence, observe-mode wrapping, keep-this-post winning, mutual exclusion and list bounds), stable author identity (`authorId` versus display-name-only records), the topic-rule model (sanitization, scope, expiry, active selection, the optional topic question and the topic-aware cache key), token grouping helpers (`tokenSignature`, `tokenSimilarity`), the v4→v5→v6 settings migration, the shuffled-answer API contract with preserved zeros and rejection of malformed values, cache identity including the detector, extraction and item-kind versions, redaction, the selector-safety subset and the vault — including the backup validator, which accepts only complete sealed exports and rejects altered version, KDF or iteration metadata.

`tests/policy-v21.test.mjs` maps one case to each of the 25 precision-first requirements and replays the six anonymous score vectors from the incident appendix (R1-R6), including the corrected `below_noise_thresholds` reason for R1/R2 and the lowered protection eligibility boundary. The 2.1.1 ad-evidence contracts (verified-only local collapse, legacy flags never hiding) remain in place.

`tests/worker.test.mjs` covers optional permissions, foreign senders, private routes, key lock/unlock, race cancellation, budgets, rate limits, malformed responses, restart behaviour, the bounded 150-entry history window with explicit dropped counts, verified local ads costing zero provider requests, legacy ad flags never hiding content, the muted-author round trip, the sealed key-backup round trip (export contains only the vault blob and never the key material, corrupted imports are rejected with `VAULT_ERROR`, a valid import restores the vault on a fresh install) and the update comparison (running version versus packaged `build.json`, no provider request, honest `null` state when the file is unreadable).

`tests/diagnostics-v21.test.mjs` checks privacy, the schema-8 envelope with the build fingerprint, the muted-author and muted-topic counts and the `update` section, and that raw cosmetic selectors and muted author names never appear in a diagnostic export.

`tests/http.test.mjs` checks the fixed endpoint, header hygiene and every error mapping. `tests/incident.test.mjs` replays three real diagnostic exports (2.1.0 and 2.1.1 snapshots) as a frozen regression fixture; it skips with `INSUFFICIENT` when the fixtures are absent.

`tests/v3-features.test.mjs` covers the v3 control surface: selector-safety rejects, cosmetic rule sanitization and host matching, legacy-CSS quarantine migration, HUD-mode migration, record kinds and kind-aware cache keys, the new error codes, the Wykop registry and conservative ad evidence, rule lifecycle, bulk disable/delete, revision conflicts (`STALE_SETTINGS`), per-domain revision independence, recovery persist-first with bounded acknowledgement, `FG_RELOAD_PAUSED` route guards, cosmetic event accounting, the site-status reason matrix, v4 export/import with quarantine of unverified imports, log-window accounting and cleanup tracking.

`tests/v330-features.test.mjs` covers the 3.3 additions end to end at the worker level: concurrent `FG_MUTE_AUTHOR` calls for two authors both persist and sequential decisions keep the last write (A1); Undo restores the exact previous state — neutral, muted or allowed — an outdated Undo with a mismatched applied state returns `{saved:false,stale:true}` and changes nothing, and undoing one author never blocks another (A2); display-name-only records never match the author lists while `authorId` records do, and two accounts with the same display name keep distinct keys (A3); adding a topic through the content-callable message collapses a matching post with rule `topic_muted` and source `topic`, a passing mention stays visible, an expired topic stays visible, **Keep this post** wins, deleting or updating a topic restores content and invalidates the cache (B5); the token helpers treat reordered duplicates as one signature and score near-duplicates above unrelated text (B6); and the counters stay honest — a cached repeat costs one provider request, the daily budget survives a worker restart, and topic operations spend no provider requests (B7).

DOM scenarios cover the previous 62 cases plus `TOPIC01` (the status panel's **Mute topic…** picker with editable name, scope and duration, the saved topic visible in settings state and the "Your muted topic" card), `GROUP01` (two identical posts fold behind a group bar reading "more similar post", the duplicate restores on demand), `USAGE01` (the API usage panel shows the daily badge and counters, and cost appears only after rates are configured, labelled an estimate) and `THRIFT01` (fast scrolling starts no provider request; the deferred post is analyzed once scrolling settles). The earlier cases include `UPDATE01`, the status-panel author pickers (`PANEL01`), mute-from-card, the status panel modes, hidden status never returning on its own while filtering continues, structural picker rejections, tall-card geometry warning instead of rejection, runtime quarantine, cosmetic/semantic ownership separation, the bounded breaker, re-injection keeping one controller, and the Wykop fixtures. Screenshots of the real built UI are stored in `evidence/` (`hud-compact.png`, `hud-expanded.png`, `hud-hidden.png`, `picker-preview.png`, `picker-rejected-root.png`, `wykop-fixture.png`, `update-panel.png`, `topic-mute.png`, `grouping.png`, options pages, popup, setup completion, diagnostics, test feed).

The extension smoke test loads the real `extension/` folder into a local Chromium profile, waits for the service worker, reads the release version, verifies that the loaded extension id matches the id derived from the manifest key, opens the demo feed and verifies that a card names the verified platform label, plus no localhost traffic, no page errors and no worker errors.

## Fixture provenance

All adapter, policy, cosmetic, topic, grouping and Wykop fixtures are synthetic HTML and assigned scores. Provider responses are controlled implementations, not captured traffic. The `TOPIC_FIXTURE` marker is a synthetic way to drive one question to a high value; it is not a claim about model behaviour. Wykop selectors were reviewed against unauthenticated public pages captured on 2026-09-18 (provenance recorded in `docs/WYKOP_SUPPORT.md`); no live Wykop account or promotion state was observed. `tests/fixtures/incident/` contains three real diagnostic exports supplied by the owner (two 2.1.0 schema-3, one 2.1.1 schema-4); by schema design they contain no post text, authors, keys or full URLs, and they are used only for count replay, never as accuracy labels. Screenshots with `fixture` in the name show synthetic harness state, not live provider results.

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
9. Export diagnostics and verify `build.release` is `3.3.0`, `build.detector` is `ad-3.0.0`, `build.schema` is `8` and the export contains no raw cosmetic selectors.
10. On Wykop, confirm link cards and Mikroblog entries are classified separately, that comments are never extracted, and that an old "Wykop Poleca" note never produces a platform-ad collapse.
11. Mute an author from a filter card, confirm the other posts from that author hide without new provider requests in Diagnostics, then unmute in Settings → Muted authors and confirm they return.
12. Expand the status panel, use **Mute author…**, click a visible post: confirm the preview names the author, saving hides their posts with no new provider request, and **Undo** in the toast brings them back; then confirm **Undo** after **Allow author** restores the previous state as well.
13. Expand the status panel, use **Mute topic…**, pick a post with a clear subject, edit the name, choose duration 24 hours, and confirm saving hides the matching post with a "Your muted topic" card while a post that only mentions the words stays visible; open Settings → Muted topics and confirm the scope and expiry, then delete the topic and confirm the post returns.
14. Enable **Group repeated posts** in the policy form, open a feed page that contains duplicates, and confirm the first copy stays while the later copies fold behind the "more similar post" control and can be read on demand; disable the option and confirm everything is visible again.
15. Enable **Thrift mode** with the default pause, scroll quickly through the feed, and confirm no new provider requests are started while scrolling in Diagnostics; stop scrolling briefly on a visible post and confirm it is analyzed after the pause.
16. Open the Review page and confirm the API usage panel shows the used/remaining daily requests with the 00:00 UTC reset in local time, attempts, analyses, cache hits, errors, cancellations, unaccounted attempts and token totals; leave the rates empty and confirm the cost line says it is not calculated, then enter your own rates and confirm the estimate appears with the "estimate" wording.
17. Open **06 Updates**, press **Check files on disk**, and confirm the panel reports the running build against the packaged `build.json`; the stable identity means no key re-entry is needed across releases.

## Live validation status

**INSUFFICIENT.** No real TypeSafe key was used, no signed-in feed was evaluated and no labelled live corpus exists for this build. The ad detector and the new topic, grouping and thrift features are verified against synthetic fixtures and assigned scores, not against live model output; a high topic score in the tests is a controlled implementation, not evidence of semantic accuracy. The Wykop support is a beta surface reviewed against public HTML captures, not against a live account. The unpacked-extension smoke test loaded the real build in a local Chromium profile, but managed installation and in-place upgrade of a long-lived profile remain untested here. Do not claim a measured false-positive or false-negative rate from these results.
