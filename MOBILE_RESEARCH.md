# FeedGate on mobile — feasibility research (Chrome for Android & iPhone)

**Status:** research only — no implementation. Written 2026-09-19. Baseline: FeedGate 3.3.0 (MV3 Chrome extension, zero runtime dependencies, TypeSafe Jev, padded release at `D:\FeedGate\FeedGate-3.3.0`, pushed as `3e75b76`).

**Question:** how could FeedGate run on mobile — specifically on Chrome for Android and on iPhone?

---

## TL;DR

1. **Chrome for Android: not possible.** Stable Chrome for Android has no extension support (still true in mid-2026; Google experiments quietly but nothing usable). Chrome on **iOS** is WebKit-based and also has **no** extension support. So "Chrome on mobile" cannot be the target on either platform.
2. **iPhone: viable through Safari Web Extensions** (the only browser engine on iOS is WebKit, and only Safari exposes a WebExtensions runtime). Crucially for this project, Apple now offers a **web-based packager in App Store Connect** that builds and uploads the Safari extension **without a Mac or Xcode** — the biggest blocker (Windows-only dev machine) is gone. Needs Apple Developer Program ($99/yr) and a minimal host app.
3. **Android: viable through Firefox for Android** (open add-on ecosystem, free AMO publishing, extension code closest to our desktop code). Experimental Chromium forks (Edge Canary, Vivaldi Snapshot, Quetta) can load Chrome extensions, but none is a stable daily-driver target.
4. **The engine is portable.** `core.js` (policy, rubric, sanitizer, topics, token helpers, cosmetic model), `vault.js` (WebCrypto), and `typesafe.js` (fetch) are platform-independent. The work is in **manifests, background lifecycle (event page vs service worker), mobile DOM adapters, and touch UI** — not in the model or policy.
5. **Recommended order:** (0) small cross-browser refactor while staying Chrome-first → (1) Firefox desktop + Android → (2) Safari iOS via App Store Connect → (3) optional store listing for Chromium forks.

---

## 1. Platform matrix (September 2026)

| Browser / platform | Engine | Extensions | Store | Notes |
|---|---|---|---|---|
| **Chrome for Android** | Blink | **No** | — | No extension support in stable; no user-facing flags found; Google's stance unchanged for years. Not a target. |
| Edge Canary (Android) | Blink | Experimental | Edge Add-ons / install-by-id | Kiwi's extension framework was merged into Edge Canary after Kiwi's shutdown; dev-options unlock, "install by id" flow. |
| Vivaldi Snapshot (Android) | Blink | Experimental (Aug 2026) | Chrome Web Store | Snapshot channel only; announced Aug 26, 2026; "not every extension will be compatible". |
| Quetta (Android) | Chromium fork | Yes (new) | Chrome Web Store + Edge Add-ons | Filled the Kiwi gap in 2025; young project, small team. |
| **Firefox for Android** | Gecko | **Yes (open ecosystem)** | AMO (free) | 1,000+ Android-compatible add-ons (uBO, Dark Reader, SponsorBlock…); since FF 118/120; requires event-page-shaped background. |
| Kiwi Browser (Android) | Blink | Dead | — | Archived Jan 2025; last APK unmaintained; do not target. |
| **Safari on iOS / iPadOS** | WebKit | **Yes (Safari Web Extensions)** | App Store (inside host app) | Supported since iOS 15; MV3 supported; only Safari can run WebExtensions — all iOS browsers (Chrome, Firefox, Edge…) are WebKit shells without extension APIs. |
| Chrome / Firefox on iOS | WebKit | No | — | Cannot load extensions. |
| Safari on macOS | WebKit | Yes | App Store / signed dev build | Same codebase can ship macOS + iOS from one package. |
| Chrome / Edge / Brave desktop | Blink | Yes | CWS / Edge | Current 3.3.0 release target, unchanged. |

Sources: Chrome for Developers I/O 2026 recap (extensions focus is desktop), Wikipedia Google Chrome (extensions mobile: not supported), extensionbooster/makeuseof/vivaldi/AdGuard posts (Android forks), Android Authority (Kiwi shutdown → Edge), MDN WebExtensions compat, Apple developer docs.

---

## 2. What in FeedGate ports as-is vs what needs per-platform work

### Portable without change (shared sources of truth)
- `src/core.js` — policy engine, rubric ids, sanitizer, topics/grouping/token helpers, error codes. Already proven platform-independent by the Node test harness.
- `src/vault.js` — PBKDF2-SHA256 600k + AES-256-GCM via WebCrypto; available in all target runtimes.
- `src/typesafe.js` — plain `fetch` with timeout/abort; needs only the host permission.
- `src/demo.js`, evaluation corpus, docs, tests for the above.

### Needs a platform layer
1. **Manifest.** Practically the same MV3 file with small additions:
   - declare **both** background shapes for cross-browser MV3:
     `"background": { "service_worker": "background.js", "scripts": ["background.js"], "type": "module" }`
     Chrome (≥121) uses the service worker and ignores `scripts`; Firefox uses `scripts` (no `service_worker` support — Gecko bug 1573659); Safari prefers `scripts` unless `preferred_environment: "service_worker"` is set. This is the documented cross-browser pattern.
   - Firefox needs `browser_specific_settings.gecko` and `gecko_android.strict_min_version` (e.g. `"113.0"`), and should pass `web-ext lint` for Android compatibility.
   - The stable-identity `key` from 3.2.0 is Chrome-specific; Safari gets its bundle identity from signing, Firefox from AMO signing. Item identity per store differs — no impact on the vault/key logic, but "in-place update keeps the vault" only holds inside the same store/runtime.
2. **`chrome.*` surface audit** (what we actually use):
   - `storage.local` / `storage.session` (+ `setAccessLevel`) — available in Firefox and Safari (session storage supported; Safari 16.4+). Keep TRUSTED_CONTEXTS call behind a feature check.
   - `scripting.registerContentScripts` / `executeScript` (+ re-register on update) — supported in Firefox (MV3) and Safari. Note: content scripts registered at runtime are cleared on extension updates in all engines; our `runtime.onInstalled` re-sync already covers this.
   - `permissions.request/contains/getAll/onRemoved` — supported in both; on Firefox, `permissions.request` must be called from a user gesture (the setup form already is).
   - `tabs.query/get/sendMessage/reload/create` — supported; Safari shows a different toolbar model (no badge popup parity, but content scripts and extension pages work).
   - `action` badge — works in Firefox; Safari renders a toolbar badge but with limited styling.
   - `options_ui` — **not supported on Safari**; replacement: a regular extension page opened from the toolbar/popup, which we largely already have (`options.html open_in_tab`). Small work.
   - `runtime.getURL` + `fetch` of packaged `build.json` — fine (module/fetch inside the extension origin).
   - Namespace: **Chrome ≥148 supports the standardized `browser.*` namespace**; Firefox/Safari expose `browser.*` natively. A one-line alias (`globalThis.chrome ??= browser`) or the reverse makes the code shared. Low risk.
3. **Background lifecycle.** Firefox Android (and Safari) may kill/idle the background aggressively; our worker already restores all runtime state from `storage.session`/`storage.local` on start (`ready` IIFE), so it is close to event-page-safe. Remaining items: no long-lived timers in the worker (we don't), message handlers must be registered synchronously at top level (they already are).
4. **Mobile DOM adapters.** The biggest real work item. Our `adapters.js` selectors target desktop DOM.
   - **Wykop:** mobile-first SSR — current selectors were reviewed against the public served HTML, so this is the closest to working as-is.
   - **X, Reddit:** mobile web variants differ (`m.`/responsive markup, different `data-testid` coverage); needs capture + selector sets per platform variant, same `SPECS` pattern.
   - **LinkedIn / Facebook / Instagram:** mobile web DOM differs more (and Facebook/Instagram mobile web are minimal shells); expect partial coverage — the adapter philosophy (fail open, skip what cannot be extracted) already accepts this.
   - Approach: keep one adapter module, add a `viewport` variant dimension (`desktop|mobile`) chosen from `matchMedia`/hostname; reuse the existing test fixture style to keep tests honest.
5. **UI/HUD on touch.** The status pill and cards inject via shadow DOM — this works in mobile Safari/Firefox content scripts. Work: touch target sizes, bottom-sheet style panel, avoid covering native bottom bars, and verify the `Alt+Shift+F` shortcut has no mobile equivalent (add a long-press or popup control instead).
6. **Picker flows.** Hover doesn't exist on touch; the transactional picker needs a tap-based variant (tap → candidate highlight → confirm sheet). Mechanically the state machine is reusable; input layer changes.
7. **Key handling.** Vault + passphrase flow is self-contained (WebCrypto), so nothing blocks. Don't plan on Keychain/Keystore: Safari web extensions have no direct Keychain API without native host-app messaging — that would be scope creep. Keep the vault, note the trade-off in docs.

---

## 3. Distribution and costs

### iPhone (Safari)
- Requires an **Apple Developer Program membership** ($99/yr).
- The extension must ship **inside a host app** (a minimal container app is acceptable; it can be nearly empty).
- Packaging options:
  1. **Web-based packager in App Store Connect** (new, since Sept 2025): upload the extension folder from any browser, Apple's Xcode Cloud assembles the app; compute is deducted from the 25 h/month Xcode Cloud allowance included in the membership. Then TestFlight for testing, App Store for distribution.
  2. Command-line `xcrun safari-web-extension-packager` (formerly `-converter`) on a Mac with Xcode — not available on this Windows machine.
- Known friction: at least one public report of a bundle-id prefix error through the web path (`Embedded binary's bundle identifier is not prefixed with the parent app's bundle identifier`) — resolvable, but budget time.
- App review: describe the app truthfully (feed noise control); avoid the words "ad blocker" as a feature claim; declare that post text is sent to TypeSafe for scoring (privacy nutrition labels), matching our PRIVACY.md.

### Android (Firefox)
- Publish to **addons.mozilla.org** — free. Mark Android compatibility; run `web-ext lint`; the AMO listing needs the same privacy disclosure (data sent to TypeSafe).
- Testing: `web-ext run --target=firefox-android` over USB debugging, or install the signed XPI on the owner's phone.
- For the Chromium forks (Edge Canary / Vivaldi Snapshot / Quetta): they install **Chrome Web Store** extensions, which would mean listing FeedGate on CWS — free account, but a store review of its own. Given the forks' experimental status, treat as optional phase.

### Desktop
- Unchanged (unpacked / in-place updates as today).

---

## 4. Risks and open questions

| Risk | Impact | Mitigation |
|---|---|---|
| Mobile DOM volatility (X/Reddit/LinkedIn/FB/IG mobile) | Filters silently do nothing or mis-extract | Fail-open adapter philosophy; per-platform fixtures; mobile-specific capture tests |
| Safari background/lifecycle quirks (service worker termination, memory caps) | Delayed decisions, lost in-flight state | Event-page-safe background (we are close); verify storage.session availability and TTL behavior on iOS |
| `options_ui` unsupported on Safari | Settings must open differently | Ship settings as an extension page opened from the toolbar; minor UI work already covered by our page architecture |
| Touch input for pickers | Feature unusable as-is on mobile | Tap-to-select variant of the same state machine; HUD action "Pick element" becomes a bottom sheet |
| App Store review | Rejection loops | No ad-blocking claims; clear privacy labels; minimal host app; TestFlight first |
| Web packager friction (bundle id) | Delays | Allow one iteration cycle; keep Xcode/macOS CI as fallback (e.g. GitHub Actions macOS runner) |
| AMO policy for third-party API | Review questions about sending post text to TypeSafe | Point to PRIVACY.md; provide the same consent gate as desktop; option to run local-only mode (author/cosmetic rules) with no key |
| Testing coverage | Desktop-only CI cannot run mobile engines | Owner-device pilot checklist generated from existing manual-pilot list; Playwright Firefox desktop added as an extra gate where possible |

Open questions to resolve before implementation (each is a small spike):
1. Does Safari iOS support every API we rely on — specifically `scripting.registerContentScripts` with `persistAcrossSessions`, `storage.session.setAccessLevel`, and `tabs.reload`? (MDN says scripting is MV2+MV3 on Safari; verify each in a hello-world extension.)
2. Does the App Store Connect packager accept our manifest unchanged (dual background declaration, `key` removed/ignored, `optional_host_permissions` → Safari "website access" model)?
3. What is the minimum host app that passes review with a content-filtering extension?
4. How do our adapters fare against mobile-web captures in practice (measure extraction rate per site before promising support)?
5. Firefox Android: confirm `scripting.registerContentScripts` + `storage.session` + `options_ui` behavior on current FF Android, via `web-ext lint` + device run.

---

## 5. Phased plan and effort estimate

| Phase | Scope | Deliverable | Rough effort |
|---|---|---|---|
| **0. Portability refactor (desktop stays green)** | `browser.*` alias; dual background declaration; feature-detect `options_ui`/badge paths; keep 164 tests + 66 browser scenarios green | Chrome release unchanged; code ready for other engines | 2–4 dev days |
| **1. Firefox desktop + Android** | Manifest additions (`gecko`, `gecko_android`), event-page validation, mobile adapter variants for X/Reddit/Wykop first, touch HUD pass | Signed XPI on AMO (unlisted first), installed on owner's Android | 1–2 weeks |
| **2. Safari iOS** | Apple account, minimal host app, upload via App Store Connect packager, TestFlight, mobile adapter fixes from real-device reports | FeedGate in TestFlight on owner's iPhone; then App Store | 2–4 weeks incl. review latency |
| **3. Optional: CWS / Edge listing** | Store listing + review so Edge Canary / Vivaldi / Quetta users can install | Listing | 2–5 days |
| **4. Not recommended** | Native app wrapper / own WebView browser | — | (rejected: cannot inject into other browsers; loses the product's value) |

**What this does NOT change:** the semantic policy, rubric (`feed-v2.2.0`), thresholds, ad-evidence rules, privacy boundaries. Mobile is an adapters + manifest + UI job, exactly as the desktop versions were; the model path stays one HTTPS request through the same consent/budget/thrift rules.

---

## 6. Recommendation

1. **Chrome Android: drop as a target** (platform limitation, not our limitation). The realistic Android story is *Firefox for Android* (and later, optionally, Chromium forks via CWS).
2. **iPhone: plan for Safari Web Extensions**; the App Store Connect web packager removes the Mac requirement — the remaining cost is the $99/yr membership and review time.
3. Start with **Phase 0** (safe refactor), then **Firefox Android** as the first mobile ship: cheapest, open, and the owner can sideload for real testing immediately.
4. Treat mobile DOM maintenance as an ongoing cost, not a one-off. The adapter fixture pattern already anticipates this.
5. Keep the mobile builds as **separate release channels** with their own versioning line; do not couple them to the desktop release cadence.

---

## 7. Sources (fetched 2026-09-19)

- Chrome for Developers — What's new in web extensions: I/O 2026 recap (browser.* namespace, CWS tooling): developer.chrome.com/blog/extensions-io-2026
- Wikipedia — Google Chrome (extensions: desktop only, not mobile): en.wikipedia.org/wiki/Google_Chrome
- Extension Booster — Chrome Extensions on Android in 2026: extensionbooster.net
- MakeUseOf — 5 Android browsers with extensions (Kiwi shutdown, Quetta, Edge Canary, Vivaldi): makeuseof.com
- Android Authority — Kiwi Browser shutting down; code merged into Edge Canary: androidauthority.com
- AdGuard Blog — Vivaldi Android Snapshot extension support (Aug 2026): adguard.com/en/blog/vivaldi-adguard-extension-android.html
- Apple Developer — Packaging a web extension for Safari (`safari-web-extension-packager`): developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari
- Apple Developer — Packaging and distributing Safari Web Extensions with App Store Connect (no Mac/Xcode): developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect
- MDN — manifest.json/background (service_worker vs scripts across Chrome/Firefox/Safari): developer.mozilla.org
- MDN — scripting API (`registerContentScripts`, MV2+MV3 on Firefox/Safari): developer.mozilla.org
- MDN — storage.session (setAccessLevel, 10 MB, cleared on browser stop): developer.mozilla.org
- Mozilla Extension Workshop — Developing extensions for Firefox for Android (`gecko_android`, web-ext lint, event pages): github.com/mozilla/extension-workshop
- Mozilla — Add-ons for Firefox Android deck (event pages, Android lifecycle): assets.mozilla.net/pdf/2023-10-12-addons-for-firefox-android.pdf
- Stack Overflow — Chrome Extension to Safari iOS web extension (web packager error report): stackoverflow.com/questions/79782186

---

## Follow-up (2026-09-19): Chrome-only options on phones

Owner decision: stay Chrome-only, no Firefox/Safari. What that leaves:

### Android
- **Chrome for Android: no extension support** in stable (confirmed mid-2026; Google's own help notes only "very limited/experimental" progress, with no usable flags found). Not a target.
- **Vivaldi for Android (Chromium): full Chrome Web Store extension support, rolling out September 2026** — the closest thing to "Chrome with extensions" on Android. FeedGate (MV3, CWS-compatible manifest) is a realistic candidate once it is published to the Chrome Web Store or loaded through Vivaldi's extension UI. Strongest Android path; needs a device spike, not a port.
- Other Chromium forks with extension support (test targets only): Edge Canary (dev options, install by ID), Quetta, Helium.
- **Bookmarklet route in Chrome for Android**: bookmarklets can be executed by typing the bookmark's name in the omnibox and tapping the suggestion (Google community guidance; fragile across builds). A "FeedGate Lite" bookmarklet could scan visible posts, call TypeSafe and hide matches locally. Open risks: page CSP may block bookmarklets on some sites; the API call from the page origin requires CORS on api.typesafe.ai (unverified — needs a spike).

### iPhone
- Chrome for iOS runs WebKit and **cannot run extensions**; only Safari can (Safari Web Extensions). Chrome-only means **no automatic in-feed filtering on iPhone**.
- What still works in Chrome iOS: a **bookmarklet executed from the bookmarks panel** (same CSP/CORS caveats), and **Share → Shortcuts/PWA analyzer** flows (manual: share a post link, the tool returns Jev verdicts — no changes to the feed itself).

### Cross-platform companion (no injection)
- A small **FeedGate analyzer PWA** installable from Chrome mobile: paste a post or share a URL, see the same scores/rules; on Android it can register as a Web Share Target; on iOS the share flow goes through Shortcuts. Useful as a lookup tool, but it never modifies the feed.

### Recommendation
1. iPhone: accept no auto-filter in Chrome; offer the analyzer/bookmarklet path only if the owner wants it.
2. Android: spike FeedGate on **Vivaldi Android** (unpacked if possible, or publish to CWS for a real install). If it runs, Android coverage arrives with ~zero porting.
3. Keep the earlier cross-browser plan (Phase 0 refactor, `browser.*` alias) as a low-cost option — it also makes a future CWS listing and Chromium-fork support easier.

### Open questions to verify on hardware
- Vivaldi Android: unpacked extension loading? CWS-only? MV3 service-worker lifetime and storage.session behavior.
- Chrome Android omnibox bookmarklet still functional in current builds; CSP behavior on X/Reddit/Wykop mobile.
- api.typesafe.ai CORS for page-origin (bookmarklet/PWA) requests.
- Chrome iOS bookmarklet execution from the bookmarks panel.

---

*This document is analysis only. No FeedGate code was changed.*
