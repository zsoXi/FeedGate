# Optional live evaluation

This developer-only corpus contains 18 fictional examples and human-written target actions for Balanced. It is a regression starting point, not a representative test of real feeds. No live evaluation was run for this release. Policy unit tests with supplied probabilities are not evidence that Jev will produce those probabilities.

The runner uses the same rubric, strict API client and deterministic policy as the extension. It never installs browser software or changes Chrome policy. It is separate from normal installation, which does not require a terminal.

Validate the corpus without networking:

```sh
node scripts/evaluate-live.mjs
```

For an explicitly authorised live run, provide your own `TYPESAFE_API_KEY` through your shell's environment and run:

```sh
node scripts/evaluate-live.mjs --live
```

Do not write the key into source, commit it or paste it into an issue. Live mode makes at most 18 sequential provider requests, can incur charges and stops after the first transport failure. Output is in `evaluation/results/`, which is gitignored. Reports include case IDs, estimates, actions, latency and provider token usage, not raw text or keys. Results still need human review before sharing.

Useful promotional posts, quotes criticising credential theft, short personal updates, a bare link and profile context are deliberate cases. Some targets permit more than one action because there is no uniquely correct subjective answer. Add actual consented, redacted counterexamples locally and label them independently before estimating quality. Do not automatically expand this into a crawl of other people's accounts.
