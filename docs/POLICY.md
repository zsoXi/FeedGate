# FeedGate 2.0 policy

This specification describes code behaviour, not a claim that the model is accurate. All feature values are Noul estimates from 0 to 1. They are not independent calibration measurements or a probability that an author is a bot.

## Features

The model evaluates promotional intent, spam solicitation, empty engagement bait, generic filler, substantive information, concrete contribution, fraud-like solicitation and whether the visible evidence is sufficient. A user-supplied question adds an additional estimate when its text is present. Setting its action to Off prevents that estimate from filtering, but does not remove a non-empty question from the API request; clear the text to stop sending it.

Only visible text, a separately identified visible quote, accessible media text, sponsored markers and linked domains are supplied. Main-author intent is distinguished from quoted claims. No account history or original-source search is available. Open source is not an automatic exemption and numerical claims are not automatic information value.

## Decision order

Global pause, explicit author exceptions and a saved per-post choice take precedence over post filtering. User-created cosmetic selectors are separate explicit instructions and can still match a normally allowed author.

An explicit platform ad marker is evaluated locally. In the absence of that local rule, insufficient textual evidence (below 0.65) leaves the post visible.

The semantic rules then follow this order:

| Rule | Balanced default | Action |
| --- | --- | --- |
| Fraud-like solicitation | risk >= 0.94 | Collapse, regardless of positive value estimates. This is a pattern warning, not a verified scam verdict. |
| Custom exclusion | User enables it; custom >= 0.92 | User-chosen action. Positive-value and profile protection do not override an explicit preference. |
| Spam solicitation | spam >= 0.90 | Collapse, except conflicting useful-content estimates with spam below 0.98 cause Dim for review. |
| Useful-content protection | value >= 0.70 OR contribution >= 0.75 | Keep. The preceding risk, custom and strong-spam rules still apply. |
| Low-value promotion | promotion >= 0.80 AND spam >= 0.60 AND value < 0.45 AND contribution < 0.55 | Collapse. Promotional intent alone never qualifies. |
| Empty engagement bait | bait >= 0.88 | Dim. |
| Generic filler | Disabled by default | No action unless the user enables it. |
| No match | None of the above | Keep. |

Profile mode Soft changes ordinary semantic Collapse decisions to Dim. Truncated visible text also receives Dim instead of ordinary semantic Collapse. These softening rules do not apply to risk, explicit custom exclusions or platform-labelled ads.

Observe mode records the intended action while leaving content visible, including local ads and manual CSS selections.

## Presets

Balanced uses the table above. Aggressive lowers spam to 0.85 and low-value promotion to 0.75, collapses bait at 0.82 and dims generic filler at 0.88. It preserves positive-content protection and gentle profile treatment. Observe starts from Balanced but never applies hiding. Manual edits are labelled Custom.

These thresholds are initial operating choices, not values calibrated on a representative labelled feed. Use the live evaluation runner and user feedback before describing any error rate.

## Cache and feedback

The cache stores feature estimates, not final actions. Its identity includes the rubric version, model, custom question and normalised evidence. Thresholds, author labels, post ID and feed/profile context do not affect inference identity. Policy is applied again for the current context.

A saved Keep this post exception is different: its local hash includes site, post ID, text, quote and accessible media text. An edited post is evaluated again. Up to 2,000 exceptions can persist locally. No author-wide reputation is inferred from them.

The model can still be fooled by rhetoric, prompt injection, ambiguous claims or incomplete context. Prompts constrain untrusted text, but do not provide a formal semantic security guarantee. No model response can execute code or request arbitrary URLs in this implementation.
