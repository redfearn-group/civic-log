// Open one GitHub Issue per upcoming meeting that has Attend items, so GitHub
// emails it the same day. Notices for the same body on the same date are
// grouped into one issue. Never alerts the same notice twice: each title ends
// with [pmn <id> <id>...] and ids already alerted are skipped.
//
//   node scripts/alerts.mjs --dry-run    print what would be opened
import { execFileSync } from 'node:child_process';
import { loadNotices, loadSummaries, todayMountain } from './lib.mjs';
import { ddMmm, time12, siteUrl, shortBody } from './format.mjs';

const dry = process.argv.includes('--dry-run');
const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf-8', input });

const today = todayMountain();
const summaries = loadSummaries();
const due = loadNotices()
  .map((n) => {
    const s = summaries.get(n.id);
    return { n, s, date: s?.hearing?.date ?? n.start?.date ?? '', time: s?.hearing?.time ?? n.start?.time ?? null };
  })
  .filter((r) => r.s?.attend && r.date >= today);

const alerted = new Set();
if (!dry && due.length) {
  gh(['label', 'create', 'attend', '--color', 'B91C1C', '--description', 'Meeting worth attending', '--force']);
  const titles = gh(['issue', 'list', '--label', 'attend', '--state', 'all', '--limit', '500', '--json', 'title', '--jq', '.[].title']);
  for (const m of titles.matchAll(/\[pmn ([\d ]+)\]/g)) for (const id of m[1].split(' ')) alerted.add(Number(id));
}

const groups = new Map();
for (const r of due.filter((r) => !alerted.has(r.n.id))) {
  const key = `${r.n.body}|${r.date}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

let opened = 0;
for (const rows of groups.values()) {
  rows.sort((a, b) => b.s.score - a.s.score);
  const { n, date } = rows[0];
  const ids = rows.map((r) => r.n.id);
  const headline = rows[0].s.headline + (rows.length > 1 ? ` (+${rows.length - 1} more)` : '');
  const title = `Attend ${ddMmm(date)}: ${shortBody(n)}, ${headline} [pmn ${ids.join(' ')}]`;
  const body = rows
    .map(({ n, s, time }) => [
      `### ${s.headline}`,
      `**${time12(time)}${n.location ? `, ${n.location}` : ''}.** ${s.attendWhy}`,
      '',
      s.summary,
      '',
      ...s.items.filter((i) => i.hearing || (i.watch ?? []).length).map((i) => `- **${i.title}:** ${i.what}`),
      '',
      `Summary: ${siteUrl(`notice/${n.id}`)} · Notice: ${n.url}`,
    ].join('\n'))
    .concat(['_AI summary of public notices. Check the source before relying on it._'])
    .join('\n\n');
  if (dry) {
    console.log(`WOULD OPEN ${title}\n${body}\n`);
  } else {
    gh(['issue', 'create', '--title', title, '--label', 'attend', '--body-file', '-'], body);
    console.log(`OPENED ${title}`);
  }
  opened++;
}
console.log(`ATTEND_UPCOMING=${due.length} OPENED=${opened}`);
