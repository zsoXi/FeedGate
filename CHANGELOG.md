# Changelog

## 3.0.0

Safe controls, Wykop and complete recovery. This release does not retune the model, lower thresholds, enable Low-signal filler, convert dims into collapses, or add keyword blocking. It makes the local controls safe and complete.

* **Status panel with three modes.** The on-page panel is now a compact pill by default; clicking it opens the full controls, minimizing returns it to the pill, and closing it hides it genuinely (no overlay, no gap, no lingering badge). The choice is a persisted preference (`compact` / `expanded` / `hidden`), is honored across navigation, refresh, new tabs and browser restarts, and never pauses filtering. Reopening is always available from the popup and settings.
* **Transactional element picker.** Hover only outlines. A click validates the target, then shows a preview bar with the host, the selector, the match count and what would be hidden, with **Create rule** and **Cancel**. Nothing is saved until you confirm; Escape cancels. Commit revalidates the target and the match set. A successful commit shows an Undo for at least 15 seconds.
* **Structural safety guards.** Primary content roots, navigation, layout shells, editors, FeedGate's own UI, multi-item containers and aggregate match sets that would hide most of a page are rejected before anything is saved. A tall single card is a geometry warning, not a rejection. Previously safe selectors are re-checked at application time; a selector that now matches a protected container is quarantined before it can apply.
* **Managed cosmetic filters with stable ids.** Rules now carry a stable id, host, selector, status (`active`, `quarantined`, `disabled`, `deleted`), source, reason and timestamps. The settings screen has an editor with per-rule Enable/Disable/Delete/Edit, **Disable all**, confirmed **Delete all**, per-site status and **Undo deletion**. Deleting or disabling removes the live effect without a hard refresh, and per-domain revisions stop stale forms from resurrecting deleted rules.
* **Recovery that never depends on a responsive page.** **Restore this site** writes the recovery pause to the trusted context first, then asks open tabs to reveal and clean up with a bounded timeout. If no tab acknowledges, the popup reports that cleanup was unacknowledged and offers **Reload this tab with filtering paused** (with an unsaved-input warning; nothing reloads silently). The recovery latch is read before cosmetics, observers or inference after a restart. **Resume this site** is deliberate and reports how many rules still need review.
* **Loop containment.** One controller and one observer lifecycle per document generation, coalesced scans, self-authored mutation classification, no-op reapplication, and a bounded circuit breaker for non-converging self writes that quarantines the offending rule, restores its effects, records an enum reason and never re-enables itself automatically.
* **Wykop (beta).** A sixth site with its own reviewed adapter for Główna/Wykopalisko link lists, tag streams, Mikroblog entries and narrow detail boundaries. Link cards and entries are represented separately with stable identities and kind-aware cache keys. Replies/comments, votes, navigation, bios and concealed 18+ content are excluded; the `Wykop Poleca` expired-promotion note and page-level ad slots are **ambiguous** evidence only — an unverified placement is never labelled a platform ad.
* **Honest site registry and combined setup.** One registry drives UI, patterns, content-script registration and diagnostics for all six platforms. Rows show real states (`not selected`, `needs Chrome access`, `paused`, `refresh required`) and **Enable all supported feeds** requests the missing origins once, from your click. Accordion open/closed is remembered and never changes permissions, filters, registrations or provider calls.
* **Diagnostics schema 5.** Separate sections for UI, site states, cosmetic work, renderer heartbeat, provider accounting and decision history. Cosmetic events use opaque rule references and enum reasons — raw selectors stay in the local rule manager and an explicit settings export. Decision history reports retained vs dropped explicitly, and an empty page list is documented as "no report", not "no renderer".
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
