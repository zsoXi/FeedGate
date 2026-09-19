/**
 * Incident regression fixture for the 2026-09-18 diagnostics pair.
 *
 * These two files are real, privacy-safe diagnostic exports from a 2.1.0
 * session. They are retained as an incident record, not as a production
 * parser. The assertions below replay the reviewed counts from the repair
 * task (Appendix A). If the fixtures are absent the suite is reported as
 * skipped instead of passing silently.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const DIR = new URL('./fixtures/incident/', import.meta.url);
const FIRST = new URL('feedgate-2.1-diagnostics-2026-09-18T02-00-13-406Z.json', DIR);
const SECOND = new URL('feedgate-2.1-diagnostics-2026-09-18T02-01-11-706Z.json', DIR);
const THIRD = new URL('feedgate-2.1.1-diagnostics-2026-09-18T03-27-28-394Z.json', DIR);
const available = existsSync(FIRST) && existsSync(SECOND);
const availableThird = existsSync(THIRD);
const read = url => JSON.parse(readFileSync(url, 'utf8'));
const count = (rows, fn) => rows.filter(fn).length;
const tally = (rows, fn) => rows.reduce((out, row) => { const key = fn(row); out[key] = (out[key] || 0) + 1; return out; }, {});

test('incident fixtures retain the reviewed windows and provenance', {skip: available ? false : 'INSUFFICIENT: incident diagnostics fixtures are not present'}, () => {
  const before = read(FIRST), after = read(SECOND);
  assert.equal(before.format, 'feedgate-diagnostics');
  assert.equal(before.version, 3, 'fixture is a 2.1.0 schema-3 export and must stay readable');
  assert.equal(before.rubric, 'feed-v2.1.0');
  assert.equal(before.decisions.length, 150);
  assert.equal(after.decisions.length, 150);
  const gap = (Date.parse(after.generatedAt) - Date.parse(before.generatedAt)) / 1000;
  assert.ok(Math.abs(gap - 58.3) < 0.01, `export gap was ${gap}s`);
});

test('first snapshot: every retained filter action came from the local ad path', {skip: available ? false : 'INSUFFICIENT: incident diagnostics fixtures are not present'}, () => {
  const before = read(FIRST);
  assert.deepEqual(pick(before.metrics), {decisions: 459, requests: 189, classified: 189, cacheHits: 213, filterDecisions: 56, errors: 0, inputTokens: 151545, outputTokens: 27027});
  const x = before.decisions.filter(row => row.site === 'x');
  assert.equal(x.length, 150);
  assert.deepEqual(tally(x, row => row.action), {allow: 122, collapse: 28});
  for (const row of x.filter(r => r.action !== 'allow')) {
    assert.equal(row.source, 'local');
    assert.equal(row.rule, 'platform_labelled_ad');
    assert.equal(row.adEvidence ?? null, null, 'schema-3 exports did not carry ad evidence objects');
  }
  assert.equal(count(x, row => row.action === 'dim'), 0, 'no semantic dim or collapse was recorded');
});

test('later snapshot: the Reddit window matches the reviewed rule counts', {skip: available ? false : 'INSUFFICIENT: incident diagnostics fixtures are not present'}, () => {
  const before = read(FIRST), after = read(SECOND);
  assert.deepEqual(pick(after.metrics), {decisions: 586, requests: 314, classified: 314, cacheHits: 215, filterDecisions: 58, errors: 0, inputTokens: 286609, outputTokens: 44902});
  const reddit = after.decisions.filter(row => row.site === 'reddit');
  const x = after.decisions.filter(row => row.site === 'x');
  assert.equal(reddit.length, 127);
  assert.equal(x.length, 23);
  assert.deepEqual(tally(reddit, row => row.action), {allow: 125, dim: 2});
  assert.deepEqual(tally(reddit, row => row.rule), {
    no_noise_rule_matched: 79,
    insufficient_evidence: 41,
    promotion_signal_alone: 5,
    manipulative_bait: 2,
  });
  assert.equal(count(reddit, row => row.cached === true), 2);
  assert.equal(count(reddit, row => row.cached !== true), 125);
  assert.equal(count(reddit, row => row.action === 'collapse'), 0, 'no Reddit collapse was recorded');
  const latencies = reddit.filter(row => row.cached !== true).map(row => row.latencyMs);
  assert.ok(Math.min(...latencies) > 0 && Math.max(...latencies) < 5000, 'recorded latencies stay in a plausible range');
  assert.deepEqual(pick(delta(after.metrics, before.metrics)), {decisions: 127, requests: 125, classified: 125, cacheHits: 2, filterDecisions: 2, errors: 0, inputTokens: 135064, outputTokens: 17875});
});

test('2.1.1 snapshot: the picker session left one quarantinable rule and no filter actions', {skip: availableThird ? false : 'INSUFFICIENT: the 2.1.1 diagnostics fixture is not present'}, () => {
  const third = read(THIRD);
  assert.equal(third.version, 4, 'fixture is a 2.1.1 schema-4 export and must stay readable');
  assert.equal(third.extensionVersion, '2.1.1');
  assert.equal(third.build.detector, 'ad-2.1.1');
  assert.equal(third.settings.cosmeticRuleCount, 1, 'the reporter had exactly one cosmetic rule');
  assert.equal(third.settings.allowedAuthorCount, 1);
  assert.equal(third.settings.savedPostChoices, 0);
  assert.deepEqual(third.settings.sites, ['reddit', 'x']);
  assert.deepEqual(pick(third.metrics), {decisions: 253, requests: 178, classified: 172, cacheHits: 81, filterDecisions: 0, errors: 0, inputTokens: 142981, outputTokens: 24596});
  assert.equal(third.metrics.lastModel, 'jev-1.13.0');
  assert.equal(third.pages.length, 0, 'no renderer report was retained, so renderer health cannot be inferred from this file');
  assert.equal(third.decisions.length, 150);
  assert.deepEqual(tally(third.decisions, row => row.action), {allow: 150});
  assert.deepEqual(tally(third.decisions, row => row.rule), {
    insufficient_evidence: 85,
    no_noise_rule_matched: 39,
    below_noise_thresholds: 21,
    useful_or_original_protection: 3,
    promotion_signal_alone: 2,
  });
});

function pick(metrics) {
  const keys = ['decisions', 'requests', 'classified', 'cacheHits', 'filterDecisions', 'errors', 'inputTokens', 'outputTokens'];
  return Object.fromEntries(keys.map(key => [key, metrics[key]]));
}
function delta(after, before) {
  return Object.fromEntries(Object.keys(pick(after)).map(key => [key, after[key] - before[key]]));
}
