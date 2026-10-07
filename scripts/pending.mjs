// List the notices that need a new or refreshed summary, and extract text from
// their attachments so the summarizer can read them. Writes work/pending.json.
//
// A notice is pending when it has no summary, its hash changed since the
// summary was written, or scripts/videos.mjs found a meeting video with captions
// that the summary has not used yet. Only notices dated within the last
// BACKFILL_DAYS (or in the future) are considered, so a first run is not
// flooded with history.
//
//   node scripts/pending.mjs                    list and extract
//   node scripts/pending.mjs --list             list only, no downloads
//   node scripts/pending.mjs --redo 111 222     also include these ids
//
// Scanned PDFs (no text layer) are rendered to PNG page images under
// work/img/ with PyMuPDF so the summarizer can read them as images. Set
// CIVIC_PYTHON to the python.exe that has PyMuPDF installed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, DATA, readYaml, loadNotices, loadSummaries, todayMountain, addDays, sleep } from './lib.mjs';

const BACKFILL_DAYS = 30;
// Attachments worth reading. Minutes carry votes; staff reports and
// presentations carry the detail behind an agenda line. Skip audio and huge files.
const READ = /minutes|staff report|presentation|ordinance|resolution|agenda|notice|summary|report|plan|memo/i;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 6;

const WORK = path.join(ROOT, 'work');
const TEXT = path.join(WORK, 'text');
const IMG = path.join(WORK, 'img');
const MAX_PAGES = 12;
const listOnly = process.argv.includes('--list');
const redoAt = process.argv.indexOf('--redo');
const redo = new Set(redoAt >= 0 ? process.argv.slice(redoAt + 1).map(Number).filter(Boolean) : []);
const PYTHON = process.env.CIVIC_PYTHON || 'C:\\Program Files\\Python314\\python.exe';

// Render the first MAX_PAGES pages of a scanned PDF to PNG. Returns the image
// paths, or [] if PyMuPDF is not available.
function renderPages(attId) {
  const pdf = path.join(WORK, 'pdf', `${attId}.pdf`);
  if (!fs.existsSync(pdf)) return [];
  fs.mkdirSync(IMG, { recursive: true });
  const existing = fs.readdirSync(IMG).filter((f) => f.startsWith(`${attId}-`)).sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));
  if (existing.length) return existing.map((f) => path.join(IMG, f));
  const script = [
    'import fitz, sys',
    'd = fitz.open(sys.argv[1])',
    `for i, p in enumerate(d):`,
    `    if i >= ${MAX_PAGES}: break`,
    '    out = f"{sys.argv[2]}-{i + 1}.png"',
    '    p.get_pixmap(dpi=110).save(out)',
    '    print(out)',
  ].join('\n');
  try {
    return execFileSync(PYTHON, ['-c', script, pdf, path.join(IMG, String(attId))], { encoding: 'utf-8', timeout: 120000 })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function pdftotext() {
  for (const p of ['pdftotext', 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe']) {
    // pdftotext -v exits non-zero on some builds; only "not found" means absent.
    try { execFileSync(p, ['-v'], { stdio: 'ignore' }); return p; } catch (e) { if (e.code !== 'ENOENT') return p; }
  }
  return null;
}

async function extract(att, tool) {
  const out = path.join(TEXT, `${att.id}.txt`);
  if (fs.existsSync(out)) return out;
  if (!/\.pdf$/i.test(att.url) || !tool) return null;
  const res = await fetch(att.url, { headers: { 'User-Agent': 'civic-log/1.0 (+https://github.com/redfearn-group/civic-log)' }, signal: AbortSignal.timeout(120000) });
  await sleep(1000);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return null;
  const pdf = path.join(WORK, 'pdf', `${att.id}.pdf`);
  fs.mkdirSync(path.dirname(pdf), { recursive: true });
  fs.writeFileSync(pdf, buf);
  try {
    execFileSync(tool, ['-layout', pdf, out], { stdio: 'ignore', timeout: 120000 });
  } catch {
    return null;
  }
  return out;
}

const today = todayMountain();
const from = addDays(today, -BACKFILL_DAYS);
const summaries = loadSummaries();

// Meeting videos with captions on disk (written by scripts/videos.mjs).
const VIDEO = path.join(WORK, 'video');
function videoFor(id) {
  const v = readYaml(path.join(DATA, 'videos', `${id}.yaml`));
  if (!v) return null;
  const transcript = path.join(VIDEO, `${v.video}.txt`);
  const excerpts = path.join(VIDEO, `${v.video}.excerpts.txt`);
  if (!fs.existsSync(transcript)) return null;
  return { id: v.video, url: v.url, transcript: path.relative(ROOT, transcript), excerpts: path.relative(ROOT, excerpts) };
}
const videoChanged = (n) => { const v = videoFor(n.id); return !!v && summaries.get(n.id)?.video?.id !== v.id; };

const pending = loadNotices()
  .filter((n) => (n.start?.date ?? n.posted ?? '') >= from)
  .filter((n) => redo.has(n.id) || summaries.get(n.id)?.sourceHash !== n.hash || videoChanged(n))
  .sort((a, b) => (a.start?.date ?? '').localeCompare(b.start?.date ?? ''));

const tool = listOnly ? null : pdftotext();
fs.mkdirSync(TEXT, { recursive: true });
const out = [];
for (const n of pending) {
  const files = [];
  if (!listOnly) {
    for (const att of n.attachments.filter((a) => READ.test(a.name)).slice(0, MAX_ATTACHMENTS)) {
      try {
        const txt = await extract(att, tool);
        const chars = txt ? fs.readFileSync(txt, 'utf-8').replace(/\s+/g, '').length : 0;
        const scan = !!txt && chars < 200;
        const images = scan ? renderPages(att.id).map((p) => path.relative(ROOT, p)) : [];
        files.push({ attachment: att.id, name: att.name, url: att.url, text: txt ? path.relative(ROOT, txt) : null, scan, images });
      } catch (e) {
        files.push({ attachment: att.id, name: att.name, url: att.url, text: null, error: e.message });
      }
    }
  }
  out.push({
    id: n.id,
    body: n.body,
    bodyLabel: n.bodyLabel,
    date: n.start?.date ?? null,
    title: n.title,
    notice: path.relative(ROOT, path.join(ROOT, 'data', 'notices', String(n.body), `${n.id}.yaml`)),
    summary: path.relative(ROOT, path.join(ROOT, 'data', 'summaries', `${n.id}.yaml`)),
    hash: n.hash,
    reason: !summaries.has(n.id) ? 'new' : summaries.get(n.id).sourceHash !== n.hash ? 'changed' : videoChanged(n) ? 'video' : 'redo',
    files,
    video: videoFor(n.id),
  });
}
fs.writeFileSync(path.join(WORK, 'pending.json'), JSON.stringify({ generated: today, from, pdftotext: tool, pending: out }, null, 2));
for (const p of out) console.log(`${p.reason.padEnd(7)} ${p.id} ${p.date} ${p.bodyLabel}: ${p.title} (${p.files.length} files)`);
console.log(`PENDING=${out.length}`);
