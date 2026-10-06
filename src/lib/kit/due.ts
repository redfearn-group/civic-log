/* CANONICAL. Authored in redfearn-group/redfearn-brand under kit/ and
   vendored into each Astro app by sync.mjs. Do not edit the copy in a
   consumer repo: the next sync overwrites it, and the vendor drift CI job
   fails the build first. */

import { addMonths, daysBetween } from "./date";

export interface DateDueInput {
  /** YYYY-MM-DD the thing was last done. Null when it never has been. */
  lastDone: string | null | undefined;
  /** Months between services. Null for an item with no time interval. */
  intervalMonths: number | null | undefined;
  /** YYYY-MM-DD to evaluate against. Pass kit `today()`, or a fixed date
   *  in a test. Required rather than defaulted, so that a caller cannot
   *  accidentally reintroduce a UTC-derived "today". */
  today: string;
  /** How many days ahead counts as due soon. */
  dueSoonDays: number;
}

export interface DateDueResult {
  /** YYYY-MM-DD, or null when it cannot be computed. */
  dueDate: string | null;
  overdue: boolean;
  dueSoon: boolean;
}

/** The date half of a due-status calculation, and only the date half.
 *
 * Deliberately knows nothing about vehicles, home items, or irrigation
 * controllers. garage-log additionally computes a mileage-based due state
 * and ORs it with this result; that logic stays in garage-log, because the
 * moment this file knows what a vehicle is it stops being shared code.
 *
 * `overdue` and `dueSoon` are mutually exclusive: something already overdue
 * is not also due soon. */
export function dateDue({
  lastDone,
  intervalMonths,
  today,
  dueSoonDays,
}: DateDueInput): DateDueResult {
  if (!lastDone || intervalMonths == null) {
    return { dueDate: null, overdue: false, dueSoon: false };
  }

  const dueDate = addMonths(lastDone, intervalMonths);
  if (dueDate == null) {
    return { dueDate: null, overdue: false, dueSoon: false };
  }

  // String comparison is correct and intended for zero-padded ISO dates,
  // and avoids building Date objects just to compare two calendar days.
  const overdue = today >= dueDate;

  const days = daysBetween(today, dueDate);
  const dueSoon = !overdue && days != null && days <= dueSoonDays;

  return { dueDate, overdue, dueSoon };
}
