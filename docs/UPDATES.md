# Updates and extension identity

This document explains how FeedGate updates work, why the extension id matters, and
how to move the encrypted vault without ever exposing the API key.

## Why the extension id matters

Everything local is bound to the extension id: the session API key, the optional
encrypted vault (seal), settings, author lists, cosmetic rules and saved post
choices. For an unpacked extension Chrome derives that id from the folder path
unless the manifest carries a `key`.

Version 3.2.0 bundles an RSA public key in the manifest, so the id is fixed:

```
oombgdfajfomncpoiljbhpnagigjjbcc
```

Only the public key ships. The private key is never packaged, never in the ZIP and
never needed at runtime; the update check contacts no server.

## Normal update (in place)

1. Back up the folder you loaded (a plain copy is enough) and, optionally, export
   settings from the rules page.
2. Replace the files inside that folder with the new release's `extension/`
   contents. Keeping the same folder path is no longer required for the identity,
   but it keeps things simple.
3. Open `chrome://extensions` and press **Reload** on FeedGate. **Never press
   Remove** — that deletes the extension's local data (vault, lists, rules) with no
   recovery short of a settings/key backup.
4. Open tabs show "Extension updated: reload this page"; press F5 so they run the
   new content script.
5. Open Settings → **06 Updates** → **Check files on disk**. "Up to date" means the
   running code matches the folder.

## The Updates panel (06 Updates)

* **Loaded build** — the release and build id reported by the running manifest.
* **Files on disk** — the release declared by the packaged `build.json` that
  `npm run build` writes next to the other extension files
  (`{release, buildId, builtAt}`).
* States: **Up to date**, **Update available** (the folder is newer than the
  running extension — replace files if needed, then Reload), or **Unknown** (no
  readable `build.json` in this page context).
* The check reads one local extension file; it makes no network request.
* **Open extensions page** opens `chrome://extensions` directly.

## Key backup (move or restore)

* **Export key backup** downloads `feedgate-key-backup.json`. It contains only the
  sealed vault: format `feedgate-key-backup`, version 1, AES-256-GCM with
  PBKDF2-SHA256 (600,000 iterations). The API key never appears in plaintext.
* **Import key backup** restores the vault on another install of the same identity.
  Unlock it with its passphrase on the API & privacy page as usual.
* A backup only helps on the identity it came from. Moving between different
  extension ids needs the API key entered once (see the transition note below).

## 3.3.0 quick note

The update flow is unchanged: same folder, Reload, never Remove. Because 3.3.0
keeps the stable identity introduced in 3.2.0, the vault, settings, author lists
and topic mutes carry over automatically — no key re-entry. Settings migrate to
schema 6, and the new optional features (topic mutes, repeat grouping, thrift
mode) start switched off until you enable them. After the reload, the 06 Updates
panel reads 3.3.0.

## One-time transition (any pre-3.2.0 build → 3.2.0)

Builds before 3.2.0 derived the id from the folder path, so the first 3.2.0 load
starts the fixed identity. The vault stored under the old id does not carry over
automatically:

* Enter the API key once more, or
* import a sealed backup taken from the same identity (available once that install
  already runs 3.2.0 or later).

From then on the vault, settings and lists survive in-place updates and folder
moves.

## Troubleshooting

* **"Update available" after copying files** — press Reload on `chrome://extensions`;
  if it persists, verify you copied into the folder that is actually loaded (the
  extensions page shows its path).
* **"Unknown"** — the page cannot read `build.json` in this context; check from the
  real extension options page.
* **Two different ids** — one install is pre-3.2.0 and one is 3.2.0+; storage is
  per id, so set the key up in the one you keep and remove the other after taking a
  settings export.
* **Never "Remove" as a repair.** See [RECOVERY.md](RECOVERY.md) for the safe
  start-over procedure.

## Boundaries

The update path is manual by design: Chrome does not auto-update unpacked
extensions, and FeedGate deliberately has no remote update service. The
`build.json` comparison detects that files changed on disk; applying them is always
your explicit Reload.
