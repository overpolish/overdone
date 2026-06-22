/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Text } from "@mantine/core";
import { IconChecklist, IconPlayerPlay, IconX } from "@tabler/icons-react";

import { useDailyReviewState } from "../../lib/daily-review-state";
import { dayKey, getReviewQueue } from "../../lib/daily-review";
import { openReviewPanel } from "../../lib/panel";
import { useSettings } from "../../lib/settings";
import { useTodos } from "../../lib/todos";
import { IconButton } from "../ui/IconButton";

/**
 * A slim prompt above the list that there are items to catch up on today
 * (overdue, due, fired reminders, stale work). Starting it opens the daily
 * review panel; the count is live, so it clears itself once the queue is worked
 * down. Shown at most once a calendar day: starting or dismissing marks today
 * seen, and it returns the next day. Off in settings hides it entirely.
 */
export function DailyReviewBanner() {
  const items = useTodos((s) => s.items);
  const enabled = useSettings((s) => s.dailyReview);
  const seenDate = useDailyReviewState((s) => s.seenDate);
  const markSeen = useDailyReviewState((s) => s.markSeen);

  const now = Date.now();
  const today = dayKey(now);
  // Recomputed as items change so the count stays live and the banner vanishes
  // once everything's handled. The panel takes its own snapshot on open.
  const count = getReviewQueue(items, now).length;

  if (!enabled || count === 0 || seenDate === today) return null;

  return (
    <Group
      gap={6}
      wrap="nowrap"
      px={8}
      py={4}
      style={{
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-default)",
      }}
    >
      <IconChecklist
        size={14}
        stroke={1.8}
        style={{ display: "block", color: "var(--mantine-color-dimmed)" }}
      />
      <Text size="xs" c="dimmed" style={{ flex: 1 }}>
        {count} {count === 1 ? "item needs" : "items need"} review
      </Text>
      <Box style={{ display: "flex" }}>
        <IconButton
          label="Start review"
          icon={IconPlayerPlay}
          onClick={() => {
            markSeen(today);
            void openReviewPanel();
          }}
        />
      </Box>
      <Box style={{ display: "flex" }}>
        <IconButton label="Dismiss" icon={IconX} danger onClick={() => markSeen(today)} />
      </Box>
    </Group>
  );
}
