# Decision policy reference (FeedGate 3.0.0)

Policy version: `policy-2.1.1` (unchanged in 3.0.0). Semantic rubric: `feed-v2.1.0`. Ad detector: `ad-3.0.0`. Extraction: `extract-3.0.0`. This file documents what the code actually
does, in evaluation order. When wording and code disagree, the code wins.

## Inputs the policy evaluates

Each sanitized record carries: site, id, author, text, mediaAlt, quotedText,
truncated, context (`feed`, `thread`, `profile`), linkDomains and a structured
`adEvidence` object. `sponsored` is derived: it is true only when
`adEvidence.status === 'verified'`.

`adEvidence` statuses: `verified`, `ambiguous`, `none`. Only the adapter may
produce `verified`, and `sanitizeAdEvidence` downgrades a claimed verification
unless ownership, outer-post scope and a known marker kind are all present.
Unknown marker kinds are not a verification path. `placementTracking`,
generic rendered labels and hidden templates are never verified.

## Branch precedence (exact order)

| # | Condition | Action | Rule | Source |
| --- | --- | --- | --- | --- |
| 0 | default state | allow | `no_noise_rule_matched` | `policy` |
| 1 | `enabled === false` | allow (paused) | `filtering_paused` | `policy` |
| 2 | author is allowlisted | allow | `author_allowlisted` | `allowlist` |
| 3 | user kept this post | allow | `kept_by_you` | `override` |
| 4 | labelled ads on and verified outer ad evidence | collapse | `platform_labelled_ad` | `local` |
| 5 | no model result (provider failure) | allow | `no_model_judgment` | `unclassified` |
| 6 | `sufficient` missing or `< 0.65` | allow | `insufficient_evidence` | `unclassified` |
| 7 | risk estimate `>=` risk threshold | collapse | `risk_scam_solicitation` | `jev` |
| 8 | custom category enabled and `>=` threshold | dim/collapse | `custom_exclusion` | `jev` |
| 9 | feedSpam `>=` threshold, plus high useful/original | dim | `feed_spam_conflict` | `jev` |
| 10 | feedSpam `>=` threshold | collapse | `feed_spam` | `jev` |
| 11 | protection eligible and `protectUseful` on | allow | `useful_or_original_protection` | `protection` |
| 12 | unwantedAd threshold met AND feedSpam `>= 0.6` AND useful `< 0.45` AND original `< 0.55` | collapse | `unwanted_ad_low_value` | `jev` |
| 13 | bait `>=` threshold | dim (or collapse in aggressive) | `manipulative_bait` | `jev` |
| 14 | lowSignal `>=` threshold (off by default) | dim/collapse | `low_signal_filler` | `jev` |
| 15 | unwantedAd `>= 0.6` and no other noise estimate `>= 0.6` | allow | `promotion_signal_alone` | `protection` |
| 16 | unwantedAd `>= 0.6` or another noise estimate `>= 0.6`, nothing matched | allow | `below_noise_thresholds` | `policy` |
| 17 | anything else | allow | `no_noise_rule_matched` | `policy` |

Notes on the qualified branches:

* The risk branch is evaluated before protection. A verified risk or spam
  estimate can still collapse a post that would otherwise be protected.
* `feed_spam_conflict` exists so a strong spam estimate does not automatically
  hide a post whose useful/original estimates are high. It dims for review
  instead of collapsing; `protected` stays false and `protectionEligible`
  stays true, so the two states are separately observable.
* The `unwanted_ad_low_value` branch requires four conditions at once. An
  unwanted-ad estimate alone cannot collapse anything.
* Branch 15 is what the product calls "promotion alone is not a hiding rule".
  It is reported only when no other noise estimate is elevated; the previous
  wording was corrected in 2.1.1.

## Effective thresholds

Balanced (defaults): risk `0.94` collapse, feedSpam `0.90` collapse,
unwantedAd `0.85` collapse, bait `0.88` dim, lowSignal off (`0.92` if enabled),
custom off (`0.92`).

Aggressive: risk `0.94` collapse, feedSpam `0.85` collapse, unwantedAd `0.78`
collapse, bait `0.82` collapse, lowSignal `0.88` dim, custom unchanged.

Observe Only: the Balanced thresholds with `mode: "observe"`; every
non-allow decision is reported as `wouldAction` while the content stays
visible.

Custom: the user's own thresholds, saved from the policy form; the preset
label becomes `custom`.

All thresholds are inclusive (`score >= threshold`).

## Protection: eligibility versus application

`protectionEligible` is computed from the model estimates alone:
`useful >= 0.65 || original >= 0.70`. It is reported on every model-evaluated
decision, including decisions that collapsed the post.

`protected: true` is only set when protection was actually applied: the post
was kept because it was eligible and `protectUseful` is on. With
`protectUseful: false`, an eligible post can still be dimmed or collapsed; the
card then explains that useful signals were present but protection is off.

The `.65 / .70` values are an engineering choice, not a measurement. They were
lowered from `.70 / .75` in 2.1.1 so marginally useful content keeps the
benefit of the conflict branch. The sufficiency guard (`0.65`) was not
changed.

## Context softening

After a model-based collapse, `soften()` can only weaken collapse to dim:

* truncated text: dim, with "; text is truncated, so only dimmed";
* opened profile or thread with `profileMode: "soft"`: dim, with
  "; gentler filtering on an opened profile".

Softening never applies to `risk_scam_solicitation` or `custom_exclusion`, and
never to local platform-ad collapses.

## Modes and toggles

* `mode: "filter"` — decisions are applied.
* `mode: "observe"` — decisions are computed, logged with `wouldAction`, and
  nothing is hidden.
* `labelledAds: false` — verified platform-ad evidence does not collapse; the
  post proceeds through the semantic path.
* `protectUseful: false` — disables branches 9 and 11; estimates and
  eligibility are still recorded.
* `showStatus: false` — hides the page badge only.

## Community caches

Cached semantic estimates are keyed by rubric, model, custom instruction,
record state and the detector and extraction versions. A cached entry stores
raw estimates, not a verdict, so policy changes are applied at decision time.
The ad detector is not cached: evidence is re-read from the current DOM.

## Failure behaviour

Provider errors, oversized or malformed responses and locked or missing
credentials leave semantic content visible (`no_model_judgment`). A verified
local rule may still apply if it is enabled, because it does not depend on the
provider. Nothing is retried automatically after an auth rejection; rate
limits share one cooldown.
