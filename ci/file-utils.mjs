// Generic file-reading helpers, relative to the SITE ROOT (one level up from
// ci/). Deliberately separate from x-lib.mjs — that file is the OAuth-signing
// X client every production poster depends on; these two have nothing to do
// with X and don't belong raising that file's review surface.
//
// Callers live in ci/, the same directory as this module, so '../' + p
// resolves identically whether computed from the caller's import.meta.url or
// from here.

import { readFileSync } from 'node:fs';

// Parsed JSON, or null on any failure (missing file, bad JSON) — never throws.
export const readJson = (p) => { try { return JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8')); } catch { return null; } };

// Raw text, or '' on any failure — never throws.
export const readText = (p) => { try { return readFileSync(new URL('../' + p, import.meta.url), 'utf8'); } catch { return ''; } };
