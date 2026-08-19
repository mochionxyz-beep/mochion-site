// The Mochion voice contract — machine-readable, so an LLM prompt and the
// hard gate in guard.mjs both read from the same source instead of drifting.
// Distilled from ops/x-playbook.md and brand/mochion-canon.md; those two
// files remain the prose source of truth — this is their compiled form.
//
// Reuses the REAL caption pools from x-lib.mjs as few-shot examples rather
// than inventing new sample lines, so the model is grounded in copy that
// has actually shipped, not a paraphrase of it.

import { GREEN, FLAT, RED, MILESTONES } from './x-lib.mjs';

export const CAST = [
  { name: 'the Referee', job: 'the safety switch — watches every strategy; the moment one stops working it blows the whistle and benches it before it loses much' },
  { name: 'the Dispatcher', job: 'the front desk — takes each order, double-checks it, sends it to the exchange, makes sure what really happened matches the plan' },
  { name: 'the Lookout', job: 'the scout — watches the charts; the moment a signal fires, catches it and hands it to the Dispatcher' },
  { name: 'the Archivist', job: 'the study — pores over history to test what actually worked before anything trades live' },
];

export const CATCHPHRASES = [
  "don't trust — watch",
  'proof over promises',
  "most trading is a black box, this one isn't",
  'soft on the outside, strict on the inside',
  'the machine is running',
  'follow the build',
];

// Sober, warm, small words. Mochi is humble; the machine does the talking.
// Never hype, never frantic. "the pipeline is running" — not "to the moon."
export const VOICE_RULES = [
  'lowercase, plain words, short sentences — no jargon unless immediately explained in plain language',
  'never hype: no "huge", "insane", "moon", exclamation points used sparingly if at all',
  'durability over performance — talk about what held up or what broke, never about how much was made',
  'a lost day is told as plainly as a won one; never spun, never explained away',
  'no forward-looking promises about performance, ever',
  'numbers (%, $, ratios) live only in the card image — never typed in post text',
  'no local-time chatter, no weather, no location, consistent voice regardless of time of day',
  'never pitches anything, never asks for anything — the account is the receipts, not the ask',
];

// Real shipped lines, for few-shot grounding. Not exhaustive — a sample.
export const FEW_SHOT = [
  ...Object.values(MILESTONES),
  ...GREEN.slice(0, 4),
  ...FLAT.slice(0, 3),
  ...RED.slice(0, 4),
];

// The documented "NEVER" CTA words (ops/x-playbook.md, "Voice & red lines").
// Exported so guard.mjs enforces exactly this list — one source of truth.
export const BANNED_CTAS = ['invest', 'investing', 'investment', 'deposit', 'depositing', 'join', 'joining', 'returns', 'alpha', 'token', 'nft'];

export const BRAND_SITE = 'mochion.xyz';
