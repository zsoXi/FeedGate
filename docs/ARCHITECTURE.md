# Architecture

## Runtime modules

`core.js` defines settings validation, typed request/response validation, record minimisation, route guards, cache identities and deterministic policy. `adapters.js` isolates platform-specific selectors and visible text extraction. `content.js` watches DOM changes, queues visible items, renders reversible controls and reports page progress. `background.js` validates senders, handles credentials, serialises settings/budget changes, deduplicates inference, enforces limits and constructs diagnostics. `typesafe.js` is the fixed-endpoint, bounded HTTP client. `vault.js` handles optional passphrase encryption. `options.js` and `popup.js` provide trusted UI; `demo.js` creates fictional test posts without fake model scores.

The ready-made extension has no external JavaScript or runtime libraries. All assets are local. Node is a build/test convenience, not a runtime dependency.

## Request path

The content script sends a validated record from an enabled top-level tab. Before network use, the worker validates the sender's extension ID, tab, actual current site, route, site setting and host permission. It derives profile context from the current tab rather than trusting the submitted context. Private message routes, unrelated sites and subframes do not receive inference access.

Per-post choices, author exceptions and explicit local ad rules can complete without an API request. Remote work requires global enablement, explicit consent, an unlocked and non-rejected key, budget availability and no active rate-limit pause.

Normalised text feeds a SHA-256 cache identity. In-flight requests with the same identity share one network call. Concurrency is bounded from 1 to 12; the queue holds at most 150 pending entries. The cache holds at most 1,600 score records with a configurable time to live. The default is 6 parallel requests, 5,000 request reservations per UTC day and 120 minutes of cache lifetime.

Budget is reserved before HTTP and persists across worker/browser restarts. Crashes can overcount reservations but do not reset the limit. This is a request cap, not a dollar cap; failed and interrupted attempts may still be billed. Rate-limited responses establish a shared bounded pause. There is no unbounded automatic retry loop. After recovery, use Rescan or visit fresh posts.

HTTP requests use the fixed TypeSafe endpoint, omit ambient credentials and referrers, disallow redirects, time out after 15 seconds and reject bodies larger than 128 KiB. Errors do not echo provider response bodies. Every requested Noul answer must be a finite number in [0,1] with the correct primitive type, along with a constrained Jev model name and non-negative integer token counts.

## DOM lifecycle

A MutationObserver detects new posts and relevant changes. IntersectionObserver limits scheduling around the viewport. A low-frequency visible-page sweep covers missed changes. Current post evidence is re-read before applying an asynchronous result so a recycled node cannot receive the old post's verdict. Configuration epochs prevent late responses from overriding changed policies or revoked consent.

UI controls live in shadow roots with explicit restore operations. Content is collapsed or dimmed, never deleted from the platform. Rendering tracks the original inline display/opacity and accessibility attributes. Restoring avoids replacing an unrelated later style update. The observer ignores FeedGate-owned nodes to avoid self-triggered request loops.

Profile context affects policy only. The extension does not crawl accounts or fetch profile pages in the background. Main post text and quoted text are separate where recognised. Show more is never clicked automatically.

## Diagnostics

The worker constructs an allowlisted object rather than dumping storage. It contains release/rubric versions, non-secret connection flags, reduced settings, request/token counters, current page-stage counts and recent score/action metadata. It excludes the live key, encrypted vault, post text, authors, feedback hashes, raw custom questions, CSS selectors and full tab URLs. The UI initiates a JSON file download on the user's explicit click.

## Persistence

Local storage holds versioned preferences, the daily request count, explicit hash-based post choices and optional vault ciphertext. Session storage holds the unlocked key, cached estimates, reduced decision logs and counters. Both storage areas restrict access to trusted extension contexts. Nothing uses Chrome sync storage. Removing the extension clears extension-owned storage; refresh old feed tabs to remove any already-applied DOM changes.
