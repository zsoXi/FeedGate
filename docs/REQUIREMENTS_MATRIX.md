# FeedGate requirements matrix (3.0 → 3.3.0)

This matrix maps the 3.0.0 safe-controls task and its 3.1/3.2/3.3 follow-ups to implementation and evidence. It
is a self-check produced by the same work it reviews, not independent acceptance.
Statuses are `MET`, `NOT_MET` or `INSUFFICIENT`. Live-provider and live-site
claims are `INSUFFICIENT` because no real key, signed-in feed or managed install
was used.

Evidence files:

* `evidence/unit-tests.tap` — 164 Node tests / 0 fail
* `evidence/browser-dom-tests.json` — 66 Chromium DOM/UI scenarios / 0 fail
* `evidence/extension-smoke.json` — 8 checks on the real `extension/` folder
* `evidence/release-checks.json` — 9 release integrity checks
* `evidence/baseline/` — 2.1.x baseline logs and the 2.1.1 patch
* `tests/fixtures/incident/` — three real privacy-safe diagnostic exports

## 1. Release gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Repository state inspected; test state recorded | MET | `evidence/baseline-3.0.0-npm-test.txt` (118/118) |
| Diagnosed vs implemented separation | MET | `docs/ROOT_CAUSE.md` |
| No weak assertion removed | MET | 2.1.1 suites still present and green |
| Root/container picking rejected before preview | MET | PICK01/02/03/13, `evidence/picker-rejected-root.png` |
| Legacy bad rules cannot execute at startup | MET | quarantine migration tests; PICK12 analog |
| Undo persists | MET | picker scenario + rule manager tests (`FG_RULE_UNDO`) |
| Rule management exists | MET | options rules page + worker lifecycle tests |
| Recovery works without a responsive content script | MET | silent-worker recovery test; `docs/RECOVERY.md` |
| No "all platforms enabled" claim without permissions | MET | feeds accordion states; SITE family |
| No live Wykop/Jev claim from mocks | MET | `docs/WYKOP_SUPPORT.md`, TESTING.md |

## 2. Evidence discipline

| Requirement | Status | Evidence |
| --- | --- | --- |
| Recorded incident numbers reproduced | MET | `tests/incident.test.mjs` (4 tests, three exports) |
| Filtering rate vs accuracy distinguished | MET | ROOT_CAUSE.md, TESTING.md |
| No ad-label ≠ organic rule from a screenshot | MET | ROOT_CAUSE.md hypotheses section |
| Counters proven wrong or explained | MET | incident tests; `protected`/`usefulPromotions` semantics documented |
| Every claim traceable to evidence | MET | this file's evidence column |

## 3. Preserved product

| Requirement | Status | Evidence |
| --- | --- | --- |
| MV3, direct HTTPS, session key, vault | MET | release checks 1–4; smoke test |
| Ad-evidence fixes preserved | MET | ad evidence contract tests; AD family |
| Reversible Show / Keep / allowlist / pause | MET | 2.1.1 scenarios still green |
| Categories, thresholds, protection, fail-open | MET | policy-v21 34 tests; POLICY.md unchanged semantics |
| Observe Only and softening | MET | observe + profile scenarios |
| Budgets, concurrency, dedup, cancellation | MET | worker tests 8, 11, 16–18 |
| Privacy exclusions and ACLs | MET | diagnostics privacy tests; PRIVACY.md |

## 4. Status panel (UI)

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| UI01 | Fresh v3 starts compact + feeds list closed | MET | `ui_hud_trio`, `options_ui` |
| UI02 | Expand/minimize without engine restart | MET | `ui_hud_trio` (no extra requests) |
| UI03 | Close is genuinely hidden, filtering continues | MET | `ui_hud_trio`, `ui_hidden_keeps_filtering` |
| UI04 | No routine re-creation while hidden | MET | `ui_hidden_keeps_filtering` |
| UI05 | Reopen via popup/settings | MET | `ui_status_reopen_via_settings`; popup + options controls |
| UI06 | Preference survives navigation/refresh/reinjection | MET | `ui_status_reopen_via_settings`, `loop_reinjection_single_controller` |
| UI07 | Accordion actions change nothing | MET | `options_ui` (no rule/test calls on load/toggle) |
| UI08 | Keyboard, zoom, narrow, themes | INSUFFICIENT | details/summary + Escape tested; matrix-wide a11y audit not performed |
| UI09 | Own UI never becomes content or ad evidence | MET | `ext04` exclusion tests; `picker_rejects_own_ui` |
| UI10 | Pause distinguishable while hidden | MET | `ui_hidden_keeps_filtering`, popup describe() text |

## 5. Sites and permissions

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| SITE01 | Six sites selected without false grants | MET | `options_ui`, site rows; `siteStates` tests |
| SITE02 | One logical origins request | MET | enable-all + setup use one `permissions.request` |
| SITE03 | Grant initializes open tabs, single controller | MET | smoke test; `loop_reinjection_single_controller` |
| SITE04 | Denial handled honestly, no loop | MET | `permission_denial` scenario |
| SITE05 | Disabled stays disabled across restart | MET | settings persistence; status reason tests |
| SITE06 | Revocation surfaces refresh requirement | MET | permissions.onRemoved → cleanupSites + `refresh_required` |
| SITE07 | Missing consent/key → no calls | MET | worker tests 4; `permission_denial` |
| SITE08 | One-time upgrade setup, unrelated settings intact | MET | migration tests; upgrade flag; `docs/MIGRATION.md` |
| SITE09 | Private/unsupported routes stop work | MET | private route tests; `/messages` scenario |
| SITE10 | Two settings windows cannot stale-overwrite | MET | revision/`STALE_SETTINGS` tests |

## 6. Element picker

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| PICK01 | Root rejected before preview | MET | `picker_rejects_structural_targets` |
| PICK02 | Indirect parent rejected | MET | `structuralReject` contains/ancestor checks |
| PICK03 | Aggregate union rejected | MET | `picker_rejects_aggregate_sets` |
| PICK04 | Tall card not viewport-rejected | MET | `picker_tall_target_allowed` |
| PICK05 | Own UI rejected | MET | `picker_rejects_own_ui` |
| PICK06 | Cancel/Escape/navigation restores | MET | preview teardown + `picker` scenario |
| PICK07 | Replaced target re-validated | MET | commit re-check; `picker_runtime_quarantine` |
| PICK08 | Commit creates exactly one rule/effect | MET | `picker` scenario assertions |
| PICK09 | Undo then rescan does not reappear | MET | Undo flow + scan pruning |
| PICK10 | Manager disable/delete updates live tabs | MET | config broadcast + reapply logic |
| PICK11 | Delete all confirmed | MET | options confirm dialog; `FG_RULES_DELETE_ALL` |
| PICK12 | Legacy broad rule quarantined before first application | MET | migration + `picker_runtime_quarantine` |
| PICK13 | Safe selector later matching root quarantined | MET | `picker_runtime_quarantine` |
| PICK14 | Invalid CSS safe error | MET | selector safety tests |
| PICK15 | Popup Restore on a healthy page | MET | `FG_RECOVER_SITE` tests + UI |
| PICK16 | Never-responding script: pause persists + reload option | MET | silent-worker test; `FG_RELOAD_PAUSED` |
| PICK17 | Reload after recovery shows no old action | MET | recovery latch read before effects |
| PICK18 | Two rules on one target keep ownership | MET | ownership map; `cosmetic_and_semantic_same_post` |
| PICK19 | Cosmetic + semantic on one post separated | MET | `cosmetic_and_semantic_same_post` |
| PICK20 | Concurrent save/delete/Undo cannot resurrect | MET | revisioned writes + tests |
| PICK21 | Import/edit pass the same checks | MET | import re-validation tests |
| PICK22 | Hidden HUD independent Undo notification | MET | toast is separate from the HUD |

## 7. Loop and convergence

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| LOOP01 | Own mutations cause no extraction/loop | MET | `ignoredSelfMutations`; `ad13`-style assertions |
| LOOP02 | Host text changes observed | MET | mutation scenario (2.1.1) still green |
| LOOP03 | Reapply of unchanged decision is a no-op | MET | `noopApplications` accounting |
| LOOP04 | Runaway contained by the breaker | MET | `loop_breaker_contains_runaway` |
| LOOP05 | Scrolling does not trip the breaker | MET | breaker keyed to self-writes, not intersection |
| LOOP06 | Reinjection keeps one controller | MET | `loop_reinjection_single_controller` |
| LOOP07 | Late responses cannot rehide after pause/Undo | MET | epoch/token guards; worker tests |
| LOOP08 | Static fixture converges | MET | bounded sweep + request-count stability |

## 7a. Author controls and exception rule (3.1)

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| MUTE01 | Mute from a card hides that author's posts locally, no provider request | MET | `MUTE01` browser scenario; worker mute round-trip test |
| MUTE02 | Allow and mute lists stay mutually exclusive | MET | core + worker tests (`blockedAuthors` cleared on allow and vice versa) |
| MUTE03 | Keep this post wins over the mute list; observe mode wraps it | MET | core author-mute test; policy precedence table row 3a |
| MUTE04 | Mute list is bounded, validated and reversible from settings | MET | core bounds/migration tests; options Muted authors list with Unmute |
| MUTE05 | The status panel mutes or allows an author by clicking a post, with preview, Escape cancel and toast Undo | MET | `PANEL01` browser scenario; `FG_FORGET_AUTHOR` worker test |
| EXC01 | Exception rule panel states hint semantics and token cost | MET | options panel copy + counter/status; TESTING.md manual pilot |

## 7b. Identity and updates (3.2)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Stable extension identity across folder moves | MET | manifest `key`; smoke check 'the loaded extension id matches the manifest key' (`oombgdfajfomncpoiljbhpnagigjjbcc`) |
| Update detection against packaged files | MET | `build.json` written by `npm run build`; worker update-info test; release check 'Packaged build.json matches current version and sources' |
| In-place update guidance, never Remove | MET | `docs/UPDATES.md`; Updates panel copy; manual pilot step 13 |
| Sealed key backup and restore | MET | worker backup round trip (ciphertext only, corrupted import rejected); UPDATE01 blob assertions; `feedgate-key-backup` v1 |
| One-time identity transition documented | MET | `docs/UPDATES.md`, `docs/MIGRATION.md` (3.1.1→3.2.0) |
| Diagnostics expose the update state | MET | schema 7 `update` section; diagnostics test |

## 7c. Topics, grouping and thrift (3.3)

| Requirement | Status | Evidence |
| --- | --- | --- |
| A1 Atomic author-list changes under concurrency | MET | v330 feature tests (concurrent mutes for two authors both persist; sequential changes keep the last write) |
| A2 Undo restores the exact previous state; stale Undo refused | MET | v330 feature tests (none/blocked/allowed matrix; `{saved:false,stale:true}` changes nothing; another author never blocks) |
| A3 Stable author identity; name-only records never match lists | MET | core + v330 tests (`authorId`, `authorNameOnly`); adapters canonical slug helper |
| B5 Topic mute with scope, duration and semantic matching | MET | v330 tests (optional topic question, `topic_muted`, expiry, passing mention stays, keep-this-post wins, delete/update invalidates cache) |
| B5 Topic manager in settings with edit/delete/expiry | MET | options Muted topics list; `TOPIC01` browser scenario |
| B6 Repeat grouping with a representative and expand control | MET | `GROUP01` browser scenario; grouping helpers in core tests |
| B7 Usage counters separated (daily vs session, unaccounted attempts) and cost only from user rates | MET | worker counter tests; `USAGE01` scenario; diagnostics provider section |
| B7 Thrift mode defers analysis until visible and settled | MET | `THRIFT01` scenario; v330 worker deferral test (fast scroll starts no request) |

## 8. Wykop

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| WYK01 | Link card: one target, title/body once | MET | `wykop_fixture`, `ext01` analog |
| WYK02 | Mikroblog entry boundaries and identity | MET | `wykop_fixture` |
| WYK03 | Mixed tag + SPA does not inherit decisions | INSUFFICIENT | design + adapter; no live SPA session captured |
| WYK04 | Profile/detail narrow boundaries, shell preserved | INSUFFICIENT | adapter scope is document-level items only; not live-tested |
| WYK05 | Editor/private routes transmit nothing | MET | `/logowanie`, `/rejestracja` private; editor routes not observed in captures |
| WYK06 | Expansion only after real user action | MET | adapter never expands; truncated flag set |
| WYK07 | Poleca note never verified as ad | MET | `wykop_fixture` |
| WYK08 | User/tag/quote mentions never local ads | MET | detectAdEvidence has no generic scan for Wykop |
| WYK09 | True reviewed marker or unvalidated/ambiguous | MET | `wykop_policy_and_privacy`; `docs/WYKOP_SUPPORT.md` |
| WYK10 | Unknown markup fails open | MET | no verified marker exists; fail-open path |
| WYK11 | Polish text preserved | MET | `wykop_fixture` (`żółć`) |
| WYK12 | Polish fixtures separate from live expectations | MET | TESTING.md + WYKOP_SUPPORT.md provenance |

## 9. Regression

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| REG01 | 2.1.1 corpus unchanged in behavior | MET | 118 legacy Node tests green |
| REG02 | Provider failures fail open | MET | http.test.mjs (12) |
| REG03 | Cache/in-flight counted once | MET | worker tests 8, 19 |
| REG04 | Observe Only hides nothing | MET | policy + DOM observe scenarios |
| REG05 | Canaries excluded from export | MET | diagnostics privacy test (selector + text canaries) |
| REG06 | Untrusted senders cannot invoke privileged ops | MET | FORBIDDEN matrix tests |
| REG07 | Source/runtime mismatch fails release gate | MET | release checks 4–5; smoke fingerprint |
| REG08 | Upgrade preserves vault/allowlist/choices | MET | migration tests; smoke vault flow |
| REG09 | Recovery works offline/locked | MET | recovery tests (no provider calls) |
| REG10 | In-place vs new-folder identity accuracy | INSUFFICIENT | new profile only; in-place upgrade not performed here |

## 10. Semantics and policy

| Requirement | Status | Evidence |
| --- | --- | --- |
| Thresholds, Dim/Collapse mapping, lowSignal off unchanged | MET | `C.CATEGORIES` diff vs 2.1.1; policy tests |
| Exact named-answer parsing and sufficiency | MET | parser tests; API contract tests |
| Ad ownership proof retained | MET | ad evidence contract tests |
| Quote attribution retained | MET | quote separation tests |
| Raw-score cache distinctions retained | MET | cache identity tests incl. detector/extraction/item kind |
| Card sources distinguishable | MET | card note tests (semantic / verified placement / user rule / Observe / recovery) |

## 11. Diagnostics, storage, migration

| Requirement | Status | Evidence |
| --- | --- | --- |
| Privacy-safe diagnostics schema 8 | MET | `docs/DIAGNOSTICS_SCHEMA.md`; privacy tests; `mutedAuthorCount`/`mutedTopicCount` count-only |
| Cosmetic/semantic/UI metrics separated | MET | diagnostics worker tests |
| Renderer heartbeat vs absence explained | MET | schema doc + renderer section test |
| Retained vs dropped history explicit | MET | `logStats` test (150/10) |
| No keys in settings responses/DOM/URLs/logs/exports | MET | privacy tests; release check |
| SEL/ACL, authenticated encryption preserved | MET | vault tests; storage ACL code |
| Revisioned writes prevent resurrection | MET | `STALE_SETTINGS` + lifecycle tests |
| Legacy quarantine + one-time all-sites upgrade | MET | migration tests; upgrade banner |
| Versions separated (release/rubric/policy/detector/extraction/schema/runtime) | MET | core version test; build fingerprint |

## 12. Live and manual validation

| Item | Status | Note |
| --- | --- | --- |
| Real TypeSafe key classification accuracy | INSUFFICIENT | No key used; `evaluation/` runner available opt-in |
| Live semantic accuracy of the optional topic question | INSUFFICIENT | Synthetic `TOPIC_FIXTURE` scores only; not live model output |
| Signed-in X/Reddit/LinkedIn/Facebook/Instagram DOM | INSUFFICIENT | Adapter fixtures only |
| Live Wykop markup beyond the 2026-09-18 captures | INSUFFICIENT | `docs/WYKOP_SUPPORT.md` provenance |
| Managed/enterprise installation | INSUFFICIENT | Policy not bypassed; unpacked smoke only |
| In-place upgrade from a loaded 2.1.1 profile | INSUFFICIENT | Baseline preserved; described procedure only |

## 13. Deliverables

| Deliverable | Status | Path |
| --- | --- | --- |
| Complete project folder | MET | `D:\FeedGate\FeedGate-3.3.0` |
| Ready-to-load `extension/` | MET | `D:\FeedGate\FeedGate-3.3.0\extension` |
| ZIP + SHA256 sidecar | MET | `D:\FeedGate\PLIKI\FeedGate-3.3.0.zip` + `.sha256` |
| Shipped-asset manifest/hash list | MET | `evidence/shipped-assets.json` |
| Reviewable diff vs 3.2.0 | MET | `evidence/feedgate-3.3.0.patch` |
| CHANGELOG / README / Polish guide / MIGRATION | MET | `CHANGELOG.md`, `README.md`, `START_TUTAJ_PL.md`, `docs/MIGRATION.md` |
| RECOVERY / ROOT_CAUSE / WYKOP_SUPPORT / DIAGNOSTICS_SCHEMA / TESTING | MET | `docs/` |
| Screenshots of the real built UI | MET | `evidence/*.png` |

## 14. Known limitations

* Live provider, signed-in-site and live Wykop validation was not performed; all
  fixtures are synthetic except the three real diagnostic exports used only for
  count replay.
* UI08 (full accessibility audit) and REG10 (in-place upgrade) remain open and
  are marked INSUFFICIENT rather than claimed.
* Wykop promotions cannot be hidden locally until a reviewed, verified placement
  marker exists; the adapter reports them as ambiguous on purpose.
* The status panel has no dragging, docking or animation by design.
