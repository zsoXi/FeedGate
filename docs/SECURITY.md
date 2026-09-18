# Security and threat model

## Protected boundaries

The API key is used by the trusted extension worker only. Content scripts receive public settings and judgments, not credentials or vault contents. Local and session storage access levels are explicitly restricted to trusted contexts. Privileged key/settings/export messages are accepted only from known internal extension pages. Web-page code does not receive an externally_connectable endpoint, page-message bridge, native messaging host or arbitrary URL proxy.

Inference is fixed to `https://api.typesafe.ai/v1/systemone`. Keys are not placed in URLs. Fetch omits cookies and referrers, rejects redirects and bounds response size/time. CSP excludes remote executable code. The model returns validated numeric judgments, never executable scripts or tool calls.

Settings and daily budget updates are serialised. Changing credentials, settings or consent invalidates pending inference. Credential epochs prevent a late encryption operation from silently unlocking after a subsequent Lock command. Host permissions are checked again in content-sender validation.

The UI uses textContent rather than rendering post/model values as HTML. Security-sensitive page buttons require trusted clicks. Diagnostics are constructed from explicit fields rather than by serialising all storage.

## Vault

AES-256-GCM provides authenticated encryption. The key derivation uses PBKDF2-SHA256 with 600,000 iterations, random 16-byte salt, random 12-byte nonce and fixed associated data. The passphrase is never persisted. Password inputs are cleared after operations. Binary temporary buffers are cleared where practical, but JavaScript strings and browser internals cannot be reliably erased from memory.

An optional vault protects a copied at-rest ciphertext from casual reading. It does not protect an unlocked browser from local malware, malicious debugging, a compromised extension update or someone with control of the machine. There is no claim of OS hardware-backed secret storage, guaranteed memory erasure or automatic secure unlocking. Use a separate revocable TypeSafe key.

## Model limitations

Prompt instructions tell Jev to treat posts and quotes as untrusted evidence, but this is not a formal prompt-injection defence. A post can manipulate classification. Positive information-value estimates do not prove truth. Risk estimates are not adjudications. Always retain Show/override controls.

The extension does not execute model output, navigate to returned links or send secrets from page forms to tools. Unknown/malformed responses leave semantic content visible rather than fabricating scores. An independent local ad rule may still apply when the API is unavailable.

## Remaining risks and release gates

DOM selectors and route guards are heuristics. Private groups or sensitive posts can appear in otherwise supported feeds. Consent must be informed and users should disable cloud analysis where disclosure is inappropriate.

The release has not received an independent security audit, a current signed-in-site test, or a native installed-extension run in the build environment. Its managed policy blocks extension installation. No policy was disabled or bypassed. Record manual validation against a clean permitted Chrome profile and a dedicated key before wider distribution.

Never attach API keys, raw private post text or browser profile exports to a public issue. Prefer the built-in diagnostic file. Revoke exposed keys at the provider immediately.
