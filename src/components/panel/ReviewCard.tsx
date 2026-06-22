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
  IconChecklist,
  IconClockPause,
  IconPlayerTrackNext,
} from "@tabler/icons-react";
import { type Editor } from "@tiptap/react";
import { useRef, useState } from "react";

import { type ReviewEntry, type ReviewReason } from "../../lib/daily-review";
import { insertPastedFiles, pickAndInsert, toStoredHtml } from "../../lib/media";
import { closePanel } from "../../lib/panel";
import { TODO_STATES, type TodoState } from "../../lib/todo";
import {
  CommentInput,
  FormatBar,
  htmlIsEmpty,
  useCommentEditor,
} from "../editor/CommentEditor";
import { useMediaBusy } from "../details/useMediaBusy";
import { StateBox } from "../ui/StateBox";
import { STATUS_COLOR } from "../todo-item/itemStatus";

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

/** The outcome a card commits when the reviewer moves on. */
export interface CardResult {
  /** A new state, if the reviewer picked one (else keep as-is). */
  state?: TodoState;
  /** A comment to append, as stored HTML (empty = none). */
  comment: string;
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

export function ReviewCard({
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
    holdPanelOpen: true,
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
