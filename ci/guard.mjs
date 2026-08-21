// The hard output gate for any AI-drafted post or reply. Pure function, zero
// deps, zero network — every candidate from draft-posts.mjs and ops/reply.mjs
// must pass check() before a human ever sees it. FAILS CLOSED: a violation
// means the draft is discarded and regenerated, never surfaced for approval.
//
// This exists because draft-dispatch.mjs's whole design was "no LLM, so voice
// is controlled by construction" (see its header comment). Once an LLM is in
// the loop that guarantee is gone — this is what replaces it. Same posture as
// the pre-push identity grep documented in project memory: same regex, same
// "zero matches expected, non-zero blocks" philosophy, just automated.
//
//   node --test ci/*.test.mjs

import { BANNED_CTAS } from './voice.mjs';

// Any decimal number reads as a stat (sharpe 3.03, -5.95% drawdown, 2.2 —
// public.json's real figures are all decimals). Plain integers are allowed
// on purpose: day counts ("day 78"), small counts ("four workers", "24/7").
const RE_DECIMAL = /\b\d+\.\d+\b/;
const RE_PERCENT = /\d\s*%/;
const RE_CURRENCY = /[$€£]\s*\d/;
const RE_PERCENT_WORD = /\b(percent|pct)\b/i;

// "returns" the financial noun (promised gains) is in BANNED_CTAS, so it's
// already covered here; "return" the verb ("return to the workshop") is
// common enough English that banning it outright would false-positive
// constantly for no safety gain — word-boundary matching on the plural noun
// already makes that distinction, nothing extra needed.
const RE_CTA = new RegExp('\\b(' + BANNED_CTAS.join('|') + ')\\b', 'i');

const RE_FORWARD_PROMISE = /\b(will|gonna|going to|expect(s|ed)? to)\b[^.!?]{0,40}\b(recover|bounce|rebound|moon)\b/i;
const RE_PROMISE_PHRASES = /\b(back to green soon|bounce back|guaranteed?|to the moon|moon soon|can't lose|risk-free)\b/i;

// Mirrors the project's own pre-push identity grep exactly (see memory:
// "identity grep: grep -RniE 'haufung|hayden|tang|htca' site/ → zero").
const RE_IDENTITY = /haufung|hayden|tang|htca/i;

const RE_LOCAL_TIME = /\bhere in\b|\blocal time\b|\bmy (city|town|neighbou?rhood|country|state|province)\b|\b(EST|EDT|PST|PDT|CST|CDT|MST|MDT|BST|CET|CEST|JST|IST)\b/;
const RE_WEATHER = /\b(sunny out|raining|it'?s raining|snowing|it'?s snowing|cloudy today|humid out|heatwave)\b/i;

// Real fabrication caught in ops/reply.mjs testing: asked to describe how
// the record is verified, the model invented "we put our raw ledger on a
// public chain" — Mochion's mechanism is an append-only git commit history
// on GitHub, never a blockchain. A prompt instruction alone already failed
// to prevent this once; this is the hard backstop.
const RE_CHAIN_CLAIM = /\b(blockchain|chain|smart contract)\b/i;

const RE_URL = /https?:\/\/\S+|\bwww\.\S+/i;
const RE_BARE_DOMAIN = /\b[a-z0-9-]+\.(xyz|com|io|net|org|co|dev)\b/i;

const MAX_LEN = 280;

// Non-fatal: generic-LLM phrasing that clashes with the sober/small-words
// voice. Flagged as a warning so a human can still approve it, unlike the
// hard rules above. (Em-dashes are deliberately NOT flagged here — they're
// house style throughout the real site copy, not an AI tell in this brand.)
const AI_CLICHES = [
  /\bin today'?s fast-paced\b/i, /\blet'?s dive in\b/i, /\bunlock\b/i, /\bgame-?changer\b/i,
  /\bat the end of the day\b/i, /\bit'?s important to note\b/i, /\bin conclusion\b/i,
  /\belevate\b/i, /\bseamless(ly)?\b/i, /\bunpack\b/i, /\btake it to the next level\b/i,
];

/**
 * @param {string} text
 * @returns {{ok: boolean, violations: {rule: string, detail: string}[], warnings: string[]}}
 */
export function check(text) {
  const violations = [];
  const add = (rule, detail) => violations.push({ rule, detail });

  // everything below assumes a valid, non-empty string — bail out early
  // rather than run 15 regexes against a coerced "undefined"
  if (typeof text !== 'string' || !text.trim()) { add('empty', 'no text'); return { ok: false, violations, warnings: [] }; }

  if (RE_DECIMAL.test(text)) add('numeric', 'decimal number — reads as a stat, must live in the card only');
  if (RE_PERCENT.test(text)) add('numeric', 'percent figure in text');
  if (RE_CURRENCY.test(text)) add('numeric', 'currency figure in text');
  if (RE_PERCENT_WORD.test(text)) add('numeric', '"percent"/"pct" spelled out');

  const cta = text.match(RE_CTA);
  if (cta) add('banned-cta', `"${cta[0]}"`);

  if (RE_FORWARD_PROMISE.test(text) || RE_PROMISE_PHRASES.test(text)) add('forward-promise', 'implies future performance');

  if (RE_IDENTITY.test(text)) add('identity-leak', 'matches the pre-push identity grep pattern');

  if (RE_LOCAL_TIME.test(text)) add('anonymity', 'local-time / location tell');
  if (RE_WEATHER.test(text)) add('anonymity', 'weather chatter');

  if (RE_URL.test(text) || RE_BARE_DOMAIN.test(text)) add('link-in-body', 'a link belongs in the self-reply, not the post');

  if (RE_CHAIN_CLAIM.test(text)) add('false-mechanism', 'the record is git commits on GitHub, not a blockchain — see comment above RE_CHAIN_CLAIM');

  if (text.length > MAX_LEN) add('length', `${text.length} chars > ${MAX_LEN}`);

  const warnings = [];
  for (const re of AI_CLICHES) if (re.test(text)) warnings.push(`generic phrasing: matches ${re}`);

  return { ok: violations.length === 0, violations, warnings };
}
