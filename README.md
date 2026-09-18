# FeedGate 2.0

A Chrome extension that uses TypeSafe Jev to reduce feed noise while keeping useful projects and explanations visible. Filtering is reversible, the rules are explicit, and the API key is entered inside the extension.

**Personal-use preview. No terminal, bridge, pairing code or external server is required.**

![FeedGate 2.0 setup interface, captured using a browser test fixture](evidence/options-overview.png)

## Install the ready-made extension

Extract the release into a permanent folder. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `extension` directory containing `manifest.json`.

In FeedGate, enter a direct TypeSafe API key, grant cloud-analysis consent, select X, and click **Connect & start**. Chrome asks for access to that platform. The extension tests one fictional post with the actual API before enabling the selected feed. Refresh existing X tabs, especially after removing an older FeedGate build.

The ready-made extension does not need Node, Python, npm, a local service, or an installer executable. Chrome 120 or later is declared in the manifest. Managed browsers may prohibit unpacked extensions; do not work around administrator policy.

For a short step-by-step walkthrough, open [START_HERE.html](START_HERE.html) or [START_HERE.md](START_HERE.md).

## What changed

The first experiment conflated promotional intent with unwanted content. Version 2 treats promotion as a feature, not an independent hiding rule. Useful projects, experiments, implementation notes and concrete explanations can remain visible even when promotional intent is high. High information value is not treated as proof of truth.

Balanced, Aggressive and Observe presets expose the same deterministic rules. Opened profiles normally receive gentler semantic filtering. Visible quotes are separated from the main author's words, and truncated posts are treated more cautiously. No author reputation is inferred, no account is automatically blacklisted, and no attempt is made to prove that someone is a bot.

**Show** temporarily restores a post. **Keep this post** stores a local hash-based exception for that particular visible post. **Allow author** is a deliberate, platform-specific exception. **Alt + Shift + F** reveals or refilters the current page. Explicit CSS rules and a small element picker remain available for local cosmetic filtering.

The on-page badge and Diagnostics screen separate detection, pending work, returned judgments and filtering. **Export diagnostics** produces a structured JSON file without keys, vault ciphertext, post text, authors, custom rule text, stored post hashes or full browsing URLs.

## Architecture

```text
Enabled feed
  -> isolated content script
  -> visible text and quote extraction
  -> extension service worker
       -> explicit local rule / user exception
       -> score cache and request queue
       -> direct TypeSafe HTTPS request
       -> strict Noul response validation
       -> deterministic policy
  -> reversible DOM update
```

The fixed endpoint is `https://api.typesafe.ai/v1/systemone`; the default model is `jev-latest`. There are eight independent Noul questions and an optional ninth when a custom question is present. Question probabilities are not bot identity, legal conclusions, or verified truth. See [the policy specification](docs/POLICY.md).

X and Reddit are the primary adapters. LinkedIn, Facebook and Instagram are experimental adapters, disabled until the user grants their optional permissions. Adapter tests use representative HTML fixtures, not current signed-in feeds.

## Key handling and data

The default key lives in trusted `chrome.storage.session` and is not returned to content scripts. Browser restart, disabling or reloading the extension can clear that session. The optional persistent vault uses AES-256-GCM and PBKDF2-SHA256 with 600,000 iterations, a random 16-byte salt and a random 12-byte nonce. Unlocking requires the user's passphrase after a browser restart. No passphrase is stored.

A password field or an encrypted file is not protection against malware or a compromised extension. Use a dedicated, revocable provider key. Saving a session-only key replaces any previously saved vault. This build does not use `storage.sync`.

Cloud opt-in allows visible extracted post text, visible quote text, accessible media text, platform ad markers and linked domains to reach TypeSafe. No screenshots, image/video files, cookies, browser history or passwords are requested. Private-route and editor guards are best effort, not a guarantee that all sensitive material can be recognised. Read [Privacy](docs/PRIVACY.md) and [Security](docs/SECURITY.md).

## Honest test status

The packaged evidence records **110 passing Node tests** and **31 passing Chromium DOM/UI scenarios**. Unit tests execute the actual policy, HTTP client, vault and worker source; worker tests replace Chrome APIs and HTTP with controlled implementations. Browser tests execute the actual DOM and UI code with mocked Chrome messaging, page location and Jev responses.

**No real TypeSafe key was used for this release, no signed-in feed was accessed, and no installed-extension end-to-end test was completed.** The build environment blocks extension installation. No administrator policies were changed. These are implementation regression tests, not a measured improvement in live classification accuracy or an independent security audit.

The local test feed contains fictional text and does not ship mock model scores. Once key and consent are enabled, it uses actual Jev requests. [Test report](docs/TESTING.md) explains the remaining manual checks. [Optional live evaluation](evaluation/README.md) provides labelled fictional examples and an explicit opt-in developer runner.

## Develop

JavaScript modules and browser APIs are used without runtime third-party dependencies. Node 22 or later is needed only for development:

```sh
npm run check
npm test
npm run build
npm run release:check
```

Browser fixtures additionally require Python, the pinned tooling in `tests/requirements.txt` and Chromium:

```sh
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
npm run test:e2e
```

Set `CHROMIUM_PATH` to a permitted Chromium executable when necessary. Never disable managed policies to run these tests. The included GitHub Actions workflow declares Windows and Linux Node checks and Linux DOM tests. It was not run on GitHub as part of this local build.

`src/` contains executable source, `static/` contains markup and assets, and `extension/` is the ready-to-load result. Rebuilding simply copies local files. `scripts/release-check.mjs` checks source/output agreement, manifest references and the absence of a local bridge.

## Boundaries

FeedGate changes the appearance of supported feeds. It does not block network requests, trackers, video advertisements or every advertisement on the internet. It does not analyse image/video pixels, open landing pages, expand hidden text, crawl profiles or train an account reputation model. Existing content blockers can remain installed.

The UI may leave a post visible because the key is locked, consent is absent, text is insufficient, a queue or budget limit was reached, an API request failed, or no policy rule matched. Inspect Diagnostics instead of interpreting every visible post as a successful semantic judgment.

## Provenance and license

GPL-3.0-or-later. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This code continues the earlier direct-API FeedGate implementation and replaces the bridge workflow and v1 policy. uBlock Origin informed the separation of DOM watching, cosmetic rules and user controls; its code, engine, lists and branding are not bundled. This is not an official uBlock or TypeSafe product.
