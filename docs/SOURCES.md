# Implementation references

Official documentation reviewed for this build on 2026-09-17:

* TypeSafe HTTP endpoint, question shape, response shape and error codes: https://docs.typesafe.ai/api
* Noul semantics and the distinction between a yes-probability and a separate confidence value: https://docs.typesafe.ai/primitives/noul
* Chrome extension storage areas and trusted-context access: https://developer.chrome.com/docs/extensions/reference/api/storage
* Cross-origin requests from an extension context: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
* Local unpacked extension installation and page reload requirements: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world
* Optional host access and isolated script injection: https://developer.chrome.com/docs/extensions/reference/api/scripting
* uBlock Origin project, for architectural inspiration and familiar local cosmetic-filter controls: https://github.com/gorhill/uBlock
* GitHub Actions workflow syntax examples: https://github.com/actions/checkout , https://github.com/actions/setup-node , https://github.com/actions/setup-python

No external benchmark, social-media token-price claim or previous demo's accuracy was used as a measured result for FeedGate 2.1. The classifier rubric and decision thresholds are original operating choices. Documentation availability does not mean a real provider or signed-in-site test was performed.
