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

// CLI entry — used by the universal failure-catcher workflow
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const loud = !args.includes('--silent');
  const msg = args.filter((a) => a !== '--silent').join(' ');
  await notify(msg || '(empty)', { loud });
}
