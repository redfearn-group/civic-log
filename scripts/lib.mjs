// Shared helpers for the civic-log scripts. Plain Node, run directly (not part
// of the Astro build), so they cannot import the TypeScript kit. Date helpers
// here duplicate a small part of src/lib/kit/date.ts on purpose.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');
export const PMN = 'https://www.utah.gov';

// Identify the project honestly; utah.gov's robots.txt allows everything.
const UA = 'civic-log/1.0 (+https://github.com/redfearn-group/civic-log)';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polite fetch: one request per second, 30 s timeout, one retry for flaky links.
export async function getText(url, { retries = 1, delayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await sleep(delayMs);
      return text;
    } catch (e) {
      lastErr = e;
      await sleep(3000);
    }
  }
  throw new Error(`${url}: ${lastErr?.message ?? lastErr}`);
}

export const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', sect: '§', ndash: '-', mdash: '-' };
export function decode(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

// Strip tags but keep line structure, for agenda text.
export function htmlToLines(html) {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l, i, a) => l || (a[i - 1] ?? '') !== '')
    .join('\n')
    .trim();
}

export const oneLine = (s) => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n) => String(n).padStart(2, '0');

// "August 4, 2026 06:00 PM" or "2026/10/20 06:20 PM" -> { date: '2026-08-04', time: '18:00' }
export function parsePmnDate(s) {
  const t = oneLine(s);
  let m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M))?/i.exec(t);
  let y, mo, d, hh, mm, ap;
  if (m) {
    const idx = MONTHS.indexOf(m[1].toLowerCase());
    if (idx < 0) return null;
    [y, mo, d, hh, mm, ap] = [m[3], idx + 1, m[2], m[4], m[5], m[6]];
  } else {
    m = /^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M))?/i.exec(t);
    if (!m) return null;
    [y, mo, d, hh, mm, ap] = [m[1], m[2], m[3], m[4], m[5], m[6]];
  }
  const date = `${y}-${pad(Number(mo))}-${pad(Number(d))}`;
  if (!hh) return { date, time: null };
  let h = Number(hh) % 12;
  if (ap.toUpperCase() === 'PM') h += 12;
  return { date, time: `${pad(h)}:${mm}` };
}

// Today in Mountain time, whatever the machine's zone (Actions runs in UTC).
export function todayMountain() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function readYaml(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return yaml.load(fs.readFileSync(file, 'utf-8')) ?? fallback;
}

export function writeYaml(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yaml.dump(obj, { lineWidth: 100, noRefs: true, quotingType: '"' }), 'utf-8');
}

export function loadBodies({ includeInactive = false } = {}) {
  const cfg = readYaml(path.join(ROOT, 'config', 'sources.yaml'), { bodies: [] });
  return cfg.bodies.filter((b) => includeInactive || b.active);
}

// Every notice on disk, newest first by event date.
export function loadNotices() {
  const dir = path.join(DATA, 'notices');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const body of fs.readdirSync(dir)) {
    for (const f of fs.readdirSync(path.join(dir, body))) {
      if (f.endsWith('.yaml')) out.push(readYaml(path.join(dir, body, f)));
    }
  }
  return out.sort((a, b) => (b.start?.date ?? '').localeCompare(a.start?.date ?? ''));
}

export function loadSummaries() {
  const dir = path.join(DATA, 'summaries');
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.yaml')) {
      const s = readYaml(path.join(dir, f));
      if (s?.notice) out.set(Number(s.notice), s);
    }
  }
  return out;
}
