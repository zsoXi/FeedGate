# Wykop support (beta)

Wykop is supported as a **beta** site. The adapter was written from the served,
unauthenticated public HTML of `wykop.pl` captured on 2026-09-18; it was not validated
against a signed-in session or against every Wykop layout. Everything below states what
that capture verified and what it did not.

## Surfaces covered

| Surface | Example route | Items extracted |
| --- | --- | --- |
| Główna | `/` | Link cards (`section.link-block#link-<id>`) |
| Wykopalisko | `/wykopalisko`, `/wykopalisko/strona/N` | Link cards |
| Tag stream | `/tag/<slug>`, `/tag/<slug>/strona/N` | Link cards |
| Mikroblog | `/mikroblog`, `/mikroblog/gorace/24`, `/mikroblog/aktywne` | Entries (`section.entry#comment-<id>`) |
| Profile / detail | `/ludzie/<nick>`, `/link/<id>/<slug>`, `/wpis/<id>/<slug>` | The same item kinds with narrow boundaries |

Pagination is plain server-rendered links (`nav.new-pagination`); there is no infinite
scroll or virtualization to handle. Only items already present in the document are read;
FeedGate never crawls, never opens pages, and never profiles users.

## Extraction contract

- Link cards: title (`article header h2.heading a`, capped), description/body
  (`div.content section.info p`), author (`a.username`), media alt text, and up to 30
  outbound link domains for context.
- Mikroblog entries: the visible wrapper text (`section.entry-content div.wrapper`),
  author, media alt text. Comments (`section.entry.reply`) are excluded by design; a
  reply id shares the `comment-` prefix and is filtered before extraction.
- Item kind travels with the record (`link` or `entry`) and is part of the cache key, so
  identical text on two kinds cannot share a cached decision.
- Titles are de-duplicated: a title is only prepended when the body does not already
  contain it.
- 18+ content behind the `Pokaz tresc` gate is treated as **concealed**: the record is
  marked truncated, the hidden text is never invented, and the item is still judged only
  on what is visible.
- Polish characters and paragraph breaks are preserved; the sanitizer does not strip
  diacritics.

## Advertising evidence on Wykop

Wykop has no verified per-item "currently promoted" marker in the served public HTML.
Two reviewed shapes exist and both are deliberately **ambiguous**, never verified:

- `li.expired-pub` — the informational note that a Znalezisko *was* promoted through
  Wykop Poleca and is **no longer** under promotion. This is the mandatory negative case:
  it must never produce a local platform-ad collapse.
- `section.pub-slot-wrapper[data-label="ad: ..."]` — page-level ad containers. They are
  empty in server HTML and filled by client-side code; they are not item evidence.

Consequently, a Wykop item can still be dimmed or collapsed by **semantic** judgments
(feed spam, bait, risk), but a local "Platform-labelled ad" action is not attempted
unless a real positive marker with known ownership is confirmed. The words
`#reklama`, "sponsorowane", user claims in the text, quoted advertisements and old
promotion notes never trigger the local rule.

## Privacy boundaries

Routes verified as login/registration (`/logowanie`, `/rejestracja`) are excluded along
with every other private pattern (messages, chats, settings, editors, notifications).
No account settings, private messages, drafts, editors, or concealed content are read.
Unknown Wykop routes fail open: extraction stops rather than guessing ownership.
Processing happens in the top frame only.

## Provenance and limits

- Capture: unauthenticated served HTML of `/`, `/wykopalisko`, `/tag/technologia`,
  `/mikroblog` (2026-09-18). Vue scoped `data-v-*` attributes are build-dependent and
  are not used in selectors.
- Fixtures in the test suite are synthetic re-creations of those verified shapes
  (`wykop_fixture`, `wykop_policy_and_privacy` in `tests/browser.py`); the screenshot
  `evidence/wykop-fixture.png` shows the rendered fixture.
- **Live validation status: INSUFFICIENT.** No signed-in Wykop session, no live provider
  classification of real Wykop posts, and no long-running observation were performed.
  Real Wykop markup can change; when it does, extraction degrades to "not detected"
  rather than mis-attributing content.
