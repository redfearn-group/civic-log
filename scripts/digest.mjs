// Weekly digest, posted as a GitHub Issue every Monday so GitHub emails it.
// Short by design: what to attend, what is coming, what happened.
//
//   node scripts/digest.mjs --dry-run    print the digest instead of posting
import { execFileSync } from 'node:child_process';
import { loadNotices, loadSummaries, todayMountain, addDays } from './lib.mjs';
import { ddMmm, ddMmmYyyy, time12, siteUrl, shortBody } from './format.mjs';

const dry = process.argv.includes('--dry-run');
const today = todayMountain();
const summaries = loadSummaries();
const rows = loadNotices().map((n) => {
  const s = summaries.get(n.id) ?? null;
  return { n, s, date: s?.hearing?.date ?? n.start?.date ?? '', time: s?.hearing?.time ?? n.start?.time ?? null };
});

const line = ({ n, s, date, time }) =>
  `- **${ddMmm(date)}${time ? `, ${time12(time)}` : ''}, ${shortBody(n)}:** [${s?.headline ?? n.title}](${siteUrl(`notice/${n.id}`)})`;

const next14 = rows.filter((r) => r.date >= today && r.date <= addDays(today, 14)).sort((a, b) => a.date.localeCompare(b.date));
const attend = next14.filter((r) => r.s?.attend);
const coming = next14.filter((r) => !r.s?.attend && (r.s?.score ?? 0) >= 3);
const happened = rows
  .filter((r) => r.date < today && r.date >= addDays(today, -7) && (r.s?.score ?? 0) >= 3)
  .sort((a, b) => b.date.localeCompare(a.date));
const unsummarized = rows.filter((r) => !r.s && r.date >= addDays(today, -30)).length;

const parts = [`Week of ${ddMmmYyyy(today)}. Full list: ${siteUrl()}`, ''];
parts.push('### Attend', attend.length ? attend.map((r) => `${line(r)}\n  ${r.s.attendWhy}`).join('\n') : 'Nothing flagged.', '');
parts.push('### Coming up (next 14 days)', coming.length ? coming.map(line).join('\n') : 'Nothing else above routine.', '');
parts.push('### Last 7 days', happened.length ? happened.map(line).join('\n') : 'Nothing above routine.', '');
if (unsummarized) parts.push(`_${unsummarized} recent notice(s) not summarized yet._`, '');
parts.push('_AI summaries of public notices. Check the source before relying on them._');
const body = parts.join('\n');
const title = `Civic Log: week of ${ddMmmYyyy(today)}`;

if (dry) {
  console.log(`${title}\n\n${body}`);
} else {
  const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf-8', input });
  gh(['label', 'create', 'digest', '--color', '6B7280', '--description', 'Weekly digest', '--force']);
  const existing = gh(['issue', 'list', '--label', 'digest', '--state', 'all', '--limit', '20', '--json', 'title', '--jq', '.[].title']);
  if (existing.includes(title)) {
    console.log('Digest for this week already posted.');
  } else {
    gh(['issue', 'create', '--title', title, '--label', 'digest', '--body-file', '-'], body);
    // Close it right away: the email is the point, not an open issue to track.
    const url = gh(['issue', 'list', '--label', 'digest', '--state', 'open', '--limit', '1', '--json', 'number', '--jq', '.[0].number']).trim();
    if (url) gh(['issue', 'close', url]);
    console.log(`POSTED ${title}`);
  }
}
