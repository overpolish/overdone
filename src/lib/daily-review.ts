/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import dayjs from "dayjs";

import { isStruck } from "./todo";
import { type TodoData } from "./todos";

/**
 * Why an item surfaced in the daily review. Listed in priority order: an item
 * can match several reasons but the first one (the most urgent) leads its card.
 */
export type ReviewReason = "overdue" | "fired" | "today" | "stale";

/** Priority order for reasons - lower index wins the card's lead chip and sort. */
const REASON_ORDER: readonly ReviewReason[] = ["overdue", "fired", "today", "stale"];

/** An item to review, tagged with every reason it qualified under (most urgent
 * first). The card shows the reasons as chips and sorts by the leading one. */
export interface ReviewEntry {
  item: TodoData;
  reasons: ReviewReason[];
}

/** Items reviewed in one pass before offering "Review N more". */
export const REVIEW_BATCH = 5;

/** Local calendar-day key (e.g. "2026-06-15") for `now`. Used to show the
 * banner at most once a day: it's marked seen under today's key and returns
 * once the key rolls over. */
export const dayKey = (now: number): string => dayjs(now).format("YYYY-MM-DD");

/** How long an active (in-progress / on-hold) item can sit untouched before the
 * review nudges it. A sensible default; later surfaced as a setting. */
export const DEFAULT_STALE_DAYS = 3;

/**
 * Every reason an item qualifies for review under, most-urgent first (empty if
 * it doesn't qualify). Resolved (done / cancelled) items never qualify - the
 * review is about things still needing attention. Due dates are date-only, so
 * compare whole days; staleness counts whole days since the last edit.
 */
export function reviewReasons(
  item: TodoData,
  now: number,
  staleDays = DEFAULT_STALE_DAYS,
): ReviewReason[] {
  if (isStruck(item.state)) return [];

  const reasons: ReviewReason[] = [];
  const today = dayjs(now).startOf("day");

  if (item.dueDate != null) {
    const due = dayjs(item.dueDate).startOf("day");
    if (due.isBefore(today)) reasons.push("overdue");
    else if (due.isSame(today)) reasons.push("today");
  }

  // A reminder that fired but was never acknowledged.
  if (item.notifiedAt != null) reasons.push("fired");

  // Active work that's gone quiet: in-progress / on-hold with no edit in a while.
  if (
    (item.state === "inProgress" || item.state === "onHold") &&
    item.updatedAt != null &&
    dayjs(today).diff(dayjs(item.updatedAt).startOf("day"), "day") >= staleDays
  ) {
    reasons.push("stale");
  }

  return reasons.sort((a, b) => REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b));
}

/**
 * Build the daily review queue: every item that needs attention today, ordered
 * by its most-urgent reason (overdue → fired → due-today → stale). Each item
 * appears once, carrying all of its reasons. Original list order breaks ties so
 * the queue is stable as the list is edited.
 */
export function getReviewQueue(
  items: TodoData[],
  now: number,
  staleDays = DEFAULT_STALE_DAYS,
): ReviewEntry[] {
  const entries = items
    .map((item) => ({ item, reasons: reviewReasons(item, now, staleDays) }))
    .filter((e) => e.reasons.length > 0);

  // Stable sort by leading-reason priority; map() preserved list order for ties.
  return entries.sort(
    (a, b) => REASON_ORDER.indexOf(a.reasons[0]) - REASON_ORDER.indexOf(b.reasons[0]),
  );
}
