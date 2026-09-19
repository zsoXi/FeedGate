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

The diagnostic file contains aggregate settings and stage counters, score/action records and reduced connection state. It omits keys, vault contents, raw post text, names of authors, saved post hashes, full browsing URLs, custom-rule text and CSS selectors. Cosmetic activity is reported as enum-only records with opaque local rule references (`ruleRef`), never as selectors; the raw selectors exist only in the rule manager and in your own settings export. The export does reveal which supported platforms were enabled, timing information and numerical classifications. Review it before sharing, especially in a public issue.

The settings export is a different file and can include author exceptions and your cosmetic rules, including selectors. It does not include credentials, vaults or model results. Importing settings never silently grants site access or cloud consent, and unvalidated cosmetic rules from an import are quarantined instead of applied.

## Wykop (beta)

Wykop support follows the same boundaries as every other site: visible link cards and Mikroblog entries are extracted from the top frame only, replies and comments are excluded by default, and the login and registration routes are treated as private. Wykop's served pages were reviewed unauthenticated on 2026-09-18; no account data, private messages or concealed 18+ content is read, and concealed bodies are reported as truncated rather than fetched or invented.
