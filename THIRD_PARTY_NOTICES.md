# Third-party notices and provenance

FeedGate 2.0.0 is an original implementation released under GPL-3.0-or-later.
The complete GPL version 3 license is included in LICENSE.

## uBlock Origin

This project was informed by the public architecture and source of uBlock Origin,
particularly the separation of DOM observation, cosmetic filtering, site controls,
and user-authored filters in `src/js/contentscript.js`.

Sources reviewed on 2026-09-17:

* https://github.com/gorhill/uBlock
* https://github.com/gorhill/uBlock/blob/master/src/js/contentscript.js
* https://github.com/gorhill/uBlock/blob/master/LICENSE.txt

No uBlock Origin JavaScript, filter lists, images, engine, compiled artifacts,
scriptlets, or branding are copied into this release. The `domain##CSS-selector`
notation is a deliberately small, familiar cosmetic-rule subset. FeedGate is not a
fork, official port, complete filter-list interpreter, or drop-in replacement.
Raymond Hill and the uBlock Origin contributors are not affiliated with FeedGate.

## TypeSafe and Chrome

The HTTP request/response contract was implemented from the official TypeSafe
reference. TypeSafe's model, SDK and hosted service are not bundled. A user supplies
their own direct TypeSafe API credential. Use of that service remains subject to
the provider's terms, availability, quotas and privacy practices.

* https://docs.typesafe.ai/api
* https://docs.typesafe.ai/primitives/noul
* https://developer.chrome.com/docs/extensions/reference/api/storage
* https://developer.chrome.com/docs/extensions/reference/api/scripting
* https://developer.chrome.com/docs/extensions/develop/concepts/network-requests

Chrome, Chromium, TypeSafe, Jev, X, Reddit, LinkedIn, Facebook and Instagram are
names used to identify interoperability targets, not to imply endorsement.

## Dependencies and assets

The installable extension has no third-party runtime dependencies. It uses browser
APIs, local JavaScript, local CSS, system fonts and an original simple icon.
No fonts or remote scripts are bundled or downloaded.

Developer tests optionally use Playwright Python and Chromium, installed separately
under their respective licenses. Neither is redistributed in the ZIP. Node.js is
needed only to rebuild or run the unit tests, not to load the ready-made extension.
