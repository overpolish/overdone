import { Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { fuzzyFilter } from "../lib/fuzzy";
import { closePanel, emitFocusItem } from "../lib/panel";
import { type TodoData } from "../lib/todos";
import { ScrollArea } from "./ScrollArea";
import { StateBox } from "./StateBox";

/**
 * Quick-find for the active list, shown in the panel. Fuzzy-filters items as you
 * type; picking one jumps to it in the main window and closes the panel.
 */
export function Search({ items }: { items: TodoData[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(
    () => fuzzyFilter(items, query, (i) => i.text),
    [items, query],
  );

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
          if (e.key === "Enter" && results[0]) pick(results[0].id);
        }}
      />

      {results.length === 0 ? (
        <Text size="sm" c="dimmed">
          No matches
        </Text>
      ) : (
        <ScrollArea maxHeight={260} radius="var(--mantine-radius-md)">
          <Stack gap={2}>
            {results.map((item) => (
              <ResultRow key={item.id} item={item} onSelect={() => pick(item.id)} />
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}

function ResultRow({ item, onSelect }: { item: TodoData; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const done = item.state === "done";

  return (
    <UnstyledButton
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        background: hovered ? "var(--mantine-color-default-hover)" : "transparent",
      }}
    >
      <StateBox state={item.state} size={16} optical />
      <Text
        size="sm"
        truncate
        style={{
          flex: 1,
          textDecoration: done ? "line-through" : undefined,
          opacity: done ? 0.6 : 1,
        }}
        c={item.text ? undefined : "dimmed"}
      >
        {item.text || "Untitled"}
      </Text>
    </UnstyledButton>
  );
}
