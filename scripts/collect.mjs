// Collect notices from the Utah Public Notice Website for every active body in
// config/sources.yaml. Writes data/notices/<body>/<noticeId>.yaml and rewrites a
// file only when its content changes, so the git history is the change log.
// No AI here: this runs daily in GitHub Actions.
//
//   node scripts/collect.mjs            all active bodies
//   node scripts/collect.mjs 5 6        only these body ids
import path from 'node:path';
import { DATA, PMN, getText, sha, htmlToLines, oneLine, parsePmnDate, readYaml, writeYaml, loadBodies, todayMountain } from './lib.mjs';

function field(html, label) {
  // <dt>Label</dt> followed by <dd>...</dd>
  const re = new RegExp(`<dt>\\s*${label}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`, 'i');
  return re.exec(html)?.[1] ?? null;
}

function parseNotice(html, id, body) {
  // The site header is also an <h1> ("Utah.gov"); the notice title is the last one.
  const h1s = [...html.matchAll(/<h1>([\s\S]*?)<\/h1>/gi)].map((m) => oneLine(m[1]));
  const title = h1s[h1s.length - 1] ?? '';
  const types = oneLine(field(html, 'Notice Type\\(s\\)')).split(/\s*,\s*/).filter(Boolean);
  const tags = oneLine(field(html, 'Notice Tags')).split(/\s*,\s*/).filter(Boolean);
  const start = parsePmnDate(field(html, 'Event Start Date &amp; Time') ?? '');
  const agendaHtml = /<dd class="agenda">([\s\S]*?)<\/dd>/i.exec(html)?.[1] ?? '';
  const agenda = htmlToLines(agendaHtml);
  // Location only, never the contact person: the site publishes no staff names.
  const location = oneLine((field(html, 'Meeting Location') ?? '').replace(/<a[\s\S]*?<\/a>/gi, '')) || null;
  const posted = parsePmnDate(field(html, 'Notice Posted On') ?? '');
  const edited = parsePmnDate(field(html, 'Notice Last Edited On') ?? '');
  const video = decode1(/Audio File Location<\/dt>\s*<dd><a[^>]*href="([^"]+)"/i.exec(html)?.[1]);

  const attachments = [];
  const tableAt = html.indexOf('Download Attachments</caption>');
  if (tableAt >= 0) {
    const table = html.slice(tableAt, html.indexOf('</table>', tableAt));
    for (const row of table.split(/<tr>/i).slice(1)) {
      const a = /href="\/pmn\/files\/(\d+)\.(\w+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
      if (!a) continue;
      const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/gi)].map((c) => oneLine(c[1]));
      attachments.push({
        id: Number(a[1]),
        name: oneLine(a[3]),
        category: cells[1] || null,
        added: parsePmnDate(cells[2] ?? '')?.date ?? null,
        url: `${PMN}/pmn/files/${a[1]}.${a[2]}`,
      });
    }
  }

  const isHearing = /hearing/i.test(title) || /hearing/i.test(types.join(' '));
  const kind = isHearing ? 'hearing' : types.some((t) => /meeting/i.test(t)) ? 'meeting' : 'notice';

  const notice = {
    id,
    body: body.id,
    bodyLabel: body.label,
    title,
    kind,
    types,
    tags,
    start,
    location,
    posted: posted?.date ?? null,
    edited: edited?.date ?? null,
    url: `${PMN}/pmn/sitemap/notice/${id}.html`,
    video,
    attachments,
    agenda,
  };
  // Hash what matters for re-summarizing, not page chrome or fetch time.
  notice.hash = sha(JSON.stringify([title, start, agenda, video, attachments.map((x) => x.id)]));
  return notice;
}

function decode1(s) {
  return s ? s.replace(/&amp;/g, '&') : null;
}

async function collectBody(body) {
  const listing = await getText(`${PMN}/pmn/sitemap/publicbody/${body.id}.html`);
  const ids = [...new Set([...listing.matchAll(/\/pmn\/sitemap\/notice\/(\d+)\.html/g)].map((m) => Number(m[1])))];
  let added = 0, changed = 0, same = 0;
  for (const id of ids) {
    const file = path.join(DATA, 'notices', String(body.id), `${id}.yaml`);
    const old = readYaml(file);
    let notice;
    try {
      notice = parseNotice(await getText(`${PMN}/pmn/sitemap/notice/${id}.html`), id, body);
    } catch (e) {
      console.log(`  PROBLEM notice ${id}: ${e.message}`);
      continue;
    }
    if (old && old.hash === notice.hash) { same++; continue; }
    notice.firstSeen = old?.firstSeen ?? todayMountain();
    notice.lastChanged = todayMountain();
    writeYaml(file, notice);
    old ? changed++ : added++;
    console.log(`  ${old ? 'CHANGED' : 'NEW    '} ${id} ${notice.start?.date ?? '?'} ${notice.title}`);
  }
  return { added, changed, same, listed: ids.length };
}

const only = process.argv.slice(2).map(Number).filter(Boolean);
const bodies = loadBodies().filter((b) => !only.length || only.includes(b.id));
let totals = { added: 0, changed: 0, problems: 0 };
for (const body of bodies) {
  console.log(`${body.label} (PMN ${body.id})`);
  try {
    const r = await collectBody(body);
    totals.added += r.added;
    totals.changed += r.changed;
    console.log(`  listed ${r.listed}, new ${r.added}, changed ${r.changed}, unchanged ${r.same}`);
  } catch (e) {
    totals.problems++;
    console.log(`  PROBLEM ${e.message}`);
  }
}
console.log(`NEW=${totals.added} CHANGED=${totals.changed} PROBLEMS=${totals.problems}`);
if (totals.problems === bodies.length && bodies.length) process.exit(1);
