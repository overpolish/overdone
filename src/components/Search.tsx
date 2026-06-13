import { Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconMessage, IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { fuzzyScore } from "../lib/fuzzy";
import { htmlToText } from "../lib/media";
import { closePanel, emitFocusItem } from "../lib/panel";
import { type TodoData } from "../lib/todos";
import { ScrollArea } from "./ScrollArea";
import { StateBox } from "./StateBox";

/** A ranked match, plus the comment excerpt to show when the hit was in a comment
 * (rather than the item's title). */
interface Match {
  item: TodoData;
  /** Excerpt of the matching comment, or undefined if the title matched. */
  snippet?: string;
}

/**
 * Quick-find for the active list, shown in the panel. Fuzzy-filters items by
 * title *and* comment text as you type; picking one jumps to it in the main
 * window and closes the panel.
 */
export function Search({ items }: { items: TodoData[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Strip each comment to plain text once per item set, so typing only re-scores.
  const indexed = useMemo(
    () =>
      items.map((item) => ({
        item,
        comments: (item.comments ?? [])
          .map((c) => htmlToText(c.text))
          .filter(Boolean),
      })),
    [items],
  );

  const results = useMemo<Match[]>(() => {
    if (!query.trim()) return items.map((item) => ({ item }));

    const matches: { match: Match; score: number }[] = [];
    for (const { item, comments } of indexed) {
      // Score the title and each comment separately, then take the best. Scoring
      // a single concatenated string would let a query match across the gap
      // between fields, producing matches that don't exist in either.
      const titleScore = fuzzyScore(item.text, query);
      let bestComment: { score: number; text: string } | null = null;
      for (const text of comments) {
        const score = fuzzyScore(text, query);
        if (score !== null && (!bestComment || score > bestComment.score)) {
          bestComment = { score, text };
        }
      }

      const score = Math.max(titleScore ?? -Infinity, bestComment?.score ?? -Infinity);
      if (score === -Infinity) continue;

      const fromComment =
        bestComment !== null && (titleScore === null || bestComment.score > titleScore);
      matches.push({
        score,
        match: { item, snippet: fromComment ? excerpt(bestComment!.text, query) : undefined },
      });
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
        <ScrollArea maxHeight={260} radius="var(--mantine-radius-md)">
          <Stack gap={2}>
            {results.map(({ item, snippet }) => (
              <ResultRow
                key={item.id}
                item={item}
                snippet={snippet}
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
  onSelect,
}: {
  item: TodoData;
  snippet?: string;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const done = item.state === "done";

  return (
    <UnstyledButton
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: snippet ? "flex-start" : "center",
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
