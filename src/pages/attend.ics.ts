import type { APIRoute } from "astro";
import { getEntries } from "../lib/data";

// Calendar feed of every meeting marked Attend. Subscribe once in Google
// Calendar (Other calendars, From URL); Google refreshes subscribed feeds
// on its own schedule, typically within a day.

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545: lines longer than 75 octets fold with CRLF + space.
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf-8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf-8") > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const compact = (d: string) => d.replace(/-/g, "");
function addHours(date: string, time: string, h: number): string {
  const [hh, mm] = time.split(":").map(Number);
  const end = Math.min(hh + h, 23);
  return `${compact(date)}T${String(end).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
}
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Denver",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0600",
  "TZNAME:MDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0600",
  "TZOFFSETTO:-0700",
  "TZNAME:MST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export const GET: APIRoute = ({ site }) => {
  const base = new URL(import.meta.env.BASE_URL.replace(/\/?$/, "/"), site);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  // One event per body and date: a meeting often has an agenda notice plus
  // separate hearing notices, and four events for one evening is noise.
  const groups = new Map<string, ReturnType<typeof getEntries>>();
  for (const e of getEntries().filter((e) => e.summary?.attend && e.date)) {
    const key = `${e.notice.body}|${e.date}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const events = [...groups.values()].flatMap((rows) => {
    rows.sort((a, b) => b.summary!.score - a.summary!.score || (a.time ?? "").localeCompare(b.time ?? ""));
    const e = rows[0];
    const s = e.summary!;
    const link = new URL(`notice/${e.notice.id}`, base).href;
    // Earliest stated time among the grouped notices.
    const t = rows.map((r) => r.time).filter(Boolean).sort()[0] ?? null;
    const when = t
      ? [`DTSTART;TZID=America/Denver:${compact(e.date)}T${t.replace(":", "")}00`, `DTEND;TZID=America/Denver:${addHours(e.date, t, 2)}`]
      : [`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`];
    const more = rows.length > 1 ? ` (+${rows.length - 1} more)` : "";
    const details = rows
      .map((r) => `${r.summary!.attendWhy ?? r.summary!.headline}\n${new URL(`notice/${r.notice.id}`, base).href}`)
      .join("\n\n");
    return [
      "BEGIN:VEVENT",
      `UID:${e.notice.body}-${e.date}@civic-log.redfearn.group`,
      `DTSTAMP:${stamp}`,
      ...when,
      `SUMMARY:${esc(`Attend: ${e.body?.short ?? e.notice.bodyLabel}, ${s.headline}${more}`)}`,
      `DESCRIPTION:${esc(`${s.summary}\n\n${details}\n\nNotice: ${e.notice.url}\nAI summary. Check the source.`)}`,
      ...(e.notice.location ? [`LOCATION:${esc(e.notice.location)}`] : []),
      `URL:${link}`,
      "END:VEVENT",
    ];
  });
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Redfearn Group//Civic Log//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Civic Log: Attend",
    "X-WR-TIMEZONE:America/Denver",
    ...VTIMEZONE,
    ...events,
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n");
  return new Response(body + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
};
