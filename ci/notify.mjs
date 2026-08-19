// Telegram control room — one private channel for everything the machine does.
// Zero deps. no-op when TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID are absent (ships
// incrementally). Wrapped so a Telegram hiccup can NEVER fail a post or deploy.
//
// Importable:  await notify('text', { loud: true })
// CLI (for workflow steps):  node ci/notify.mjs "message"   [--silent]

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

export async function notify(text, { loud = true } = {}) {
  if (!TOKEN || !CHAT) { console.error('notify: TELEGRAM_* absent — skip'); return false; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // The header above promises a Telegram hiccup can never fail a post or
      // deploy — but a HANG isn't a hiccup: fetch() has no default timeout, so
      // without this signal a silent Telegram would block the caller forever.
      // smart-reply calls notify() right after posting, so that hang would
      // strand a job that had already done its real work.
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT, text, parse_mode: 'HTML',
          disable_web_page_preview: true, disable_notification: !loud,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return true;
      const body = await res.text().catch(() => '');
      console.error(`notify: HTTP ${res.status} ${body.slice(0, 160)}`);
      if (res.status < 500 && res.status !== 429) return false;   // 4xx (bad token/chat) won't fix on retry
    } catch (e) { console.error('notify: ' + e.message); }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
  return false;
}

// Poll for a human reply in the control-room chat, for the content-approve
// pipeline (see ci/approve-post.mjs). Looks at messages sent AFTER `sinceMs`
// (epoch ms) matching one of `patterns`; if several qualify, the LATEST wins
// (a changed mind should override an earlier reply). Returns the matched
// text, or null if none/absent creds/request failure — every case degrades
// to "no reply", which the caller treats as "skip today", never an error.
//
// No offset/ack tracking on purpose: every call re-reads Telegram's whole
// backlog and filters by sinceMs client-side, so there's no cross-run state
// to lose. Telegram itself drops unacknowledged updates after ~24h, which is
// far longer than one day's approval window needs.
export async function pollReply(sinceMs, patterns) {
  if (!TOKEN || !CHAT) { console.error('notify: TELEGRAM_* absent — skip'); return null; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?limit=100`, { signal: AbortSignal.timeout(10_000) });
    const j = await res.json();
    if (!j.ok) { console.error('notify: getUpdates failed: ' + JSON.stringify(j).slice(0, 200)); return null; }
    const matches = (j.result || [])
      .map((u) => u.message)
      .filter((m) => m && String(m.chat?.id) === String(CHAT) && typeof m.text === 'string' && m.date * 1000 > sinceMs)
      .filter((m) => patterns.some((p) => p.test(m.text.trim())))
      .sort((a, b) => b.date - a.date);
    if (matches.length) {
      console.error(`notify: pollReply matched ${matches.length} candidate(s) since ${new Date(sinceMs).toISOString()} (latest wins):`);
      matches.forEach((m) => console.error(`  ${new Date(m.date * 1000).toISOString()} "${m.text.trim()}"`));
    }
    return matches[0] ? matches[0].text.trim() : null;
  } catch (e) { console.error('notify: pollReply failed: ' + e.message); return null; }
}

// CLI entry — used by the universal failure-catcher workflow
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const loud = !args.includes('--silent');
  const msg = args.filter((a) => a !== '--silent').join(' ');
  await notify(msg || '(empty)', { loud });
}
