# Recovery guide

Recovery is built so that stopping effects never depends on the page answering.
The pause is written to the trusted context first; cleanup is attempted second.

## 1. The page looks wrong (or hides too much)

1. Open the FeedGate toolbar popup.
2. Click **Restore this site**.
   - The recovery pause is persisted immediately, so it survives a frozen tab.
   - FeedGate then asks open tabs of that site to reveal content and remove its effects.
   - If a tab does not answer within the timeout, the popup says the cleanup was not
     acknowledged and offers **Reload this tab with filtering paused**. Nothing is
     reloaded silently; a dialog warns about unsaved input first.
3. Other sites are not touched.

Screenshot: `evidence/popup.png` shows the recovery section.

## 2. Turn cosmetic rules off without deleting them

- Popup → **Cosmetic filters** → **Disable hiding** switches the cosmetic engine off.
  Rules, credentials, allowlists and semantic settings are kept.
- Settings → **My cosmetic filters** → **Disable all** does the same from the manager.

## 3. Manage or delete a specific rule

Settings → **My cosmetic filters** (page 05):

- Each row shows the site, the selector, and an honest status:
  `active`, `Needs review` with a short reason, `Disabled`, or `Deleted`.
- **Disable / Enable** toggles one rule.
- **Edit** lets you change the selector; it is re-validated before saving.
- **Delete** removes the live effect without requiring a hard refresh.
- **Undo deletion** restores the record as *quarantined*; it must pass the current
  safety checks before it can hide anything again.
- **Disable all** and **Delete all** (confirmed) work in bulk.

The manager is the only place raw selectors are shown. Diagnostics stay selector-free.

## 4. The status panel is hidden and you want it back

- Click the toolbar icon and use the status-mode control, or
- Settings → **Filter policy** → **Status panel on enabled pages**.

The choice is global and remembered across navigation, refresh, new tabs, and browser
restarts. Hiding the panel never pauses filtering; closing it is not the same as pausing.

Screenshots: `evidence/hud-compact.png`, `evidence/hud-expanded.png`,
`evidence/hud-hidden.png`.

## 5. A legacy rule is quarantined after the upgrade

Rules written before 3.0.0 have no validation metadata. They are imported as
**Needs review** and cannot hide anything until at least one real matching element is
observed on the site, checked against the current safety rules. This is intentional and
reversible: use **Enable** once the target exists, or **Edit** the selector.

## 6. A frozen or busy tab keeps its hidden state

1. Popup → **Restore this site** (pause is saved even if the tab never answers).
2. If the cleanup stays unacknowledged, use **Reload this tab with filtering paused**.
3. After the reload the page comes back with filtering paused, and FeedGate applies
   nothing until you press **Resume this site**.

If you need a hard stop for everything: Settings → overview → **Pause filtering**
(or popup → Pause). Pausing the engine leaves the HUD mode untouched.

## 7. Start over safely

- Export settings first: Settings → **Move settings** → **Export** (format v4).
- A clean install in a *different folder* is a different extension identity; the vault
  and session key may not be available, so keep the old copy until the new one works.
- Never delete the old folder as a "fix" while troubleshooting.
