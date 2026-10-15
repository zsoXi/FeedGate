# FeedGate 3.3.0: start here

**This release has no terminal, no local bridge and no pairing code.** Do not run any file from version 0.1. You need Chrome and your own direct TypeSafe key.

## 1. Load the extension

Extract the whole ZIP into a permanent folder. In Chrome, go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the **extension** subfolder containing `manifest.json`.

Do not select the whole project directory or the ZIP. Do not delete the folder after installation. The code is already built; Node, Python, npm and Vercel are not required.

## 2. Connect TypeSafe

Open FeedGate from the extension icon and go to **Settings**. In the **Connect once and start browsing** section:

1. Paste your key into **TypeSafe API key**. Do not paste a Vercel key or an old pairing code.
2. Tick the consent to send post text to TypeSafe. Feed material may contain sensitive data.
3. Leave **All six supported feeds** selected (or pick a single platform) and click **Connect & start**. Chrome shows one permission prompt for the origins you keep selected.

The button tests the real API with one fictional post, which may generate a cost. Only after a successful response does it enable the selected services. Declining a Chrome prompt is respected: those sites simply stay off, and nothing is silently retried. This confirms the connection; it is not proof of classifier quality.

**Refresh the open X tab.** After removing an older add-on, page modifications made by the previous version may remain. Refreshing clears them.

You can close the settings. The extension runs inside Chrome, with no extra window or process to start.

## The key after a Chrome restart

By default the key is stored only in the Chrome session. After closing the whole browser or reloading the extension, you must enter it again.

To avoid re-entering the key, tick **Save an encrypted copy on this device** and set a passphrase of at least 12 characters. After a restart you only enter that passphrase in **API & privacy → Unlock your saved key**. There is no terminal and no new pairing code. The passphrase is not stored and cannot be recovered.

You cannot simultaneously promise secure passphrase encryption and automatic unlocking without that passphrase. This version does not store a second secret next to the encrypted key, which would make the encryption illusory.

## New filtering

The starting **Balanced** mode does not hide a post merely because it promotes a project or a release. It separately assesses unwanted advertising, feed spam, manipulative engagement bait, low-signal filler, useful information, original contribution and signs of a suspicious offer. High information value does not confirm the truth of the claims.

The unwanted-advertising category only acts together with high spam signals and low usefulness. A clearly useful or original post stays visible even when promotional signals are high; only risk, your own exclusion rule or overwhelmingly strong spam evidence override that protection.

Local hiding of a platform-advertised post now requires verified evidence: a rendered or platform-metadata label that belongs to that specific outer post. Words like "sponsored" or "advertisement" inside the post text, the author name, a link, an image description or an accessibility label never trigger it on their own, and a label attached to a quoted or neighbouring card cannot mark the outer post.

On a deliberately opened profile, ordinary semantic spam is by default only dimmed. Platform-labelled ads, your own explicit rule and strong signs of fraudulent solicitation do not get that exception.

**Show** restores a post temporarily. **Why? → Keep this post** stores an exception for that particular visible post. **Allow author** adds the whole profile to the local exception list; **Mute author** hides that author's posts on this platform deterministically (local list, no model request, revertible in Settings → Muted authors). The expanded status panel offers the same two actions for any post: **Mute author…** / **Allow author…**, with a preview and Undo. There is no automatic account reputation or bot blacklist. **Alt + Shift + F** reveals or refilters the current page.

The status panel has three modes: a small pill, an expanded panel and fully hidden. **Hiding the panel never pauses filtering**, and the panel never comes back on its own. Reopen it from the popup or settings. If a page ever looks wrong, the popup offers **Restore this site** (the pause is saved before any cleanup), **Disable cosmetic filters** (keeps your rules and key) and **Reload this tab with filtering paused**.

Cosmetic hiding is now transactional: **Pick element** shows a preview with the host, the selector and how many elements it would hide before anything is saved. Too-broad targets (page root, navigation, a whole timeline) are refused, and you can Undo a committed rule for 15 seconds or later from **Settings → My cosmetic filters**, where every rule can be enabled, disabled, edited or deleted.

Upgrading from 2.x? Your key, allowlist, saved post choices and cosmetic rules are kept; raw legacy CSS text becomes a quarantined rule that can only activate after a real matching target is seen. See [docs/MIGRATION.md](docs/MIGRATION.md).

## When something does not work

There is a small FeedGate pill with status and counters at the bottom left of the page. Clicking it expands the panel (with minimize and close), and the popup can reopen it when it is hidden.

Go to **Diagnostics → Export diagnostics**. This produces a `feedgate-3.3.0-diagnostics-....json` file that you can pass on for review. It contains no API key, vault, post text, author names, full page URLs, raw cosmetic selectors or the text of your own rule.

| Status | Meaning |
| --- | --- |
| Key locked | Enter the key or unlock the vault in API & privacy. |
| Local ads only | Cloud analysis consent is missing. Local ads can still be filtered. |
| No posts detected | Check that X is enabled and permissions are granted, then refresh the page. The X layout may need an adapter fix. |
| Provider errors | Open diagnostics. An error by itself never causes a post to be hidden. |
| Rate limit | Wait out the indicated pause. After it ends, use Rescan; there is no unlimited retry loop. |
| Everything visible | Check Observe, pause, key and consent. A visible post does not always mean Jev judged it valuable. |

Changing thresholds uses existing scores and recalculates decisions. **You do not need to clear the cache for every slider change.** Clear result cache forces new API calls and may increase cost.

## What is verified

164 Node tests, 66 Chromium DOM/UI scenarios, an 8-check unpacked-extension smoke test and 9 release integrity checks passed. Jev responses and browser interfaces were replaced by controlled test implementations; the smoke test loaded the real extension folder in a local Chromium profile. Your key was not used, no test was run on the current, signed-in X and no live Wykop page was accessed by the suites. Managed installation remains blocked in the build environment; its limits were not bypassed.

This is a package ready for you to test, not a certificate of flawlessness. The model can still misjudge a specific post. **Open live test feed** contains fictional examples, but once key and consent are enabled it uses the real API, not fake percentages.

Code license: GPL-3.0-or-later. The extension is a feed appearance filter, not a full replacement for uBlock Origin or a tool for removing every ad on the web.
