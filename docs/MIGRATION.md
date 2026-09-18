# Migration notes: FeedGate 2.0 to 2.1

FeedGate 2.1 keeps the working 2.0 architecture. Settings, keys, allowlists, saved post choices and local rules are preserved where their meaning is unchanged. The filtering semantics changed, so some values are deliberately not reused.

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
