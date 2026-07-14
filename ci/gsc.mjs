// Google Search Console reader via a service-account JWT — zero dependencies.
// Signs an RS256 JWT with node's crypto, exchanges it for an access token, and
// queries the Search Analytics API. Returns null (never throws to the caller's
// fatal path) when GSC_SA_KEY is absent so the metrics job ships without it.

import { createSign } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`GSC token: ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

async function query(token, site, body) {
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(`GSC query: ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// Returns { totals:{clicks,impressions,ctr,position}, topQueries:[...], topPages:[...] } or null.
export async function searchConsole(env = process.env) {
  const raw = env.GSC_SA_KEY;
  if (!raw) { console.error('gsc: GSC_SA_KEY absent — skipping search metrics'); return null; }
  try {
    const sa = JSON.parse(raw);
    const site = env.GSC_SITE || 'sc-domain:mochion.xyz';   // Domain property
    const token = await accessToken(sa);
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    const base = { startDate: start, endDate: end };
    const totals = await query(token, site, base);
    const byQuery = await query(token, site, { ...base, dimensions: ['query'], rowLimit: 10 });
    const byPage = await query(token, site, { ...base, dimensions: ['page'], rowLimit: 10 });
    const T = (totals.rows && totals.rows[0]) || {};
    return {
      window: `${start}..${end}`,
      totals: { clicks: T.clicks || 0, impressions: T.impressions || 0, ctr: +(T.ctr || 0).toFixed(4), position: +(T.position || 0).toFixed(1) },
      topQueries: (byQuery.rows || []).map((r) => ({ q: r.keys[0], clicks: r.clicks, impr: r.impressions })),
      topPages: (byPage.rows || []).map((r) => ({ p: r.keys[0], clicks: r.clicks, impr: r.impressions })),
    };
  } catch (e) { console.error('gsc: ' + e.message); return { error: e.message }; }
}
