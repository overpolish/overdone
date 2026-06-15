/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Internal daily-review state (not a user preference - see lib/settings for the
 * on/off toggle). Tracks the last calendar day the banner was acted on so it
 * nudges at most once a day.
 */
interface DailyReviewState {
  /** Day key (see daily-review `dayKey`) the banner was last started or
   * dismissed. The banner stays hidden for that day and returns the next. Null
   * until the first interaction. */
  seenDate: string | null;
  /** Record that the banner was acted on for `day` (start or dismiss). */
  markSeen: (day: string) => void;
}

export const useDailyReviewState = create<DailyReviewState>()(
  persist(
    (set) => ({
      seenDate: null,
      markSeen: (seenDate) => set({ seenDate }),
    }),
    {
      name: "overdone-daily-review",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
