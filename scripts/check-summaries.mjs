// Validate every summary against prompts/summarize.md before it is committed.
// Exits 1 on any error, so the summarizer task and CI both stop on a bad file.
//
//   node scripts/check-summaries.mjs           all summaries
//   node scripts/check-summaries.mjs 1111313   only these notice ids
import path from 'node:path';
import { ROOT, readYaml, loadNotices, loadSummaries } from './lib.mjs';

const interests = readYaml(path.join(ROOT, 'config', 'interests.yaml'));
const TAGS = new Set(interests.tags.map((t) => t.id));
const WATCH = new Set(interests.watch.map((w) => w.id));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EM_DASH = /—/;
const TIME = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;

const notices = new Map(loadNotices().map((n) => [n.id, n]));
const only = new Set(process.argv.slice(2).map(Number).filter(Boolean));
let errors = 0, warnings = 0, checked = 0;

function walkStrings(v, fn, at = '') {
  if (typeof v === 'string') fn(v, at);
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, fn, `${at}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkStrings(x, fn, at ? `${at}.${k}` : k);
}

for (const [id, s] of loadSummaries()) {
  if (only.size && !only.has(id)) continue;
  checked++;
  const err = (m) => { errors++; console.log(`ERROR ${id}: ${m}`); };
  const warn = (m) => { warnings++; console.log(`WARN  ${id}: ${m}`); };
  const n = notices.get(id);
  if (!n) { err('no matching notice in data/notices'); continue; }

  if (s.sourceHash !== n.hash) warn('stale: notice changed since this summary was written');
  if (!['claude-local', 'claude-api'].includes(s.engine)) err(`engine must be claude-local or claude-api, got ${s.engine}`);
  if (!s.model) err('model is missing');
  if (!ISO.test(String(s.summarized))) err('summarized must be YYYY-MM-DD');
  if (!s.headline || s.headline.length > 90) err(`headline missing or over 90 characters (${s.headline?.length})`);
  if (!s.summary) err('summary is missing');
  if (!Array.isArray(s.items)) err('items must be a list');
  if (!Number.isInteger(s.score) || s.score < 1 || s.score > 5) err('score must be 1 to 5');
  if (!Array.isArray(s.sources) || !s.sources.length || s.sources[0].url !== n.url) err('first source must be the PMN notice url');

  const itemTags = new Set(), itemWatch = new Set();
  for (const [i, it] of (s.items ?? []).entries()) {
    if (!it.title || it.title.length > 60) err(`items[${i}].title missing or over 60 characters`);
    if (!it.what || it.what.length > 200) err(`items[${i}].what missing or over 200 characters`);
    for (const t of it.tags ?? []) { if (!TAGS.has(t)) err(`items[${i}] unknown tag ${t}`); itemTags.add(t); }
    for (const w of it.watch ?? []) { if (!WATCH.has(w)) err(`items[${i}] unknown watch ${w}`); itemWatch.add(w); }
    if (typeof it.hearing !== 'boolean') err(`items[${i}].hearing must be true or false`);
    if (typeof it.applicant !== 'boolean') err(`items[${i}].applicant must be true or false`);
    if (it.resultFrom != null && !['minutes', 'video'].includes(it.resultFrom)) err(`items[${i}].resultFrom must be minutes or video`);
    if (it.resultFrom === 'video' && !s.video) err(`items[${i}] has a video result but the summary has no video`);
    if (it.resultFrom && !it.result) err(`items[${i}].resultFrom is set but result is empty`);
    if (it.at != null && !TIME.test(String(it.at))) err(`items[${i}].at must be m:ss or h:mm:ss`);
    if (it.at != null && !s.video) err(`items[${i}].at needs a summary video`);
  }
  if (s.video) {
    if (!/^[\w-]{11}$/.test(String(s.video.id))) err('video.id must be an 11-character YouTube id');
    if (s.video.url !== `https://www.youtube.com/watch?v=${s.video.id}`) err('video.url must be the watch url for video.id');
    const v = readYaml(path.join(ROOT, 'data', 'videos', `${id}.yaml`));
    if (v && v.video !== s.video.id) warn(`video ${s.video.id} differs from data/videos (${v.video})`);
  }
  if ((s.items ?? []).length > 12) err('more than 12 items');
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  if (!same(new Set(s.tags ?? []), itemTags)) err('tags must equal the union of item tags');
  if (!same(new Set(s.watch ?? []), itemWatch)) err('watch must equal the union of item watch ids');

  if (s.hearing && !ISO.test(String(s.hearing.date))) err('hearing.date must be YYYY-MM-DD');
  // Attend can only be judged against the date the summary was written.
  const upcoming = (n.start?.date ?? '') >= String(s.summarized);
  const shouldAttend = upcoming && ((!!s.hearing && s.score >= 4) || (s.watch ?? []).length > 0);
  if (!!s.attend !== shouldAttend) err(`attend should be ${shouldAttend} under the attend rule`);
  if (s.attend && !s.attendWhy) err('attendWhy is required when attend is true');

  walkStrings(s, (v, at) => { if (EM_DASH.test(v)) err(`em-dash in ${at}`); });
}

console.log(`CHECKED=${checked} ERRORS=${errors} WARNINGS=${warnings}`);
process.exit(errors ? 1 : 0);
