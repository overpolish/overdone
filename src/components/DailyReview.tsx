/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import {
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconChecklist,
  IconClockPause,
  IconPlayerTrackNext,
} from "@tabler/icons-react";
import { type Editor } from "@tiptap/react";
import { useRef, useState } from "react";

import { type ReviewEntry, type ReviewReason, REVIEW_BATCH } from "../lib/daily-review";
import { insertPastedFiles, pickAndInsert, toStoredHtml } from "../lib/media";
import {
  closePanel,
  emitDetailsAction,
  emitReviewAction,
  emitStatusAction,
} from "../lib/panel";
import { TODO_STATES, type TodoState } from "../lib/todo";
import { type Assignee } from "../lib/todos";
import {
  CommentInput,
  FormatBar,
  htmlIsEmpty,
  useCommentEditor,
} from "./CommentEditor";
import { useMediaBusy } from "./details/useMediaBusy";
import { StateBox } from "./StateBox";
import { STATUS_COLOR } from "./todo-item/itemStatus";

/** Badge label + accent per reason. The dated reasons reuse the exact
 * row-highlight tokens (see itemStatus `STATUS_COLOR`) so a card's chip matches
 * the item's tint in the list; staleness has no row accent, so it gets neutral
 * gray. */
const REASON_META: Record<ReviewReason, { label: string; color: string }> = {
  overdue: { label: "Overdue", color: STATUS_COLOR.overdue },
  fired: { label: "Reminder", color: STATUS_COLOR.notify },
  today: { label: "Due today", color: STATUS_COLOR.today },
  stale: { label: "Stale", color: "var(--mantine-color-gray-6)" },
};

interface DailyReviewProps {
  /** The items to step through, each tagged with why it surfaced. */
  queue: ReviewEntry[];
  /** Active list id + media folder (abs path), for comment attachments. */
  listId: string;
  mediaDir: string;
  /** The list's assignee roster (unused for now; reserved for richer cards). */
  roster: Assignee[];
}

/** The outcome a card commits when the reviewer moves on. */
interface CardResult {
  /** A new state, if the reviewer picked one (else keep as-is). */
  state?: TodoState;
  /** A comment to append, as stored HTML (empty = none). */
  comment: string;
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

interface ReviewCardProps {
  entry: ReviewEntry;
  position: number;
  total: number;
  listId: string;
  mediaDir: string;
  onCommit: (result: CardResult) => void;
  onSnooze: (result: CardResult) => void;
  onSkip: () => void;
}

function ReviewCard({
  entry,
  position,
  total,
  listId,
  mediaDir,
  onCommit,
  onSnooze,
  onSkip,
}: ReviewCardProps) {
  const [state, setState] = useState<TodoState>(entry.item.state);
  const [draft, setDraft] = useState("");
  const { busy, busyLabel, run } = useMediaBusy();
  const composerRef = useRef<Editor | null>(null);

  // The card's pending outcome - the chosen status plus the typed comment (if
  // any), normalized to stored HTML. Used by both "Next" and "Snooze".
  const gather = (): CardResult => {
    const stored = toStoredHtml(draft);
    return { state, comment: htmlIsEmpty(stored) ? "" : stored };
  };

  const composer = useCommentEditor({
    content: "",
    placeholder: "Add a quick comment…",
    onChange: setDraft,
    onSubmit: () => onCommit(gather()),
    onEscape: closePanel,
    onPasteFiles: (files) => {
      const ed = composerRef.current;
      if (ed) run(() => insertPastedFiles(ed, listId, mediaDir, files));
    },
  });
  composerRef.current = composer;

  return (
    <Stack gap="md" w={440}>
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap={8} wrap="nowrap" align="center">
          <IconChecklist size={18} stroke={1.8} style={{ display: "block" }} />
          <Title order={5}>Daily review</Title>
        </Group>
        <Text size="10px" c="dimmed">
          {position} of {total}
        </Text>
      </Group>

      <Stack gap={8}>
        <Group gap={6}>
          {entry.reasons.map((r) => (
            <Badge
              key={r}
              size="sm"
              // Mirror the row highlight exactly: accent-colored text on the same
              // faint 14% wash, rather than Mantine's computed light-variant shades.
              // Plus the faint accent border other badges carry (see lib/label).
              styles={{
                root: {
                  color: REASON_META[r].color,
                  background: `color-mix(in srgb, ${REASON_META[r].color} 14%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${REASON_META[r].color} 40%, transparent)`,
                },
              }}
            >
              {REASON_META[r].label}
            </Badge>
          ))}
        </Group>
        <Text size="sm" fw={500}>
          {entry.item.text || <Text span c="dimmed">Untitled item</Text>}
        </Text>
      </Stack>

      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed">
          STATUS
        </Text>
        <Group gap={4}>
          {TODO_STATES.map((s) => (
            <StateOption
              key={s.value}
              state={s.value}
              selected={s.value === state}
              onSelect={() => setState(s.value)}
            />
          ))}
        </Group>
      </Stack>

      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="center" h={22}>
          <Text size="xs" fw={600} c="dimmed">
            COMMENT
          </Text>
          <FormatBar
            editor={composer}
            onAddMedia={() => composer && run(() => pickAndInsert(composer, listId, mediaDir))}
          />
        </Group>
        <CommentInput editor={composer} busy={busy} busyLabel={busyLabel} />
      </Stack>

      <Group justify="space-between" wrap="nowrap">
        <Button size="xs" variant="subtle" color="gray" onClick={onSkip}>
          Skip
        </Button>
        <Group gap={8} wrap="nowrap">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconClockPause size={14} stroke={1.8} />}
            onClick={() => onSnooze(gather())}
          >
            Snooze 1 day
          </Button>
          <Button
            size="xs"
            leftSection={<IconPlayerTrackNext size={14} stroke={1.8} />}
            onClick={() => onCommit(gather())}
          >
            Next
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

/** A single selectable status swatch (box + label), highlighted when chosen. */
function StateOption({
  state,
  selected,
  onSelect,
}: {
  state: TodoState;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { label } = TODO_STATES.find((s) => s.value === state) ?? TODO_STATES[0];
  return (
    <UnstyledButton
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: "var(--mantine-radius-md)",
        border: selected
          ? "1px solid var(--mantine-primary-color-filled)"
          : "1px solid var(--mantine-color-default-border)",
        background:
          hovered && !selected ? "var(--mantine-color-default-hover)" : "transparent",
      }}
    >
      <StateBox state={state} size={14} optical />
      <Text size="xs">{label}</Text>
    </UnstyledButton>
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
