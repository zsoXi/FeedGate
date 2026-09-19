# Architecture

## Runtime modules

`core.js` defines settings validation, migration, typed request/response validation, the structured ad-evidence contract, record minimisation, route guards, the cosmetic rule model with its documented selector subset and safety rejections, cache identities with the `feed-v2.1.0` rubric namespace and the deterministic precision-first policy (`policy-3.1.0`) with named rules, including the local author mute list. `adapters.js` isolates platform-specific selectors, visible text extraction (`extract-3.0.0`, including the reviewed Wykop link/entry adapter) and the reviewed ad marker rules (`ad-3.0.0`). `content.js` watches DOM changes, maintains one controller per document, owns the compact/expanded/hidden status panel, applies cosmetic rules with per-rule ownership and a bounded circuit breaker, provides the transactional picker and renders reversible controls (keep, allow author, mute author). `background.js` validates senders, handles credentials, serialises settings/budget/recovery changes per domain with revisions, deduplicates inference, enforces limits, latches per-site recovery before cleanup and constructs diagnostics schema 6. `typesafe.js` is the fixed-endpoint, bounded HTTP client. `vault.js` handles optional passphrase encryption. `options.js` and `popup.js` provide trusted UI (feeds accordion, rule manager, recovery, status mode, author lists); `demo.js` creates fictional test posts without fake model scores.

The ready-made extension has no external JavaScript or runtime libraries. All assets are local. Node is a build/test convenience, not a runtime dependency.

## Request path

The content script sends a validated record from an enabled top-level tab. Before network use, the worker validates the sender's extension ID, tab, actual current site, route, site setting and host permission. It derives profile context from the current tab rather than trusting the submitted context. Private message routes, unrelated sites and subframes do not receive inference access.

Per-post choices, author exceptions and explicit local ad rules can complete without an API request. Remote work requires global enablement, explicit consent, an unlocked and non-rejected key, budget availability and no active rate-limit pause.

Normalised text feeds a SHA-256 cache identity that includes the rubric version, the cache namespace, the ad detector version and the extraction version, so obsolete entries can never be served to current decisions. Cached values are raw model estimates; the current policy is applied to them again at decision time, so policy changes do not require cache invalidation. In-flight requests with the same identity share one network call. Concurrency is bounded from 1 to 12; the queue holds at most 150 pending entries. The cache holds at most 1,600 score records with a configurable time to live. The default is 6 parallel requests, 5,000 request reservations per UTC day and 120 minutes of cache lifetime.

Budget is reserved before HTTP and persists across worker/browser restarts. Crashes can overcount reservations but do not reset the limit. This is a request cap, not a dollar cap; failed and interrupted attempts may still be billed. Rate-limited responses establish a shared bounded pause. There is no unbounded automatic retry loop. After recovery, use Rescan or visit fresh posts.

HTTP requests use the fixed TypeSafe endpoint, omit ambient credentials and referrers, disallow redirects, time out after 15 seconds and reject bodies larger than 128 KiB. Errors do not echo provider response bodies. Every requested Noul answer must be a finite number in [0,1] with the correct primitive type, along with a constrained Jev model name and non-negative integer token counts. The shared instruction plus eight question texts total roughly 1,800 characters (about 38% smaller than 2.0) so an ordinary post stays in the few-hundred-input-token range.

## DOM lifecycle

A MutationObserver detects new posts and relevant changes. IntersectionObserver limits scheduling around the viewport. A low-frequency visible-page sweep covers missed changes. Current post evidence is re-read before applying an asynchronous result so a recycled node cannot receive the old post's verdict. Ad-marker changes are part of that re-read: a removed marker, a changed text, a new quote or a changed local-ad switch invalidates the old decision and restores the previous content. Configuration epochs prevent late responses from overriding changed policies or revoked consent.

UI controls live in shadow roots with explicit restore operations. Content is collapsed or dimmed, never deleted from the platform. Rendering tracks the original inline display/opacity and accessibility attributes. Restoring avoids replacing an unrelated later style update. The observer ignores FeedGate-owned nodes to avoid self-triggered request loops.

Profile context affects policy only. The extension does not crawl accounts or fetch profile pages in the background. Main post text and quoted text are separate where recognised. Show more is never clicked automatically.

## Diagnostics

The worker constructs an allowlisted object rather than dumping storage. It contains release/rubric/policy/detector/extraction versions as a build fingerprint, non-secret connection flags, reduced settings, request/token counters, current page-stage counts and recent score/action metadata including the matched rule name, protection flag, protection-eligibility flag, conflict flag, sufficiency estimate and the ad-evidence summary (marker kind, selector id, ownership, scope, evidence basis). It excludes the live key, encrypted vault, post text, authors, feedback hashes, raw custom questions, CSS selectors and full tab URLs. The UI initiates a JSON file download on the user's explicit click.

## Persistence

Local storage holds versioned preferences (schema version 5), the daily request count, explicit hash-based post choices and optional vault ciphertext. Session storage holds the unlocked key, cached estimates, reduced decision logs and counters; its runtime state uses version 5 so older state is ignored. Both storage areas restrict access to trusted extension contexts. Nothing uses Chrome sync storage. Removing the extension clears extension-owned storage; refresh old feed tabs to remove any already-applied DOM changes.
