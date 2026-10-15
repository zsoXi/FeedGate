# FeedGate 3.0.0 policy

FeedGate 3.3.0 keeps the 2.1.1 semantic policy unchanged. What changed in 3.0.0
is local control, safety and coverage: the status panel modes, transactional
picker, managed cosmetic filters with revisioned writes, per-site recovery, loop
containment and the Wykop beta adapter. No category threshold was lowered, Dim
was not converted to Collapse, Low-signal filler remains off and the model was
not retuned.

This specification describes code behaviour, not a claim that the model is accurate. All feature values are Noul estimates from 0 to 1. They are not independent calibration measurements or a probability that an author is a bot. Policy version: `policy-3.1.0`. Semantic rubric version: `feed-v2.1.0` (unchanged from 2.1.0; only local evidence handling, thresholds and reason naming changed). Ad detector `ad-3.0.0` and extraction `extract-3.0.0` add the Wykop adapter and the same reviewed marker rules. The 3.1.0 policy adds one deterministic local branch (an explicit author mute list) in front of every model estimate; no category, threshold or rubric changed.

## Features

The model evaluates unwanted advertising, feed spam, manipulative engagement bait, low-signal filler, useful information, original contribution, risk/scam-like solicitation and whether the visible evidence is sufficient. A user-supplied question adds an additional estimate when its text is present. Setting its action to Off prevents that estimate from filtering, but does not remove a non-empty question from the API request; clear the text to stop sending it.

Promotional intent is not a category and cannot hide a post by itself. The unwanted-advertising estimate is only actionable together with independent spam evidence and low usefulness, as described below.

Only visible text, a separately identified visible quote, accessible media text, validated sponsored markers and linked domains are supplied. Main-author intent is distinguished from quoted claims. No account history or original-source search is available. Open source is not an automatic exemption and numerical claims are not automatic information value.

## Platform ad evidence

A platform-labelled ad is never inferred from page text. The detector reports a structured evidence object with `status` (`verified`, `ambiguous`, `none`), `markerKind` (a closed enum), `selectorId`, `ownerMatched`, `renderedLabel`, `evidenceKind` (`rendered_label`, `platform_metadata`, `none`) and `scope` (`outer_post`, `quote`, `unrelated`, `unknown`).

Only adapters can establish evidence, and `verified` is downgraded to `ambiguous` unless the marker is owned by the outer post, scoped to the outer post, rendered, and belongs to the reviewed marker list. A generic tracking wrapper (`placementTracking`) is at most `ambiguous`; a label inside a quote or another post is never inherited; invisible templates, menu-only labels and detached nodes cannot verify. Words such as "ad" or "sponsored" inside body text, names, links, alt text or arbitrary accessibility labels are not evidence. Legacy boolean `sponsored` flags are migrated to `ambiguous` and can never trigger local hiding.

Local automatic collapse requires `status: verified`, ownership by the current outer post and the user's local-ad switch enabled. Anything `ambiguous` continues through the semantic path and is not presented to the model as a confirmed ad marker.

Reddit uses its own rules (an ad post element or a rendered credit-bar label); X heuristics are not borrowed by other adapters. Other adapters can only reach `ambiguous`.

## Decision order

Global pause, explicit author exceptions and a saved per-post choice take precedence over post filtering. User-created cosmetic selectors are separate explicit instructions and can still match a normally allowed author.

A verified platform ad marker is evaluated locally when the local-ad switch is on. Without that local rule, insufficient textual evidence (below 0.65) leaves the post visible.

The semantic rules then follow this order (first match wins):

| Rule name | Balanced default | Action |
| --- | --- | --- |
| `risk_scam_solicitation` | risk >= 0.94 | Collapse, regardless of useful estimates. This is a pattern warning, not a verified scam verdict. |
| `custom_exclusion` | User enables it; custom >= 0.92 | User-chosen action. Useful-content and profile protection do not override an explicit preference. |
| `feed_spam` | feed spam >= 0.90 | Collapse, except conflicting useful estimates with feed spam below 0.98 cause `feed_spam_conflict`: Dim for review. |
| `useful_or_original_protection` | useful >= 0.65 OR original >= 0.70 | Keep. The preceding risk, custom and strong-spam rules still apply. Sets the protected indicator and notes when unwanted-advertising signals were also high. |
| `unwanted_ad_low_value` | unwanted advertising >= 0.85 AND feed spam >= 0.60 AND useful < 0.45 AND original < 0.55 | Collapse. The spam and usefulness conditions are part of the rule; a lone advertising estimate never matches. |
| `manipulative_bait` | bait >= 0.88 | Dim in Balanced; collapse if the user sets that category to Collapse. |
| `low_signal_filler` | Disabled by default | No action unless the user enables it. |
| `promotion_signal_alone` | unwanted advertising >= 0.60 and no other elevated noise signal | Keep, and state that promotional signals alone do not qualify. |
| `below_noise_thresholds` | some noise signal >= 0.60 but no category threshold met | Keep, and state that no category threshold was met. |
| `no_noise_rule_matched` | none of the above | Keep. |

Every model-evaluated decision also reports `protectionEligible` (the estimate met the useful/original bar) separately from `protected` (protection is enabled and was actually applied). This keeps eligibility and applied protection distinguishable in the log and diagnostics.

Profile mode Soft changes ordinary semantic Collapse decisions to Dim. Truncated visible text also receives Dim instead of ordinary semantic Collapse. These softening rules do not apply to risk, explicit custom exclusions or verified platform-labelled ads.

Observe Only runs the whole pipeline and records the intended action while leaving content visible, including local ads and manual CSS selections.

Every decision carries its rule name, action, source, protection/eligibility flags, conflict flag, full score set, sufficiency estimate, cache status, model and latency. Verified local ad decisions also carry the evidence object. Diagnostics expose these fields without post text, authors, keys or full URLs.

## Presets

Balanced uses the table above. Aggressive lowers feed spam to 0.85 and unwanted advertising to 0.78, collapses bait at 0.82 and dims low-signal filler at 0.88; useful-content protection is unchanged. Observe Only starts from Balanced but never applies hiding. Custom keeps the user's own thresholds from the policy form.

Protection thresholds (useful 0.65, original 0.70) were lowered in 2.1.1 as an engineering choice so that marginally useful content keeps the benefit of the conflict branch. They were not derived from the recorded incident scores, and the sufficiency guard (0.65) is deliberately unchanged.

These thresholds are initial operating choices, not values calibrated on a representative labelled feed. Use the live evaluation runner and user feedback before describing any error rate.

## Cache and feedback

The cache stores feature estimates, not final actions. Its identity includes the rubric version (`feed-v2.1.0`), the detector version (`ad-3.0.0`), the extraction version (`extract-3.0.0`), the item kind (`post`, `link`, `entry` or `comment`), the cache namespace, model, custom question and normalised evidence (which includes only verified ad evidence). Thresholds, author labels, post ID and feed/profile context do not affect inference identity. Policy is applied again for the current context, so a threshold change does not discard cached estimates.

Older cache entries are not reusable: the rubric, detector and extraction versions plus the session runtime schema differ, so old decisions expire naturally and never contaminate current policy.

A saved Keep this post exception is different: its local hash includes site, post ID, text, quote and accessible media text. An edited post is evaluated again. Up to 2,000 exceptions can persist locally. No author-wide reputation is inferred from them.

The model can still be fooled by rhetoric, prompt injection, ambiguous claims or incomplete context. Prompts constrain untrusted text, but do not provide a formal semantic security guarantee. No model response can execute code or request arbitrary URLs in this implementation.
