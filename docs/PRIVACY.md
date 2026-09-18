# Privacy

There is no FeedGate backend, telemetry collector or analytics SDK. Optional site permissions are requested by an explicit user action. Incognito operation is not allowed by this manifest.

## What can leave the device

After cloud consent, visible extracted post text, visible quoted text, accessible media text, platform sponsorship markers, platform name and linked domain names are sent to TypeSafe. A non-empty custom question is also sent, even if its filtering action is Off; clear the question text to omit it. Authentication sends the user's API key to TypeSafe in the authorization header.

Email-like strings, @mentions, some secret-shaped tokens and full link paths in the extracted text are redacted or reduced on a best-effort basis. This does not anonymise every person, phone number, location or sensitive fact. No screenshots, image/video files, cookies or form values are intentionally collected. No landing pages or account histories are fetched.

Messages, chat, account settings and known editor/dialog regions are excluded. This is not a complete detector of sensitive content. A supported feed can contain private or confidential material. Disable cloud analysis when that disclosure is inappropriate. TypeSafe's processing, retention and billing terms are separate from this extension.

## What stays local

Preferences, optional encrypted vault, request budget and explicit post-hash exceptions persist locally. Session storage contains the live unlocked key, feature-score cache, recent decision metadata and counters. Decision logs include a local author label for review, but not raw post text. Author exceptions are explicit and do not become model reputation scores.

The cache stores hashes and model feature values, not raw post bodies. Hashes are not universal anonymisation: a person who knows possible inputs may guess them. Persistent per-post choices are not exported in diagnostics. Session data is cleared by the browser lifecycle described in the installation guide.

## Diagnostic export

The diagnostic file contains aggregate settings and stage counters, score/action records and reduced connection state. It omits keys, vault contents, raw post text, names of authors, saved post hashes, full browsing URLs, custom-rule text and CSS selectors. It does reveal which supported platforms were enabled, timing information and numerical classifications. Review it before sharing, especially in a public issue.

The settings export is a different file and can include author exceptions and custom rules. It does not include credentials, vaults or model results. Importing settings never silently grants site access or cloud consent.
