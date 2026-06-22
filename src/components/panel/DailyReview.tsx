/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useState } from "react";

import { type ReviewEntry, REVIEW_BATCH } from "../../lib/daily-review";
import {
  closePanel,
  emitDetailsAction,
  emitReviewAction,
  emitStatusAction,
} from "../../lib/panel";
import { type Assignee } from "../../lib/todos";
import { type CardResult, ReviewCard } from "./ReviewCard";

interface DailyReviewProps {
  /** The items to step through, each tagged with why it surfaced. */
  queue: ReviewEntry[];
  /** Active list id + media folder (abs path), for comment attachments. */
  listId: string;
  mediaDir: string;
  /** The list's assignee roster (unused for now; reserved for richer cards). */
  roster: Assignee[];
}

/**
 * The daily review: a Yahoo-catchup-style card stack over the items that need
 * attention today. One card per item - pick a new status, jot a quick comment,
 * snooze, or skip - reviewed in batches of {@link REVIEW_BATCH} with the option
 * to keep going. Each action routes back to the main window (which owns the
 * list); the queue snapshot is taken when the panel opens.
 */
export function DailyReview({ queue, listId, mediaDir }: DailyReviewProps) {
  const [cursor, setCursor] = useState(0);
  // How far into the queue this session is allowed to go (grows by a batch when
  // the reviewer chooses to keep going).
  const [limit, setLimit] = useState(REVIEW_BATCH);
  const [updated, setUpdated] = useState(0);
  const [skipped, setSkipped] = useState(0);

  const total = queue.length;
  const finished = cursor >= total;
  const batchBreak = !finished && cursor >= limit;

  const advance = () => setCursor((c) => c + 1);

  // Persist a card's pending status pick + comment back to the main window.
  // Shared by "Next" and "Snooze" so a comment typed on either is never lost.
  const applyEdits = (entry: ReviewEntry, { state, comment }: CardResult): boolean => {
    let changed = false;
    if (state && state !== entry.item.state) {
      emitStatusAction({ itemId: entry.item.id, type: "set", state });
      changed = true;
    }
    if (comment) {
      const next = [
        ...(entry.item.comments ?? []),
        { id: crypto.randomUUID(), text: comment, createdAt: Date.now() },
      ];
      emitDetailsAction({ itemId: entry.item.id, comments: next });
      changed = true;
    }
    return changed;
  };

  const commit = (entry: ReviewEntry, result: CardResult) => {
    if (applyEdits(entry, result)) setUpdated((u) => u + 1);
    advance();
  };

  const snooze = (entry: ReviewEntry, result: CardResult) => {
    applyEdits(entry, result);
    emitReviewAction({ itemId: entry.item.id, days: 1 });
    setUpdated((u) => u + 1);
    advance();
  };

  const skip = () => {
    setSkipped((s) => s + 1);
    advance();
  };

  if (finished) {
    return <Summary updated={updated} skipped={skipped} onClose={closePanel} />;
  }

  if (batchBreak) {
    return (
      <BatchBreak
        reviewed={cursor}
        remaining={total - cursor}
        onMore={() => setLimit((l) => l + REVIEW_BATCH)}
        onClose={closePanel}
      />
    );
  }

  const entry = queue[cursor];
  return (
    <ReviewCard
      // Key by item so the card's local draft (status + comment) resets per item.
      key={entry.item.id}
      entry={entry}
      position={cursor + 1}
      total={total}
      listId={listId}
      mediaDir={mediaDir}
      onCommit={(result) => commit(entry, result)}
      onSnooze={(result) => snooze(entry, result)}
      onSkip={skip}
    />
  );
}

/** Shown after a batch of {@link REVIEW_BATCH}, offering to keep going. */
function BatchBreak({
  reviewed,
  remaining,
  onMore,
  onClose,
}: {
  reviewed: number;
  remaining: number;
  onMore: () => void;
  onClose: () => void;
}) {
  return (
    <Stack gap="md" w={440} align="center" py="sm">
      <Title order={5}>Reviewed {reviewed}</Title>
      <Text size="sm" c="dimmed" ta="center">
        {remaining} more {remaining === 1 ? "item" : "items"} waiting. Keep going?
      </Text>
      <Group gap={8}>
        <Button size="xs" variant="default" onClick={onClose}>
          Done for now
        </Button>
        <Button size="xs" onClick={onMore}>
          Review {Math.min(REVIEW_BATCH, remaining)} more
        </Button>
      </Group>
    </Stack>
  );
}

/** The closing card: nothing left to review. */
function Summary({
  updated,
  skipped,
  onClose,
}: {
  updated: number;
  skipped: number;
  onClose: () => void;
}) {
  return (
    <Stack gap="md" w={440} align="center" py="md">
      <IconCheck size={32} stroke={2} color="var(--mantine-color-green-6)" />
      <Title order={5}>All caught up</Title>
      <Text size="sm" c="dimmed" ta="center">
        {updated} updated · {skipped} skipped
      </Text>
      <Button size="xs" onClick={onClose}>
        Close
      </Button>
    </Stack>
  );
}
