// Regression tests for the smart link-reply picker.
//
// pickToLink was exported "for tests" from the start, but no test was ever
// written — and the bug that shipped was exactly the kind a test would have
// caught: X rewrites URLs in `text` into t.co shortlinks, so the idempotency
// check never recognized our own link-replies and re-linked the same post
// every day until it aged out of the window.
//
//   node --test ci/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickToLink, carriesLink } from './smart-reply.mjs';

const NOW = Date.parse('2026-08-04T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 864e5).toISOString();

/** a qualifying original — crosses the likes bar, recent, no link of its own */
function original(id, over = {}) {
  return {
    id,
    text: 'day 60. the machine is running.',
    created_at: daysAgo(1),
    public_metrics: { like_count: 40, reply_count: 0, impression_count: 100 },
    ...over,
  };
}

/** our own reply to `parentId`, as X ACTUALLY returns it: URL rewritten to t.co */
function tcoLinkReply(id, parentId) {
  return {
    id,
    text: 'the tape → https://t.co/aBcDeF1234',           // <- the real-world shape
    created_at: daysAgo(1),
    public_metrics: {},
    referenced_tweets: [{ type: 'replied_to', id: parentId }],
    entities: { urls: [{ url: 'https://t.co/aBcDeF1234', expanded_url: 'https://mochion.xyz', display_url: 'mochion.xyz' }] },
  };
}

test('REGRESSION: a t.co-rewritten link-reply is recognized, so the parent is not re-linked', () => {
  // Before the fix this returned the parent again (and again, daily) because
  // /mochion\.xyz/ never matched "the tape → https://t.co/...".
  const tweets = [original('p1'), tcoLinkReply('r1', 'p1')];
  assert.deepEqual(pickToLink(tweets, { now: NOW }), []);
});

test('REGRESSION: recognized even if entities are missing entirely (fails closed)', () => {
  // If `entities` isn't returned for any reason, the URL-free signature of
  // LINK_REPLY must still catch it — better to skip a link than to spam one.
  const reply = tcoLinkReply('r1', 'p1');
  delete reply.entities;
  assert.equal(carriesLink(reply), true);
  assert.deepEqual(pickToLink([original('p1'), reply], { now: NOW }), []);
});

test('a qualifying, never-linked original IS picked', () => {
  const picks = pickToLink([original('p1')], { now: NOW });
  assert.deepEqual(picks.map((t) => t.id), ['p1']);
});

test('an original that already carries the link in its own text is skipped', () => {
  const t = original('p1', { text: 'day 60. the tape → https://mochion.xyz' });
  assert.deepEqual(pickToLink([t], { now: NOW }), []);
});

test('replies are never candidates themselves', () => {
  const r = { ...original('r1'), referenced_tweets: [{ type: 'replied_to', id: 'x' }] };
  assert.deepEqual(pickToLink([r], { now: NOW }), []);
});

test('below-threshold posts are skipped; any single crossed metric qualifies', () => {
  const quiet = original('p1', { public_metrics: { like_count: 1, reply_count: 0, impression_count: 10 } });
  assert.deepEqual(pickToLink([quiet], { now: NOW }), []);

  const byReplies = original('p2', { public_metrics: { like_count: 0, reply_count: 8, impression_count: 0 } });
  assert.deepEqual(pickToLink([byReplies], { now: NOW }).map((t) => t.id), ['p2']);

  const byImpressions = original('p3', { public_metrics: { like_count: 0, reply_count: 0, impression_count: 5000 } });
  assert.deepEqual(pickToLink([byImpressions], { now: NOW }).map((t) => t.id), ['p3']);
});

test('posts older than the recency window are not resurrected', () => {
  const old = original('p1', { created_at: daysAgo(30) });
  assert.deepEqual(pickToLink([old], { now: NOW }), []);
});

test('the per-run cap is respected, highest-reach first', () => {
  const tweets = [
    original('low', { public_metrics: { like_count: 40, reply_count: 0, impression_count: 100 } }),
    original('high', { public_metrics: { like_count: 40, reply_count: 0, impression_count: 9000 } }),
    original('mid', { public_metrics: { like_count: 40, reply_count: 0, impression_count: 1000 } }),
  ];
  assert.deepEqual(pickToLink(tweets, { now: NOW, max: 2 }).map((t) => t.id), ['high', 'mid']);
});

test('carriesLink accepts a plain (un-rewritten) mochion.xyz URL too', () => {
  assert.equal(carriesLink({ text: 'see https://mochion.xyz for the record' }), true);
  assert.equal(carriesLink({ text: 'day 60. the machine is running.' }), false);
});
