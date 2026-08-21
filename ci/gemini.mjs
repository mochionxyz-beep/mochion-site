// Zero-dependency Gemini text client. Styled after ci/gsc.mjs (returns null,
// never throws to the caller's fatal path, when the key is absent) and
// ci/x-lib.mjs's call() (per-attempt timeout, retry ONLY on 5xx/429 — a bad
// key, a bad request, or a safety block won't fix itself on retry).
//
// This is the first LLM integration in the repo. draft-dispatch.mjs's header
// says content generation was "deterministic template (no LLM) for voice
// control" — that guarantee now lives in ci/guard.mjs instead. Every caller
// of generate() MUST run the result through guard.check() before it reaches
// a human or X. This file has no opinion on voice; voice.mjs does.
//
// thinkingBudget:0 is NOT optional — confirmed live against the real API:
// gemini-3.5-flash defaults to extended "thinking" that consumes the output
// token budget invisibly (a 200-token budget produced ~189 thought tokens
// and a sentence truncated to "A kill-switch immediately halts", finishReason
// MAX_TOKENS). Disabling it fixed it outright (finishReason STOP, full
// sentence, 22 tokens) and is also strictly cheaper for one-liner posts.
//
// candidateCount > 1 is NOT supported on this model/tier — confirmed live
// (400 INVALID_ARGUMENT "Multiple candidates is not enabled for this
// model"). generate() therefore always requests exactly one candidate.
// draft-posts.mjs needs 3 (one per pillar) and gets them by calling
// generate() 3 times concurrently via Promise.all; ops/reply.mjs needs 2
// but gets both from a SINGLE call by asking the model for two REPLY:
// lines in one completion (see its buildPrompt) — not a second call.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const TIMEOUT_MS = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(apiKey, prompt, { temperature = 0.9, maxOutputTokens = 200 } = {}, tries = 3) {
  // caught here, not left as a silent no-op: with tries <= 0 the loop below
  // never runs, and without this the function would resolve to undefined
  // instead of failing loudly — a caller misconfiguring the retry count
  // would look like a Gemini outage, not a bug in the caller.
  if (tries < 1) throw new Error(`gemini: tries must be >= 1, got ${tries}`);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
  });
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    let res, out;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      out = await res.json().catch(() => ({}));
    } catch (e) {
      lastErr = (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) ? new Error(`timed out after ${TIMEOUT_MS}ms`) : e;
      if (attempt < tries) { console.error(`gemini: attempt ${attempt} failed (${lastErr.message}); retrying…`); await sleep(1500 * attempt); continue; }
      throw new Error(`gemini: failed after ${tries} tries: ${lastErr.message}`);
    }
    if (res.ok) {
      // a clean HTTP response can still carry no usable text — a safety block
      // or an empty finish is deterministic, so don't waste retries on it.
      const block = out?.promptFeedback?.blockReason;
      if (block) throw new Error(`gemini: prompt blocked (${block})`);
      const cand = out?.candidates?.[0];
      const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (!text) throw new Error(`gemini: empty response (finishReason=${cand?.finishReason || 'unknown'})`);
      return text;
    }
    if (res.status >= 500 || res.status === 429) {
      lastErr = new Error(`${res.status} ${JSON.stringify(out).slice(0, 200)}`);
      if (attempt < tries) { console.error(`gemini: attempt ${attempt} failed (${lastErr.message}); retrying…`); await sleep(1500 * attempt); continue; }
      throw new Error(`gemini: failed after ${tries} tries: ${lastErr.message}`);
    }
    throw new Error(`gemini ${res.status}: ${JSON.stringify(out).slice(0, 300)}`);
  }
  // unreachable: every branch above this loop returns, throws, or (only
  // while attempt < tries) continues — so the loop can never fall through.
}

// One generated string, or null if GEMINI_API_KEY is absent.
export async function generate(prompt, opts, env = process.env) {
  const key = env.GEMINI_API_KEY;
  if (!key) { console.error('gemini: GEMINI_API_KEY absent — skipping generation'); return null; }
  return call(key, prompt, opts);
}
