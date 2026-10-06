/* CANONICAL. Authored in redfearn-group/redfearn-brand under kit/ and
   vendored into each Astro app by sync.mjs. Do not edit the copy in a
   consumer repo: the next sync overwrites it, and the vendor drift CI job
   fails the build first. */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** Format a YYYY-MM-DD string as "DD MMM YYYY" (e.g. "19 Jun 2023").
 * Returns the input unchanged if it isn't a plain YYYY-MM-DD date string.
 *
 * `empty` is what to return for null, undefined, or "". Defaults to "".
 * Pass `{ empty: "—" }` for a table cell, which is the house convention for
 * a missing value and was being re-implemented as a local wrapper in three
 * separate pages before it lived here.
 *
 * Parsed by regex rather than through `new Date(str)` on purpose. The Date
 * constructor reads a bare "2026-06-14" as UTC midnight and then renders it
 * in local time, which west of Greenwich prints the previous day. Every
 * date in these repos is a calendar date with no time component, so it
 * should never travel through a timezone at all. */
export function formatDate(
  dateStr: string | null | undefined,
  opts: { empty?: string } = {}
): string {
  const empty = opts.empty ?? "";
  if (!dateStr) return empty;
  const match = ISO_DATE.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Format a YYYY-MM (or YYYY-MM-DD) string as "MMM YYYY" (e.g. "Jun 2026").
 * For values recorded at month precision: a water bill's month, a planting
 * date where nobody wrote down the day.
 *
 * Returns `empty` for a blank value, and the input unchanged if it does not
 * start with YYYY-MM. */
export function formatMonth(
  monthStr: string | null | undefined,
  opts: { empty?: string } = {}
): string {
  const empty = opts.empty ?? "";
  if (!monthStr) return empty;
  const match = /^(\d{4})-(\d{2})/.exec(monthStr);
  if (!match) return monthStr;
  const [, year, month] = match;
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** Parse a YYYY-MM-DD string into a Date at LOCAL midnight, for date
 * arithmetic (intervals, due dates, age). Returns null if it isn't a plain
 * YYYY-MM-DD string. Same timezone reasoning as formatDate. */
export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const match = ISO_DATE.exec(dateStr);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** Add `months` to a YYYY-MM-DD string, returning YYYY-MM-DD. Negative
 * values subtract. Returns null if the input isn't a plain date string.
 *
 * OVERFLOWS RATHER THAN CLAMPS, matching the three separate implementations
 * this replaced: 2026-01-31 plus one month is 2026-03-03, not 2026-02-28,
 * because day 31 of February rolls forward. Preserved deliberately so that
 * consolidating these functions did not silently move any due date. Whether
 * overflow is the right behaviour for a maintenance interval is a separate
 * question worth answering on its own, not as a side effect of a refactor. */
export function addMonths(
  dateStr: string | null | undefined,
  months: number
): string | null {
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from `from` to `to`, positive when `to` is later. Both are
 * YYYY-MM-DD strings. Returns null if either fails to parse.
 *
 * Callers that sort on the result should coalesce to
 * Number.POSITIVE_INFINITY rather than 0, so an unparseable date sorts to
 * the end of an "upcoming" list instead of the top of it. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Today as YYYY-MM-DD in local time.
 *
 * Use instead of `new Date().toISOString().slice(0, 10)`, which is UTC and
 * therefore returns TOMORROW after 18:00 Mountain. That matters more than
 * the local clock suggests: these sites build in GitHub Actions, which runs
 * in UTC, so an evening deploy computed due status against the wrong day. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
