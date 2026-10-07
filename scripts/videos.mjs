// Find the meeting video for each recent meeting notice and pull its captions,
// so the summarizer can report motions, votes and staff reports the night of
// the meeting instead of waiting weeks for minutes. Local only: YouTube refuses
// caption downloads from most cloud IPs, so this does not run in Actions.
//
//   node scripts/videos.mjs           match videos and download captions
//   node scripts/videos.mjs --list    match only, no downloads
//
// A video comes from the notice itself (PMN's "Audio File Location", added by
// the city some days after the meeting) or, sooner, from the channel feeds in
// config/sources.yaml matched by title and date. Each match is recorded in
// data/videos/<notice>.yaml (committed, public: it is the city's own link).
// Captions go to work/video/: <id>.txt is the full timestamped transcript and
// <id>.excerpts.txt holds the passages around motions, votes and watch-topic
// keywords. Captions are YouTube's automatic ones: names and numbers can be
// misheard, which prompts/summarize.md tells the summarizer to allow for.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, DATA, readYaml, writeYaml, loadNotices, getText, decode, todayMountain, addDays } from './lib.mjs';

const BACKFILL_DAYS = 30;
const WORK = path.join(ROOT, 'work', 'video');
const VIDEOS = path.join(DATA, 'videos');
const PYTHON = process.env.CIVIC_PYTHON || 'C:\\Program Files\\Python314\\python.exe';
const listOnly = process.argv.includes('--list');
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n) => String(n).padStart(2, '0');

// Motions and votes, so every decision lands in the excerpts.
const VOTE = /\b(motion|i move|so moved|seconded|second by|roll call|all in favor|passes|carries|fails|tabled|to table|continue (it|this|the item)|the vote)\b/i;
const WINDOW_S = 45;

export function youtubeId(url) {
  const m = /[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})|\/live\/([\w-]{11})/.exec(url ?? '');
  return m ? m[1] || m[2] || m[3] : null;
}

// "Spanish Fork City Council - October 6, 2026" -> 2026-10-06
function titleDate(title) {
  const m = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\s*$/.exec(title);
  const mo = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return mo < 0 ? null : `${m[3]}-${pad(mo + 1)}-${pad(Number(m[2]))}`;
}

async function channelVideos(channels) {
  const out = [];
  for (const ch of channels) {
    let xml;
    try {
      xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channel}`);
    } catch (e) {
      console.log(`WARN  feed ${ch.channel}: ${e.message}`);
      continue;
    }
    for (const entry of xml.split('<entry>').slice(1)) {
      const id = /<yt:videoId>([^<]+)</.exec(entry)?.[1];
      const title = decode(/<title>([^<]*)</.exec(entry)?.[1] ?? '').trim();
      const match = ch.match.find((m) => new RegExp(m.title, 'i').test(title));
      const date = titleDate(title);
      if (id && match && date) out.push({ id, title, date, body: match.body });
    }
  }
  return out;
}

// The notice a video belongs to: the one already linking it, else the meeting
// notice for that body and date (not the separate hearing notices).
function pickNotice(candidates, id) {
  const linked = candidates.find((n) => youtubeId(n.video) === id);
  if (linked) return linked;
  const meetings = candidates.filter((n) => n.kind !== 'notice' && /meeting|agenda/i.test(n.title) && !/hearing notice|public notice/i.test(n.title));
  meetings.sort((a, b) => b.attachments.filter((x) => /agenda/i.test(x.name)).length - a.attachments.filter((x) => /agenda/i.test(x.name)).length
    || b.attachments.length - a.attachments.length);
  return meetings[0] ?? null;
}

const hms = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

// json3 captions -> [{ ms, text }], one entry per caption event.
function readCaptions(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return (j.events ?? [])
    .filter((e) => e.segs)
    .map((e) => ({ ms: e.tStartMs ?? 0, text: e.segs.map((s) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim() }))
    .filter((e) => e.text);
}

// Paragraphs of about 20 seconds, each starting with its timestamp.
function transcript(caps) {
  const out = [];
  let start = null, buf = [];
  for (const c of caps) {
    if (start === null) start = c.ms;
    buf.push(c.text);
    if (c.ms - start >= 20000) { out.push(`[${hms(start)}] ${buf.join(' ')}`); start = null; buf = []; }
  }
  if (buf.length) out.push(`[${hms(start)}] ${buf.join(' ')}`);
  return out.join('\n');
}

function excerpts(caps, keywords) {
  const kw = keywords.length ? new RegExp(keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i') : null;
  const ranges = [];
  for (const c of caps) {
    if (VOTE.test(c.text) || kw?.test(c.text)) {
      const a = c.ms - WINDOW_S * 1000, b = c.ms + WINDOW_S * 1000;
      const last = ranges.at(-1);
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else ranges.push([a, b]);
    }
  }
  return ranges
    .map(([a, b]) => {
      const text = caps.filter((c) => c.ms >= a && c.ms <= b).map((c) => c.text).join(' ');
      return `--- ${hms(Math.max(a, 0))} to ${hms(b)}\n${text}`;
    })
    .join('\n\n');
}

function download(id) {
  const json = path.join(WORK, `${id}.en.json3`);
  if (fs.existsSync(json)) return json;
  execFileSync(PYTHON, ['-m', 'yt_dlp', '--skip-download', '--write-auto-subs', '--write-subs', '--sub-langs', 'en',
    '--sub-format', 'json3', '--no-warnings', '-q', '-o', path.join(WORK, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${id}`],
    { stdio: 'ignore', timeout: 300000 });
  return fs.existsSync(json) ? json : null;
}

const cfg = readYaml(path.join(ROOT, 'config', 'sources.yaml'), {});
const interests = readYaml(path.join(ROOT, 'config', 'interests.yaml'), { watch: [] });
const keywords = interests.watch.flatMap((w) => w.keywords ?? []);
const today = todayMountain();
const from = addDays(today, -BACKFILL_DAYS);
const bodies = new Set((cfg.videos ?? []).flatMap((c) => c.match.map((m) => m.body)));
// Only meetings that have happened: a stream still live has partial captions.
const recent = loadNotices().filter((n) => bodies.has(n.body) && n.start?.date >= from && n.start.date < today);

const found = new Map(); // notice id -> { id, title, from }
for (const n of recent) {
  const id = youtubeId(n.video);
  if (id) found.set(n.id, { id, title: null, from: 'pmn' });
}
for (const v of await channelVideos(cfg.videos ?? [])) {
  if (v.date < from || v.date >= today) continue;
  const n = pickNotice(recent.filter((x) => x.body === v.body && x.start.date === v.date), v.id);
  if (!n) { console.log(`WARN  no notice for ${v.id} "${v.title}"`); continue; }
  const have = found.get(n.id);
  if (!have) found.set(n.id, { id: v.id, title: v.title, from: 'channel' });
  else if (have.id === v.id) have.title = v.title;
}

fs.mkdirSync(WORK, { recursive: true });
let ready = 0;
for (const [notice, v] of found) {
  const file = path.join(VIDEOS, `${notice}.yaml`);
  const prev = readYaml(file);
  if (prev?.video !== v.id) {
    writeYaml(file, { notice, video: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, title: v.title ?? prev?.title ?? null, from: v.from, found: today });
  }
  let status = 'listed';
  if (!listOnly) {
    try {
      const json = download(v.id);
      if (json) {
        const caps = readCaptions(json);
        fs.writeFileSync(path.join(WORK, `${v.id}.txt`), transcript(caps), 'utf-8');
        fs.writeFileSync(path.join(WORK, `${v.id}.excerpts.txt`), excerpts(caps, keywords), 'utf-8');
        status = `captions ${hms(caps.at(-1)?.ms ?? 0)}`;
        ready++;
      } else status = 'no captions yet';
    } catch (e) {
      status = `caption download failed: ${e.message.split('\n')[0]}`;
    }
  }
  console.log(`${String(notice).padEnd(8)} ${v.id} (${v.from}) ${status}`);
}
console.log(`VIDEOS=${found.size} TRANSCRIPTS=${ready}`);
