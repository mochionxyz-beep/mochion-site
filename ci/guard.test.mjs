// Regression + spec tests for the AI-draft hard gate.
//
// This is the backstop for a fact draft-dispatch.mjs's header comment states
// outright: content generation used to be "deterministic template (no LLM)
// for voice control." Once draft-posts.mjs and ops/reply.mjs put an LLM in
// the loop, this file is what has to prove the voice guarantee still holds —
// every trap below is a real figure lifted from data/public.json or a real
// rule from ops/x-playbook.md, not a hypothetical.
//
//   node --test ci/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from './guard.mjs';

const rejects = (text, ruleSubstr) => {
  const r = check(text);
  assert.equal(r.ok, false, `expected "${text}" to be rejected`);
  if (ruleSubstr) assert.ok(r.violations.some((v) => v.rule.includes(ruleSubstr)), `expected a "${ruleSubstr}" violation for "${text}", got: ${JSON.stringify(r.violations)}`);
};
const passes = (text) => {
  const r = check(text);
  assert.equal(r.ok, true, `expected "${text}" to pass, got: ${JSON.stringify(r.violations)}`);
};

test('REAL FIGURE: cumulative_return_pct (8.35%) as it actually appears in data/public.json', () => {
  rejects('day 78. up 8.35% since june.', 'numeric');
});
test('REAL FIGURE: a bare sharpe ratio, no % sign at all', () => {
  rejects('the sharpe is sitting at 3.03 right now.', 'numeric');
});
test('REAL FIGURE: worst_day_pct as a signed decimal', () => {
  rejects('worst day so far was -1.02, printed anyway.', 'numeric');
});
test('a spelled-out percent with no digit still trips the word-level rule', () => {
  rejects('up a few percent today.', 'numeric');
});
test('a dollar figure', () => {
  rejects('the account is up $500 today.', 'numeric');
});

test('day counts are explicitly ALLOWED — the whole point of the record', () => {
  passes('day 78. the machine is running.');
  passes('fifty honest days in a row. the machine is running.');
});
test('small plain integers unrelated to P&L are allowed', () => {
  passes('four workers, one machine, one job done in the open.');
  passes('the referee checks every strategy, 24/7.');
});

test('banned CTA words from the playbook, one at a time', () => {
  rejects('come invest in the machine.', 'banned-cta');
  rejects('deposit is not required to watch.', 'banned-cta');
  rejects('join the workshop today.', 'banned-cta');
  rejects('8% returns, printed daily.', 'banned-cta');
  rejects('this is the alpha you have been looking for.', 'banned-cta');
  rejects('no token, never will be.', 'banned-cta');
  rejects('not an nft drop.', 'banned-cta');
});
test('"return" the verb is NOT banned — only "returns" the financial noun', () => {
  passes('the machine will return to normal hours tomorrow.');
});

test('forward-looking performance promises', () => {
  rejects("we'll bounce back tomorrow, promise.", 'forward-promise');
  rejects('back to green soon.', 'forward-promise');
  rejects('this is risk-free.', 'forward-promise');
  rejects('the drawdown will recover by friday.', 'forward-promise');
});
test('a plain statement using the word "recover" with no promise attached is fine', () => {
  passes('the referee watches for a strategy that stops working and benches it before it can lose much.');
});

test('REGRESSION: identity leak mirrors the pre-push grep exactly', () => {
  rejects('written by hayden, an engineer.', 'identity-leak');
  rejects('find me at haufung80 elsewhere.', 'identity-leak');
});

test('anonymity tells: local time and weather chatter', () => {
  rejects('sunny out here in the workshop today.', 'anonymity');
  rejects("it's raining, so a quiet day at hq.", 'anonymity');
  rejects('posting this at 9am EST.', 'anonymity');
});
test('UTC is the house convention and must NOT be flagged', () => {
  passes('same hour, same UTC clock, every day.');
});

test('a link in the post body is rejected — it belongs in the self-reply', () => {
  rejects('read more at https://mochion.xyz', 'link-in-body');
  rejects('the receipts: mochion.xyz', 'link-in-body');
});

test('over-length text is rejected', () => {
  rejects('the machine is running. '.repeat(15), 'length');
});

test('a clean, on-voice control post passes with no violations', () => {
  const r = check('day 78. a red one, printed anyway — that\'s the whole point.');
  assert.deepEqual(r.violations, []);
});

test('AI-cliche phrases are WARNINGS only, never block approval', () => {
  const r = check("let's dive in — this is a total game-changer for the workshop.");
  assert.equal(r.ok, true);
  assert.ok(r.warnings.length >= 1);
});
test('em-dashes are house style, not an AI tell — must never be flagged', () => {
  const r = check('day 78 — the machine is running — nothing else to report.');
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, []);
});
