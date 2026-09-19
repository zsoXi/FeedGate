# Migration notes: FeedGate 2.0 to 3.1.1

FeedGate 3.1 keeps the working 2.0 architecture. Settings, keys, allowlists, saved post choices and cosmetic rules are preserved where their meaning is unchanged. The filtering semantics are unchanged from 2.1.1; the 3.0 work is local control, safety and coverage (HUD modes, recovery, cosmetic management, Wykop), and 3.1 adds the local author mute list and a clearer exception-rule panel.

## Upgrading from 3.1.0 to 3.1.1

* **No schema or policy change.** Settings schema 5, runtime state 5, diagnostics schema 6, rubric `feed-v2.1.0`, policy `policy-3.1.0`, detector `ad-3.0.0` and extraction `extract-3.0.0` are all unchanged. Nothing migrates; existing settings, lists, rules and session state restore as-is.
* **New status-panel actions.** The expanded panel gains **Mute author…** and **Allow author…**: click a post on the page, review the preview (author name, no model request), and save. The toast offers **Undo**, which sends the new content-callable `FG_FORGET_AUTHOR` message to remove the author from the mute and allow lists.
* **Reload open tabs.** A content script from 3.1.0 detects the new release and shows "Extension updated: reload this page". Press F5 on affected tabs.

## Upgrading from 3.0.1 to 3.1.0

* **Settings schema moves to version 5.** A 3.0.1 settings object (version 4) is carried over as-is — selected sites, consent, cosmetic rules and their revisions, recovery latches, HUD mode, presets, thresholds and lists — and gains one new empty field, `blockedAuthors`. Nothing to re-enter.
* **Runtime state is unchanged (version 5).** A 3.0.1 session still restores: cache, decision log, cosmetic event log and counters survive the upgrade. No cache or budget reset.
* **New local rule: `author_muted`.** Authors you mute are hidden deterministically before any model estimate, with source `author`. Mute and allow lists are mutually exclusive; the allow list wins if an import or stale form ever contains both. Muted posts cost no provider requests.
* **Exception rule panel.** The existing custom instruction is the same field with a clearer panel, a character counter and a visible status. It is a model hint, not a guaranteed filter, and it is sent with every cloud request as an extra question even when the `Your exclusion rule` category is Off — that costs tokens.
* **Diagnostics schema 6.** Exports now include `settings.mutedAuthorCount` (a count; author names are never exported) and decision entries may carry the `author_muted` rule with source `author`. Schema-5 exports remain readable as files.
* **Settings exports are version 5.** Imports accept v5, v4, v3 and v2 (through the same safe migration) and reject v1. Unvalidated or unsafe cosmetic rules in an import become quarantined, not active.
* **No model change.** Rubric `feed-v2.1.0`, thresholds, detector `ad-3.0.0` and extraction `extract-3.0.0` are untouched.
* **Reload open tabs.** A content script from a previous release shows "Extension updated: reload this page" instead of filtering with a stale schema. Press F5 on affected tabs.

## Upgrading from 2.1.0 to 2.1.1

The 2.1.1 repair changes the local-ad evidence model, the policy reason reporting and the diagnostics/runtime schema. Settings keep their schema version, so preferences do not need migration.

* **Session state is not reused.** The runtime state now declares version 4. A 2.1.0 session (version 3) is ignored automatically: the cached estimates, decision log and counters start fresh after the extension reloads. The session API key and the optional encrypted vault are unaffected.
* **Local ad decisions now require verified evidence.** Old cached results without evidence cannot hide anything: a legacy boolean `sponsored` flag is treated as `ambiguous` and continues through the normal semantic path.
* **Cached raw estimates are re-evaluated.** The cache identity includes the new detector (`ad-2.1.1`) and extraction (`extract-2.1.1`) versions, so 2.1.0 cache entries are not served. Cached scores that are still valid under the same cache identity are re-decided with `policy-2.1.1`, never replayed as a stored final action.
* **Protection thresholds.** Useful/original protection eligibility is now 0.65/0.70 instead of 0.70/0.75. Some marginally useful posts that were previously collapsed (for example during a feed-spam conflict) are now dimmed or kept. The sufficiency guard (0.65) is unchanged.
* **Reasons are truthful.** Posts kept only because no category threshold was met now report `below_noise_thresholds` instead of `promotion_signal_alone`.
* **Diagnostics.** Exports are schema version 4 and include a `build` fingerprint plus per-decision `adEvidence` and `protectionEligible` fields. Version 3 exports remain readable as files; the extension does not import them.
* **Settings exports.** Unchanged: `feedgate-settings` version 3. Imports still accept version 3 and version 2 exports (migrated through the same safe path) and reject version 1.
* **Reload open tabs.** A content script from a previous release detects the newer worker and shows "Extension updated: reload this page" instead of filtering with a stale schema. Press F5 on affected tabs.

## Upgrading from 2.1.1 to 3.0.0

* **Settings schema moves to version 4.** Everything unrelated is carried over: enabled state, consent, selected sites, mode, preset intent, model, protection profile, concurrency, daily limit, cache lifetime, custom instruction, author allowlist, category modes and thresholds.
* **The status checkbox becomes a status mode.** `showStatus: false` migrates to `hudMode: "hidden"`; `true` becomes `"compact"`. The choice is a presentation preference only and never pauses filtering.
* **Raw cosmetic CSS text becomes managed rules.** Lines that used to live in the free-form cosmetic rules box are imported as **quarantined** rules that carry the source `legacy` and the reason `legacy_unvalidated`. They cannot hide anything at startup. Once at least one real matching element is observed on the site, FeedGate re-checks them against the current safety rules and only then may activate one. Importing a 2.x settings export follows the same path.
* **Runtime state is not reused.** The session runtime state declares version 5. A 2.1.1 session (version 4) is ignored: cache, decision log, cosmetic event log and counters start fresh. The session API key and the encrypted vault are unaffected.
* **One-time upgrade notice.** After migrating from any pre-3.0 schema, the options page opens once with a short banner offering to select all six supported feeds. Existing grants are preserved; only missing origins are requested, and only when you click. Dismissing keeps your current feeds. The banner does not come back.
* **New optional host permission for Wykop.** `https://wykop.pl/*` and `https://*.wykop.pl/*` are optional and requested only from your click. Sites you never enable are never injected.
* **Diagnostics schema 5.** Exports now separate semantic, cosmetic and UI sections, include per-site effective states and cosmetic counters, and keep raw selectors out of every export. Old exports remain readable as files.
* **Settings exports are version 4.** Imports accept v4, v3 and v2 (through the same safe migration) and reject v1. Unvalidated or unsafe cosmetic rules in an import become quarantined, not active.
* **Undo semantics.** Deleting a rule keeps its record; **Undo deletion** restores it as quarantined, so it must pass the current safety checks before hiding anything again.
* **Reload open tabs.** A content script from a previous release shows "Extension updated: reload this page" instead of filtering with a stale schema. Press F5 on affected tabs.

## What is preserved

* The TypeSafe API key in session storage and the optional passphrase-encrypted vault (unchanged format; the same passphrase unlocks it).
* Enabled sites and granted optional permissions; permissions are re-verified before a site is saved.
* Author allowlist entries (max 500, platform-prefixed).
* Saved "Keep this post" choices (max 2,000, hash-based).
* Privacy consent state, daily request budget and the current UTC-day counter.
* Concurrency, daily limit, cache lifetime and model id.
* Custom instruction text and custom cosmetic CSS rules.
* Application mode (filter/observe), show-status, labelled-ads and profile mode, including a 2.0 "normal" profile mode.
* Balanced or Aggressive preset intent. A 2.0 Observe preset migrates to Observe Only. Any other preset becomes Balanced.

## What is intentionally not preserved

* **2.0 category thresholds are not mapped onto 2.1 categories.** The old "promotion" category no longer exists; its threshold is not copied to unwanted advertising because the semantics differ. A 2.0 threshold of 0.5 on promotion must not become a 0.5 unwanted-advertising threshold. Migrated settings receive balanced 2.1 defaults (`unwanted advertising` 0.85, `feed spam` 0.90, `bait` 0.88, `low-signal` off, `risk` 0.94).
* **Cached Jev decisions from 2.0.** The cache identity includes the rubric version (`feed-v2.1.0`) and a new cache namespace, and the restored session runtime state must declare version 3. 2.0 cache entries and runtime state are ignored automatically; no manual step is required.
* **Diagnostics schema.** Exports are version 3 and include rule names, protection/conflict flags and the sufficiency estimate. Old diagnostics exports remain readable as files but are not imported by the extension.
* **Settings export format.** New exports declare version 3. Importing a version 2 export is still accepted and is routed through the same safe migration (consent and site list are cleared on import as before; thresholds are not reused). Version 1 and unknown formats are rejected.

## What to do after upgrading

1. Load or replace the unpacked `extension/` folder and restart the extension.
2. Refresh open feed tabs so the new content script is registered.
3. Open Diagnostics and confirm the rubric shows `feed-v2.1.0` and the cache count starts low while it refills.
4. Optionally run **Test connection** to verify the key still works and to see the new score set.
5. Expect fewer hidden posts than 2.0, especially for promotional-but-useful content. If you want stricter filtering, choose Aggressive or adjust individual category thresholds in the policy screen.

No key re-entry is required if the session key or the encrypted vault survived; otherwise enter the key again or unlock the vault.
