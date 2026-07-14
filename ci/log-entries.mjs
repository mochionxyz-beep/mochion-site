// The log.html authoring contract, parsed in ONE place (was duplicated in
// build-feed.mjs + announce.mjs, a drift risk). Zero dependencies.
//
//   each entry is  <article class="entry" id="YYYY-MM-DD-slug"> … </article>
//   containing exactly one <time datetime="YYYY-MM-DD"> and one <h2>.
// Entry ids are permalinks AND feed GUIDs — never change one after it ships.

// Returns every <article class="entry"> as { id, body, date, title } in document
// order. date/title are null when absent — callers decide how strict to be
// (build-feed FAILS the build; announce skips silently).
export function parseLogEntries(html) {
  const re = /<article class="entry" id="([^"]+)">([\s\S]*?)<\/article>/g;   // fresh regex per call — no shared lastIndex
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, id, body] = m;
    const date = body.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/)?.[1] || null;
    const title = body.match(/<h2>([\s\S]*?)<\/h2>/)?.[1]?.trim() || null;
    out.push({ id, body, date, title });
  }
  return out;
}

// the id contract: YYYY-MM-DD-slug (lowercase kebab). Permalink === feed GUID.
export const isEntryId = (id) => /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id);

// newest first, by date (stable enough — ids carry the date, ties don't matter).
export const sortEntriesDesc = (entries) => entries.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
