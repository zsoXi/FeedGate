# Changelog

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
