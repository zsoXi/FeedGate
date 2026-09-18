# FeedGate 2.0: start here

**This release has no terminal, no local bridge and no pairing code.** Do not run any file from version 0.1. You need Chrome and your own direct TypeSafe key.

## 1. Load the extension

Extract the whole ZIP into a permanent folder. In Chrome, go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the **extension** subfolder containing `manifest.json`.

Do not select the whole project directory or the ZIP. Do not delete the folder after installation. The code is already built; Node, Python, npm and Vercel are not required.

## 2. Connect TypeSafe

Open FeedGate from the extension icon and go to **Settings**. In the **Connect once and start browsing** section:

1. Paste your key into **TypeSafe API key**. Do not paste a Vercel key or an old pairing code.
2. Tick the consent to send post text to TypeSafe. Feed material may contain sensitive data.
3. Leave **X / Twitter** selected and click **Connect & start**. Accept the Chrome permission.

The button tests the real API with one fictional post, which may generate a cost. Only after a successful response does it enable the selected service. This confirms the connection; it is not proof of classifier quality.

**Refresh the open X tab.** After removing an older add-on, page modifications made by the previous version may remain. Refreshing clears them.

You can close the settings. The extension runs inside Chrome, with no extra window or process to start.

## The key after a Chrome restart

By default the key is stored only in the Chrome session. After closing the whole browser or reloading the extension, you must enter it again.

To avoid re-entering the key, tick **Save an encrypted copy on this device** and set a passphrase of at least 12 characters. After a restart you only enter that passphrase in **API & privacy → Unlock your saved key**. There is no terminal and no new pairing code. The passphrase is not stored and cannot be recovered.

You cannot simultaneously promise secure passphrase encryption and automatic unlocking without that passphrase. This version does not store a second secret next to the encrypted key, which would make the encryption illusory.

## New filtering

The starting **Balanced** mode does not hide a post merely because it promotes a project. It separately assesses useful information, concrete contribution, spam, empty engagement bait and signs of a suspicious offer. High information value does not confirm the truth of the claims.

On a deliberately opened profile, ordinary semantic spam is by default only dimmed. Platform-labelled ads, your own explicit rule and strong signs of fraudulent solicitation do not get that exception.

**Show** restores a post temporarily. **Why? → Keep this post** stores an exception for that particular visible post. **Allow author** adds the whole profile to the local exception list. There is no automatic account reputation or bot blacklist. **Alt + Shift + F** reveals or refilters the current page.

## When something does not work

There is a small FeedGate bar with status and counters at the bottom left of the page. Clicking it opens the settings.

Go to **Diagnostics → Export diagnostics**. This produces a `feedgate-2.0-diagnostics-....json` file that you can pass on for review. It contains no API key, vault, post text, author names, full page URLs or the text of your own rule.

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

110 Node tests and 31 Chromium DOM/UI scenarios passed. Jev responses and extension interfaces were replaced by controlled test implementations. Your key was not used and no test was run on the current, signed-in X. The build environment blocks extension installation; its limits were not bypassed.

This is a package ready for you to test, not a certificate of flawlessness. The model can still misjudge a specific post. **Open live test feed** contains fictional examples, but once key and consent are enabled it uses the real API, not fake percentages.

Code license: GPL-3.0-or-later. The extension is a feed appearance filter, not a full replacement for uBlock Origin or a tool for removing every ad on the web.
