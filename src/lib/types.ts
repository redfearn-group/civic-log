// Shapes of the YAML in data/. Every field here renders publicly.

export interface Attachment {
  id: number;
  name: string;
  category: string | null;
  added: string | null;
  url: string;
}

export interface Notice {
  id: number;
  body: number;
  bodyLabel: string;
  title: string;
  kind: "hearing" | "meeting" | "notice";
  types: string[];
  tags: string[];
  start: { date: string; time: string | null } | null;
  location: string | null;
  posted: string | null;
  edited: string | null;
  url: string;
  video: string | null;
  attachments: Attachment[];
  agenda: string;
  hash: string;
  firstSeen: string;
  lastChanged: string;
}

export interface SummaryItem {
  title: string;
  what: string;
  tags?: string[];
  watch?: string[];
  hearing: boolean;
  applicant: boolean;
  result?: string | null;
  /** Where result came from. Absent means minutes. A video result is unofficial until minutes are adopted. */
  resultFrom?: "minutes" | "video";
  /** Timestamp in the meeting video, m:ss or h:mm:ss. */
  at?: string;
}

export interface Summary {
  notice: number;
  sourceHash: string;
  engine: "claude-local" | "claude-api";
  model: string;
  summarized: string;
  headline: string;
  summary: string;
  items: SummaryItem[];
  tags: string[];
  watch: string[];
  score: number;
  hearing: { date: string; time?: string | null } | null;
  attend: boolean;
  attendWhy: string | null;
  basis: string;
  sources: { label: string; url: string }[];
  /** The meeting video whose captions this summary used. */
  video?: { id: string; url: string } | null;
}

export interface Body {
  id: number;
  label: string;
  short: string;
  tier: "home" | "county" | "neighbor" | "region";
  active: boolean;
}

export interface Topic {
  id: string;
  label: string;
  about?: string;
  why?: string;
  keywords?: string[];
}

/** A notice joined with its summary, which may not exist yet. */
export interface Entry {
  notice: Notice;
  summary: Summary | null;
  body: Body | undefined;
  date: string;
  time: string | null;
  stale: boolean;
}
