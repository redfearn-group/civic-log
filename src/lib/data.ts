import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, readYaml } from "./kit/yaml";
import type { Body, Entry, Notice, Summary, Topic } from "./types";

const ROOT = path.resolve(DATA_DIR, "..");

export function getBodies(): Body[] {
  return readYaml<{ bodies: Body[] }>(path.join(ROOT, "config", "sources.yaml"), { bodies: [] }).bodies;
}

export function getInterests(): { tags: Topic[]; watch: Topic[] } {
  return readYaml(path.join(ROOT, "config", "interests.yaml"), { tags: [], watch: [] });
}

function readDir<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => readYaml<T | null>(path.join(dir, f), null))
    .filter((x): x is T => x !== null);
}

let cache: Entry[] | null = null;

/** Every notice joined with its summary, newest event first. */
export function getEntries(): Entry[] {
  if (cache) return cache;
  const bodies = new Map(getBodies().map((b) => [b.id, b]));
  const summaries = new Map(readDir<Summary>(path.join(DATA_DIR, "summaries")).map((s) => [Number(s.notice), s]));
  const notices: Notice[] = [];
  const noticeRoot = path.join(DATA_DIR, "notices");
  if (fs.existsSync(noticeRoot)) {
    for (const d of fs.readdirSync(noticeRoot)) notices.push(...readDir<Notice>(path.join(noticeRoot, d)));
  }
  cache = notices
    .map((notice) => {
      const summary = summaries.get(notice.id) ?? null;
      return {
        notice,
        summary,
        body: bodies.get(notice.body),
        date: summary?.hearing?.date ?? notice.start?.date ?? notice.posted ?? "",
        time: summary?.hearing?.time ?? notice.start?.time ?? null,
        stale: !!summary && summary.sourceHash !== notice.hash,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.notice.id - a.notice.id);
  return cache;
}

/** Today in Mountain time. The site builds in GitHub Actions on UTC, where
 * the kit's local-time today() would roll over at 18:00 Mountain. */
export function todayMountain(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "18:20" -> "6:20 PM" */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function tagLabel(id: string): string {
  return getInterests().tags.find((t) => t.id === id)?.label ?? id;
}

export function watchLabel(id: string): string {
  return getInterests().watch.find((t) => t.id === id)?.label ?? id;
}
