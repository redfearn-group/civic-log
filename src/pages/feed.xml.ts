import type { APIRoute } from "astro";
import { getEntries } from "../lib/data";

// RSS 2.0 feed of the 50 most recently written summaries.

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// RFC 822 date for a YYYY-MM-DD, at noon UTC so no reader shifts the day.
function rfc822(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toUTCString();
}

export const GET: APIRoute = ({ site }) => {
  const base = new URL(import.meta.env.BASE_URL.replace(/\/?$/, "/"), site);
  const items = getEntries()
    .filter((e) => e.summary && e.summary.score >= 2)
    .sort((a, b) => b.summary!.summarized.localeCompare(a.summary!.summarized) || b.date.localeCompare(a.date))
    .slice(0, 50)
    .map((e) => {
      const s = e.summary!;
      const link = new URL(`notice/${e.notice.id}`, base).href;
      const prefix = s.attend ? "Attend: " : "";
      return `    <item>
      <title>${x(`${prefix}${e.body?.short ?? e.notice.bodyLabel}, ${s.headline}`)}</title>
      <link>${x(link)}</link>
      <guid isPermaLink="false">pmn-${e.notice.id}-${s.sourceHash}</guid>
      <pubDate>${rfc822(s.summarized)}</pubDate>
      <description>${x(`${s.attendWhy ? s.attendWhy + " " : ""}${s.summary}`)}</description>
    </item>`;
    });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Civic Log</title>
    <link>${x(base.href)}</link>
    <description>Short summaries of Spanish Fork and Utah County public meetings.</description>
    <language>en-us</language>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
