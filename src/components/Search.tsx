/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconMessage, IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveAssignees } from "../lib/assignee";
import { fuzzyScore } from "../lib/fuzzy";
import { resolveLabels } from "../lib/label";
import { htmlToText } from "../lib/media";
import { closePanel, emitFocusItem } from "../lib/panel";
import { isStruck } from "../lib/todo";
import { type Assignee, type Label, type TodoData } from "../lib/todos";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { LabelBadge } from "./LabelBadge";
import { ScrollArea } from "./ScrollArea";
import { StateBox } from "./StateBox";

/** A ranked match, plus the hint to show for why it matched: a comment excerpt,
 * a label, or an assignee (when the hit wasn't the item's title). */
interface Match {
  item: TodoData;
  /** Excerpt of the matching comment, or undefined if it didn't win. */
  snippet?: string;
  /** The label that matched, or undefined if a label didn't win. */
  label?: Label;
  /** The assignee that matched, or undefined if an assignee didn't win. */
  assignee?: Assignee;
}

/**
 * Quick-find for the active list, shown in the panel. Fuzzy-filters items by
 * title, comment text, label name, *and* assignee name as you type; picking one
 * jumps to it in the main window and closes the panel.
 */
export function Search({
  items,
  labels: labelRoster,
  assignees: assigneeRoster,
}: {
  items: TodoData[];
  labels: Label[];
  assignees: Assignee[];
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Resolve each item's comments (to plain text), labels, and assignees once per
  // item/roster change, so typing only re-scores.
  const indexed = useMemo(
    () =>
      items.map((item) => ({
        item,
        comments: (item.comments ?? [])
          .map((c) => htmlToText(c.text))
          .filter(Boolean),
        labels: resolveLabels(item.labels ?? [], labelRoster),
        assignees: resolveAssignees(item.assignees ?? [], assigneeRoster),
      })),
    [items, labelRoster, assigneeRoster],
  );

  const results = useMemo<Match[]>(() => {
    if (!query.trim()) return items.map((item) => ({ item }));

    const matches: { match: Match; score: number }[] = [];
    for (const { item, comments, labels, assignees } of indexed) {
      // Score each field separately, then take the best. Scoring a single
      // concatenated string would let a query match across the gap between
      // fields, producing matches that don't exist in any one of them.
      const titleScore = fuzzyScore(item.text, query);
      let bestComment: { score: number; text: string } | null = null;
      for (const text of comments) {
        const score = fuzzyScore(text, query);
        if (score !== null && (!bestComment || score > bestComment.score)) {
          bestComment = { score, text };
        }
      }
      let bestLabel: { score: number; label: Label } | null = null;
      for (const label of labels) {
        const score = fuzzyScore(label.name, query);
        if (score !== null && (!bestLabel || score > bestLabel.score)) {
          bestLabel = { score, label };
        }
      }
      let bestAssignee: { score: number; assignee: Assignee } | null = null;
      for (const assignee of assignees) {
        const score = fuzzyScore(assignee.name, query);
        if (score !== null && (!bestAssignee || score > bestAssignee.score)) {
          bestAssignee = { score, assignee };
        }
      }

      const score = Math.max(
        titleScore ?? -Infinity,
        bestLabel?.score ?? -Infinity,
        bestAssignee?.score ?? -Infinity,
        bestComment?.score ?? -Infinity,
      );
      if (score === -Infinity) continue;

      // Pick the hint from whichever field won (title shows none). Order breaks
      // ties: title, then label, then assignee, then comment.
      const match: Match = { item };
      if (titleScore !== null && score === titleScore) {
        // title match - no hint needed
      } else if (bestLabel && score === bestLabel.score) {
        match.label = bestLabel.label;
      } else if (bestAssignee && score === bestAssignee.score) {
        match.assignee = bestAssignee.assignee;
      } else if (bestComment && score === bestComment.score) {
        match.snippet = excerpt(bestComment.text, query);
      }
      matches.push({ score, match });
    }

    return matches.sort((a, b) => b.score - a.score).map((m) => m.match);
  }, [indexed, items, query]);

  const pick = (id: string) => {
    emitFocusItem(id);
    closePanel();
  };

  return (
    <Stack gap="xs" w={300}>
      <TextInput
        ref={inputRef}
        placeholder="Search items…"
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) pick(results[0].item.id);
        }}
      />

      {results.length === 0 ? (
        <Text size="sm" c="dimmed">
          No matches
        </Text>
      ) : (
        <ScrollArea maxHeight={260}>
          <Stack gap={2}>
            {results.map(({ item, snippet, label, assignee }) => (
              <ResultRow
                key={item.id}
                item={item}
                snippet={snippet}
                label={label}
                assignee={assignee}
                onSelect={() => pick(item.id)}
              />
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}

function ResultRow({
  item,
  snippet,
  label,
  assignee,
  onSelect,
}: {
  item: TodoData;
  snippet?: string;
  label?: Label;
  assignee?: Assignee;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const done = isStruck(item.state);
  // A second line shows why a non-title field matched (comment / label / assignee).
  const hasHint = Boolean(snippet || label || assignee);

  return (
    <UnstyledButton
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: hasHint ? "flex-start" : "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        background: hovered ? "var(--mantine-color-default-hover)" : "transparent",
      }}
    >
      <StateBox state={item.state} size={16} optical />
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text
          size="sm"
          truncate
          style={{
            textDecoration: done ? "line-through" : undefined,
            opacity: done ? 0.6 : 1,
          }}
          c={item.text ? undefined : "dimmed"}
        >
          {item.text || "Untitled"}
        </Text>
        {snippet && (
          <Text
            size="xs"
            c="dimmed"
            truncate
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <IconMessage size={12} style={{ flexShrink: 0 }} />
            {snippet}
          </Text>
        )}
        {label && (
          <div style={{ display: "flex" }}>
            <LabelBadge label={label} size={15} />
          </div>
        )}
        {assignee && (
          <Text
            size="xs"
            c="dimmed"
            truncate
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <AssigneeAvatar assignee={assignee} size={14} withTooltip={false} />
            {assignee.name}
          </Text>
        )}
      </Stack>
    </UnstyledButton>
  );
}

/** A short window of comment text centred on the query, with ellipses, so the
 * matching part is visible in the result row. */
function excerpt(text: string, query: string, len = 80): string {
  const first = query.trim().toLowerCase()[0];
  const at = first ? text.toLowerCase().indexOf(first) : 0;
  const start = Math.max(0, (at < 0 ? 0 : at) - 16);
  const end = Math.min(text.length, start + len);
  return (
    (start > 0 ? "…" : "") +
    text.slice(start, end).trim() +
    (end < text.length ? "…" : "")
  );
}
