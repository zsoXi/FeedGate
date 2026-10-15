# Changelog

## 3.3.0

Local controls for authors, topics, repeats and spend. The eight base questions and every existing category and threshold keep their meaning; one optional question and one precedence row are added.

* **Atomic author lists.** Allow/Mute/Forget now read and write the lists inside the worker's serialized change queue, so simultaneous mutes of two different authors can no longer lose one. Undo restores the exact state before the action, refuses to overwrite a newer decision about the same author, and a change to another author never blocks a revert.
* **Stable author identity.** LinkedIn, Facebook and Instagram posts now carry a canonical profile id (`authorId`) taken from the post's own profile link. A display name alone is reported as `authorNameOnly` and never matches the mute or allow lists, so two accounts with the same name cannot share an exception. X, Reddit and Wykop keep their canonical authors; old name-based entries on the other platforms stay stored but inert.
* **Mute a topic for a time.** The status panel gains **Mute topic…**: click a post, edit the topic name, choose the scope (this site by default, or all supported platforms) and the duration (24 hours, 7 days or until removed). Saving happens only after confirmation, the toast offers Undo, and Settings → Muted topics lists every rule with its scope and expiry. Matching is semantic through the same Jev request (one bounded extra question), a passing mention or a quoted claim stays visible, **Keep this post** wins, and an expired rule stops hiding posts by itself. Topic edits or expiry change the cache key, so stale verdicts and in-flight results cannot re-hide a post.
* **Group repeated posts (optional).** When enabled, the first copy of a message stays visible and later near-duplicates fold behind a "more similar posts" bar that expands in place. Grouping is local only (token signatures plus a similarity threshold, bounded per tab), never spends a provider request, never removes or clones platform posts, skips posts kept or already hidden by another rule, and restores everything when disabled.
* **Usage panel and thrift mode.** The review page gains an **API usage** panel: used and remaining daily requests (reset at 00:00 UTC, shown in local time), provider attempts, successful analyses, cache hits, errors, cancellations, unaccounted attempts and input/output tokens. Monetary cost appears only when you configure your own rates and is labelled an estimate, not a provider bill. Optional **thrift mode** defers cloud analysis until a post is actually visible and scrolling has settled for a configurable pause (300–3000 ms, default 800). Fast scrolling starts no requests, hidden tabs stay idle, sent requests are never aborted by scrolling, and local author, verified-ad and cosmetic rules still act immediately.
* **Policy `policy-3.3.0`, rubric `feed-v2.2.0`.** One new optional ninth question (`topic`) and one new precedence row (`topic_muted`) after the sufficiency guard. Settings schema 6 (topics, grouping, thrift, thriftDelayMs, pricing) migrates every existing preference, list and rule and leaves the new features off. Runtime state 6. Diagnostics schema 8 adds `ui.grouping` / `ui.thrift` / `ui.thriftDelayMs` and `settings.mutedTopicCount`; exports are version 6 and imports accept v6/v5/v4/v3/v2 and reject v1.

Validation: 164 Node tests, 66 Chromium DOM/UI scenarios, an 8-check unpacked-extension smoke test and 9 release integrity checks passed locally. All fixtures are synthetic except the three real privacy-safe diagnostics exports used only for count replay. Live provider, signed-in-site and live Wykop validation remain manual gates and are reported as not performed.

## 3.2.0

Identity that survives updates. No model, rubric, threshold, detector or extraction change; policy `policy-3.1.0`, settings schema 5 and runtime state 5 are unchanged. Diagnostics schema is now 7.

* **Stable extension identity.** The manifest carries a bundled RSA public key, so the extension id (`oombgdfajfomncpoiljbhpnagigjjbcc`) no longer depends on the folder path. Once 3.2.0 is loaded, the encrypted vault, settings and local lists survive every future in-place update or folder move. Only the public key is embedded; the private key is never packaged and the update path contacts no server.
* **Updates panel (`06 Updates`).** Settings compare the loaded build with the files on disk by reading the packaged `build.json` (release, build id, built at) that `npm run build` writes. The panel reports up to date / update available / unknown, explains the in-place flow (copy new files over the same folder, Reload from `chrome://extensions`, never Remove) and opens the extensions page. Open tabs with an outdated content script still show the reload prompt instead of mixing schemas.
* **Sealed key backup.** **Export key backup** downloads only the encrypted vault blob (`feedgate-key-backup`, version 1, AES-256-GCM / PBKDF2-SHA256, 600,000 iterations); the API key never appears in plaintext. **Import key backup** restores it on another install of the same identity and unlocks with the passphrase as usual.
* **One-time transition caveat.** Builds before 3.2.0 derived the extension id from the folder path, so the first 3.2.0 load starts the fixed identity and an earlier vault does not carry over automatically: enter the API key once more or import a backup taken from the same identity. From then on it survives updates. The Updates page states this plainly.
* **Diagnostics schema 7.** Exports gain an `update` section (running, onDisk, updateAvailable, buildId, checkedAt); the build fingerprint block is unchanged and no new personal data is exported.
* **Tests.** New cases cover vault-backup validation, the export/import round trip (sealed blob only, corrupted blob rejected), the update comparison without any provider call, the Updates panel scenario (`UPDATE01`) and the stable extension id derived from the manifest key.

Validation: 146 Node tests, 62 Chromium DOM/UI scenarios, an 8-check unpacked-extension smoke test and 9 release integrity checks passed locally. All fixtures are synthetic except the three real privacy-safe diagnostics exports used only for count replay. Live provider, signed-in-site and live Wykop validation remain manual gates and are reported as not performed.

## 3.1.1

Status-panel author controls. No model, rubric, threshold, detector, extraction or schema change; settings schema 5, runtime state 5, diagnostics schema 6 and policy `policy-3.1.0` are unchanged.

* **Author actions where you browse.** The expanded status panel now offers **Mute author…** and **Allow author…** next to **Pick element**. Hovering highlights the post under the pointer; clicking one shows a preview that names the author and states that this local choice makes no model request; saving runs the same deterministic `author_muted` / `author_allowlisted` branch as the filter cards.
* **Undo for both directions.** The confirmation toast offers **Undo**, which sends `FG_FORGET_AUTHOR`: a new content-callable message that removes the author from the mute and allow lists without adding the opposite entry. Escape or the Cancel button abandons the selection with nothing saved.
* **Tests.** A new worker case covers the forget round trip (both lists cleared, the post needs the model again), and a Chromium scenario (`PANEL01`) mutes and unmutes an author from the panel, checks the preview text, and confirms the muted author is never re-sent to the model.

Validation: 143 Node tests, 61 Chromium DOM/UI scenarios, a 7-check unpacked-extension smoke test and 8 release integrity checks passed locally. All fixtures are synthetic except the three real privacy-safe diagnostics exports used only for count replay. Live provider, signed-in-site and live Wykop validation remain manual gates and are reported as not performed.

## 3.1.0

User controls, not model changes. No rubric, threshold, detector or extraction change; the semantic policy gains exactly one deterministic local branch.

* **Mute author.** Every filter card now offers **Mute author** next to **Allow author**. Muting hides that author's posts on that platform only, deterministically and without any provider request (the decision rule is `author_muted`, source `author`). The mute list is local, capped at 500 entries, mutually exclusive with the allow list, and fully reversible: unmute in FeedGate settings or via a settings export round-trip. A post you explicitly kept with **Keep this post** still wins over the mute list, and cosmetic rules are unaffected.
* **Clearer exception rule.** The custom instruction is now a first-class **My exception rule (optional)** panel with a live character counter and a status badge. The fine print states plainly that it is a hint for the model rather than a guaranteed filter, that it is sent as an extra question with every cloud request even when the `Your exclusion rule` category is Off (which costs tokens), and that secrets must never be placed there. Diagnostics still report only a boolean, never the text.
* **Policy `policy-3.1.0`.** One new precedence row: a muted author collapses before verified ads and all semantic branches. Nothing else in the decision table changed.
* **Settings schema 5.** Adds `blockedAuthors`; a 3.0.1 (version 4) settings object migrates automatically, keeping cosmetic rules and revisions. Runtime state stays version 5, so a 3.0.1 session still restores its cache and counters.
* **Diagnostics schema 6.** Adds `settings.mutedAuthorCount` (count only) and the `author_muted` rule with source `author` in decision entries. Settings exports are now version 5; imports accept v5/v4/v3/v2 and reject v1.
* **Tests.** New cases cover the mute branch end to end: policy precedence and observe-mode wrapping, keep-this-post winning, mutual exclusion on allow/mute, list bounds, v4→v5 migration, zero provider requests for muted authors, muted-author counts in diagnostics, and a Chromium scenario that mutes an author from a filter card and confirms the hidden post returns after unmuting.

Validation: 142 Node tests, 60 Chromium DOM/UI scenarios, a 7-check unpacked-extension smoke test and 8 release integrity checks passed locally. All fixtures are synthetic except the three real privacy-safe diagnostics exports used only for count replay. Live provider, signed-in-site and live Wykop validation remain manual gates and are reported as not performed.

## 3.0.1

Maintenance fix for the site list. No policy, rubric, detector or extraction change; thresholds and defaults are untouched.

* Fixed phantom **Refresh required** states. Disabling feeds (including **Disable all feeds** followed by **Enable all supported feeds**) used to leave a cleanup marker for every removed site, even when that site had no open tab. Those markers never cleared until a page of that site was visited, so rows could show **Refresh required** forever and the site stayed ineffective. Cleanup is now only tracked while the removed site still has an open supported tab, and site status aggregation prunes any marker whose site no longer has one. Opening the popup, settings or a diagnostics export self-heals older state. A site with no open tab has nothing to refresh.
* Added regression coverage for the pruning path: the site-state matrix now asserts that a marker with an open tab reads `refresh_required`, and that closing the last tab returns the site to `ready` and removes the stored marker.
* Settings schema, runtime schema, diagnostics schema, rubric `feed-v2.1.0`, policy `policy-2.1.1`, detector `ad-3.0.0` and extraction `extract-3.0.0` are unchanged. Release version is `3.0.1`.

Validation: 139 Node tests, 59 Chromium DOM/UI scenarios, a 7-check unpacked-extension smoke test and 8 release integrity checks passed locally. All fixtures are synthetic except the three real privacy-safe diagnostics exports used only for count replay. Live provider, signed-in-site and live Wykop validation remain manual gates and are reported as not performed.

## 3.0.0

Safe controls, Wykop and complete recovery. This release does not retune the model, lower thresholds, enable Low-signal filler, convert dims into collapses, or add keyword blocking. It makes the local controls safe and complete.

* **Status panel with three modes.** The on-page panel is now a compact pill by default; clicking it opens the full controls, minimizing returns it to the pill, and closing it hides it genuinely (no overlay, no gap, no lingering badge). The choice is a persisted preference (`compact` / `expanded` / `hidden`), is honored across navigation, refresh, new tabs and browser restarts, and never pauses filtering. Reopening is always available from the popup and settings.
* **Transactional element picker.** Hover only outlines. A click validates the target, then shows a preview bar with the host, the selector, the match count and what would be hidden, with **Create rule** and **Cancel**. Nothing is saved until you confirm; Escape cancels. Commit revalidates the target and the match set. A successful commit shows an Undo for at least 15 seconds.
* **Structural safety guards.** Primary content roots, navigation, layout shells, editors, FeedGate's own UI, multi-item containers and aggregate match sets that would hide most of a page are rejected before anything is saved. A tall single card is a geometry warning, not a rejection. Previously safe selectors are re-checked at application time; a selector that now matches a protected container is quarantined before it can apply.
* **Managed cosmetic filters with stable ids.** Rules now carry a stable id, host, selector, status (`active`, `quarantined`, `disabled`, `deleted`), source, reason and timestamps. The settings screen has an editor with per-rule Enable/Disable/Delete/Edit, **Disable all**, confirmed **Delete all**, per-site status and **Undo deletion**. Deleting or disabling removes the live effect without a hard refresh, and per-domain revisions stop stale forms from resurrecting deleted rules.
* **Recovery that never depends on a responsive page.** **Restore this site** writes the recovery pause to the trusted context first, then asks open tabs to reveal and clean up with a bounded timeout. If no tab acknowledges, the popup reports that cleanup was unacknowledged and offers **Reload this tab with filtering paused** (with an unsaved-input warning; nothing reloads silently). The recovery latch is read before cosmetics, observers or inference after a restart. **Resume this site** is deliberate and reports how many rules still need review.
* **Loop containment.** One controller and one observer lifecycle per document generation, coalesced scans, self-authored mutation classification, no-op reapplication, and a bounded circuit breaker for non-converging self writes that quarantines the offending rule, restores its effects, records an enum reason and never re-enables itself automatically.
* **Wykop (beta).** A sixth site with its own reviewed adapter for Główna/Wykopalisko link lists, tag streams, Mikroblog entries and narrow detail boundaries. Link cards and entries are represented separately with stable identities and kind-aware cache keys. Replies/comments, votes, navigation, bios and concealed 18+ content are excluded; the `Wykop Poleca` expired-promotion note and page-level ad slots are **ambiguous** evidence only. An unverified placement is never labelled a platform ad.
* **Honest site registry and combined setup.** One registry drives UI, patterns, content-script registration and diagnostics for all six platforms. Rows show real states (`not selected`, `needs Chrome access`, `paused`, `refresh required`) and **Enable all supported feeds** requests the missing origins once, from your click. Accordion open/closed is remembered and never changes permissions, filters, registrations or provider calls.
* **Diagnostics schema 5.** Separate sections for UI, site states, cosmetic work, renderer heartbeat, provider accounting and decision history. Cosmetic events use opaque rule references and enum reasons. Raw selectors stay in the local rule manager and an explicit settings export. Decision history reports retained vs dropped explicitly, and an empty page list is documented as "no report", not "no renderer".
* **Separated versions and fingerprints.** Release `3.0.0`, rubric `feed-v2.1.0` (unchanged), policy `policy-2.1.1` (unchanged), detector `ad-3.0.0`, extraction `extract-3.0.0`, settings schema 4, runtime 5, diagnostics 5. The diagnostics export carries the full build fingerprint, and the release check compares source and shipped files byte for byte.
* **Legacy quarantine migration.** Free-form cosmetic CSS from earlier versions is imported as quarantined rules (`legacy_unvalidated`) and cannot execute before the upgrade UI has been seen and a real target verified.
* **Tests.** The local feed grew four more fictional samples; the node suite grew a dedicated v3 feature suite (selector subset, rule lifecycle, revisions, recovery, permissions, cosmetics accounting, Wykop registry) and the Chromium DOM/UI suite grew scenarios for HUD modes, hidden-status filtering, structural picker rejection, preview/Undo, ownership separation, the circuit breaker, re-injection and Wykop fixtures. The 2.1.1 incident export is replayed in the incident suite.

Validation: 139 Node tests, 59 Chromium DOM/UI scenarios, a 7-check unpacked-extension smoke test and 8 release integrity checks passed locally. All fixtures are synthetic except the three real privacy-safe diagnostics exports used only for count replay. Live provider, signed-in-site and live Wykop validation remain manual gates and are reported as not performed.

## 2.1.1

Evidence-based filtering repair. Local advertisement decisions now require verifiable platform evidence, and every reported reason matches the rule that actually ran.

* Replaced the loose local ad detector with a structured evidence contract: `status` (`verified`/`ambiguous`/`none`), marker kind from a fixed enum, selector id, outer-post ownership, rendered-label flag, evidence basis and scope. Only `verified` outer-post evidence may hide a post locally.
* Impression-tracking wrappers (`placementTracking`) are now at most `ambiguous` evidence and never hide anything by themselves. Bare "Ad" text heuristics were removed. Labels inside quoted posts, adjacent cards or hidden templates cannot mark the outer post.
* Legacy boolean `sponsored` flags migrate to `ambiguous`; they can no longer trigger a local collapse or be forwarded to Jev as a sponsor marker.
* Every decision records its ad-evidence summary, and the filter card now names the verified marker when a local ad decision fired.
* Fixed misleading reasons: `promotion_signal_alone` is reported only when no other noise estimate is elevated. Posts kept because no category threshold was met now report `below_noise_thresholds`.
* Lowered the useful/original protection eligibility thresholds to 0.65/0.70 (an engineering choice, documented) and exposed `protectionEligible` separately from applied protection. The sufficiency guard is unchanged.
* Separated versions: release `2.1.1`, rubric `feed-v2.1.0` (questions unchanged), policy `policy-2.1.1`, ad detector `ad-2.1.1`, extraction `extract-2.1.1`, diagnostics schema `4`, runtime state `4`. Settings schema stays 3.
* Diagnostics exports gained a build fingerprint block so a mixed old/new installation is immediately visible. Content scripts now detect a reloaded worker with a newer release and ask for a page reload instead of mixing message schemas.
* Deduplicated Reddit titles that appeared both in the title attribute and in collected body text.
* Added incident replay tests for the supplied 2.1.0 diagnostics and new regression coverage for ad evidence ownership, response mapping, extraction limits, policy precedence, bounded history and session handling.

Validation: 118 Node tests, 46 Chromium DOM/UI scenarios and a 7-check unpacked-extension smoke test passed locally. All fixtures are synthetic; live provider and signed-in-site validation remain manual gates and are reported as not performed.

## 2.1.0

Precision-first release. A post being promotional is never a sufficient reason to hide it.

* Reworked the rubric into eight renamed estimates: unwanted advertising, feed spam, manipulative engagement bait, low-signal filler, useful information, original contribution, risk/scam-like content and evidence sufficiency. "Promotion" is no longer a filtering category.
* Made unwanted-advertising collapse conditional on high feed-spam signals and low usefulness estimates, and kept useful/original protection ahead of every advertising, bait and low-signal rule.
* Added explicit rule names to every decision (`promotion_signal_alone`, `unwanted_ad_low_value`, `feed_spam`, `feed_spam_conflict`, `manipulative_bait`, `low_signal_filler`, `risk_scam_solicitation`, `useful_or_original_protection`, `insufficient_evidence`, ...), exposed through logs and the diagnostics export.
* Reduced the shared rubric payload by about 38% (roughly 2,900 to 1,800 instruction characters) to target a few hundred input tokens per ordinary post while keeping all eight questions.
* Bumped the rubric to `feed-v2.1.0`, the cache namespace to `feedgate:decision-cache` and the settings/runtime/export schema to version 3. Old cached judgments and old thresholds are ignored.
* Migrated existing preferences without mapping the 2.0 promotion threshold onto the new unwanted-advertising category; balanced 2.1 defaults are used instead. See `docs/MIGRATION.md`.
* Added Balanced, Aggressive, Observe Only and Custom preset handling, including a direct Custom button in the policy screen.
* Updated the filter card and options UI to explain filtering reasons in plain language ("Feed spam", "Manipulative engagement bait", "Low-value unsolicited promotion") and to note when useful signals caused a review dim instead of a hide.
* Extended the local test feed with release-note, growth-case-study, platitude and benchmark-question examples.
* Added a 25-case precision-first regression suite plus migration, cache-invalidation and diagnostics-rule coverage.

Validation: 99 Node tests and 31 Chromium DOM/UI scenarios passed locally with controlled Chrome/API substitutes. Native installed-extension, current signed-in-feed and live-provider validation remain manual release gates.

## 2.0.0

This is the single canonical replacement for both earlier 0.1.0 packages.

* Removed the runtime bridge, pairing code, port and terminal requirement. The extension worker calls TypeSafe directly.
* Added a guided Connect & start flow, real-provider test, explicit consent, optional passphrase-encrypted vault and optional per-platform access.
* Replaced stand-alone promotion blocking with an eight-feature judgment rubric and explicit useful-content protection.
* Added Balanced, Aggressive and Observe presets, cautious handling of contradictory estimates, gentler profile rules and conservative treatment of truncated text.
* Separated quotations from the main author's text. Names and quoted ad markers no longer qualify as local platform ad labels in covered fixtures.
* Added persistent, hash-based Keep this post choices without learning account reputation.
* Added a live page badge, page counters, verified-provider state and a privacy-minimised diagnostics export.
* Preserved reversible local CSS filters, the element picker, author allowlists, queue/cost guards and strict API parsing.
* Added policy, workflow, export, profile, quotation, permissions and lifecycle regression tests.

Validation: 110 Node tests and 31 Chromium DOM/UI scenarios passed locally with controlled Chrome/API substitutes. Native installed-extension, current signed-in-feed and live-provider validation remain manual release gates.
