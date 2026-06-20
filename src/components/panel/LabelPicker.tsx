/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, TextInput, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { IconPlus, IconTag, IconX } from "@tabler/icons-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import { labelColors, randomLabelColor, resolveLabels } from "../../lib/label";
import { emitLabelAction, type LabelsSync } from "../../lib/panel";
import { type Label } from "../../lib/todos";
import { LabelBadge } from "../ui/LabelBadge";
import { PickerOption, usePickerHighlight } from "../ui/PickerOption";
import { ScrollArea } from "../ui/ScrollArea";

/**
 * Controller for editing one item's labels. Mirrors {@link useAssigneeEditor}:
 * holds the working label ids and a working roster (so labels created here show
 * up immediately), and streams each change back to the main window - the list
 * owner - which persists it. New labels get a *random* color (GitHub-style),
 * reshuffleable from Settings. The working roster lives in a ref so the change
 * handler, firing synchronously right after a create, sees the new entry before
 * React re-renders.
 */
export function useLabelEditor(
  itemId: string,
  initialRoster: Label[],
  initialLabelIds: string[],
) {
  const [labelIds, setLabelIds] = useState<string[]>(initialLabelIds);
  const [roster, setRoster] = useState<Label[]>(initialRoster);
  const rosterRef = useRef<Label[]>(initialRoster);

  const onCreate = (name: string): Label => {
    const created = { id: crypto.randomUUID(), name: name.trim(), color: randomLabelColor() };
    rosterRef.current = [...rosterRef.current, created];
    setRoster(rosterRef.current);
    return created;
  };

  const onChange = (ids: string[]) => {
    setLabelIds(ids);
    // Re-send any labels created in this session; the store dedupes by id.
    const newLabels = rosterRef.current.filter(
      (l) => !initialRoster.some((r) => r.id === l.id),
    );
    emitLabelAction({ itemId, labelIds: ids, newLabels });
  };

  // Stay live with the main window's store (e.g. after an undo/redo there): it
  // broadcasts the current label state, which we adopt for this item.
  useEffect(() => {
    const un = listen<LabelsSync>("labels:sync", (e) => {
      rosterRef.current = e.payload.roster;
      setRoster(e.payload.roster);
      const ids = e.payload.byItem[itemId];
      if (ids) setLabelIds(ids);
    });
    return () => {
      void un.then((off) => off());
    };
  }, [itemId]);

  return { roster, labelIds, onChange, onCreate };
}

interface LabelPickerProps {
  /** The list's full label roster, to offer as suggestions. */
  roster: Label[];
  /** Currently applied label ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Create a new label from a typed name; returns the new entry. */
  onCreate: (name: string) => Label;
}

/**
 * Free-form, autocompleting label field. Pick an existing label or type a new
 * name to create one (with a random color) on the spot. Suggestions render
 * inline (in flow), like the assignee picker, so the floating panel window grows
 * to fit them instead of clipping a dropdown.
 */
export function LabelPicker({ roster, value, onChange, onCreate }: LabelPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selected = resolveLabels(value, roster);
  const q = search.trim().toLowerCase();
  const available = roster.filter(
    (l) => !value.includes(l.id) && l.name.toLowerCase().includes(q),
  );
  const exists = roster.some((l) => l.name.trim().toLowerCase() === q);
  const showCreate = q.length > 0 && !exists;
  // Arrow-key highlight over the suggestion rows (+ the optional create row).
  const { highlight, setIndex, onArrowKey } = usePickerHighlight(
    available.length + (showCreate ? 1 : 0),
  );

  const add = (id: string) => {
    onChange([...value, id]);
    setSearch("");
  };
  const create = () => {
    const created = onCreate(search.trim());
    onChange([...value, created.id]);
    setSearch("");
  };
  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  return (
    <Box>
      <TextInput
        size="xs"
        value={search}
        placeholder="Add labels…"
        leftSection={<IconTag size={14} />}
        onChange={(e) => {
          setSearch(e.currentTarget.value);
          setOpen(true);
          setIndex(0);
        }}
        onFocus={() => {
          setOpen(true);
          setIndex(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (onArrowKey(e)) return;
          if (e.key === "Enter") {
            e.preventDefault();
            if (highlight < available.length) add(available[highlight].id);
            else if (showCreate) create();
          } else if (e.key === "Backspace" && search === "" && selected.length) {
            remove(selected[selected.length - 1].id);
          } else if (e.key === "Escape" && open) {
            // Swallow the close so a first Escape just dismisses suggestions.
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />

      {open && (available.length > 0 || showCreate) && (
        <Box
          mt={4}
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-md)",
            background: "var(--mantine-color-default)",
            overflow: "hidden",
          }}
        >
          <ScrollArea maxHeight={76} radius={0}>
            <Box p={4}>
              {available.map((l, i) => (
                <PickerOption
                  key={l.id}
                  highlighted={i === highlight}
                  onHover={() => setIndex(i)}
                  onSelect={() => add(l.id)}
                >
                  <LabelBadge label={l} size={16} />
                </PickerOption>
              ))}
              {showCreate && (
                <PickerOption
                  highlighted={highlight === available.length}
                  onHover={() => setIndex(available.length)}
                  onSelect={create}
                >
                  <IconPlus size={14} />
                  <span style={{ fontSize: "var(--mantine-font-size-xs)" }}>
                    Create “{search.trim()}”
                  </span>
                </PickerOption>
              )}
            </Box>
          </ScrollArea>
        </Box>
      )}

      {selected.length > 0 && (
        <Group gap={6} mt={6}>
          {selected.map((l) => (
            <LabelChip key={l.id} label={l} onRemove={() => remove(l.id)} />
          ))}
        </Group>
      )}
    </Box>
  );
}

/** A selected-label chip: the translucent badge with a remove button tucked on
 * its right. The × tints with the label's own (colored-on-tint) palette. */
function LabelChip({ label, onRemove }: { label: Label; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  const dark = useComputedColorScheme("light") === "dark";
  const { bg, fg, border } = labelColors(label.color, dark);
  return (
    <Group
      gap={2}
      wrap="nowrap"
      style={{
        paddingInline: 8,
        height: 20,
        borderRadius: "var(--mantine-radius-xl)",
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1,
          color: fg,
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        {label.name}
      </span>
      <UnstyledButton
        aria-label={`Remove ${label.name}`}
        onClick={onRemove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 14,
          height: 14,
          // Pull the × right so the gap to the chip edge (paddingInline 8 minus
          // this) matches the 3px vertical gap above/below the 14px button.
          marginRight: -6,
          borderRadius: "50%",
          color: fg,
          opacity: hovered ? 1 : 0.7,
          background: hovered ? `color-mix(in srgb, ${fg} 25%, transparent)` : "transparent",
          transition: "background 120ms ease, opacity 120ms ease",
        }}
      >
        <IconX size={10} stroke={2.5} style={{ display: "block" }} />
      </UnstyledButton>
    </Group>
  );
}
