/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import {
  Box,
  Group,
  Text,
  TextInput,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import { IconPlus, IconUserPlus, IconX } from "@tabler/icons-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { pickColor, resolveAssignees } from "../lib/assignee";
import { type AssigneesSync, emitAssigneeAction } from "../lib/panel";
import { dangerBg, dangerFg } from "../lib/styles";
import { type Assignee } from "../lib/todos";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { ScrollArea } from "./ScrollArea";

/**
 * Controller for editing one item's assignees. Holds the working assignee ids
 * and a working roster (so people created here show up immediately), and streams
 * each change back to the main window — the list owner — which persists it. The
 * working roster lives in a ref so the change handler, which fires synchronously
 * right after a create, sees the new entry before React re-renders. Shared by the
 * details panel and the row's standalone assignee picker.
 */
export function useAssigneeEditor(
  itemId: string,
  initialRoster: Assignee[],
  initialAssigneeIds: string[],
) {
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialAssigneeIds);
  const [roster, setRoster] = useState<Assignee[]>(initialRoster);
  const rosterRef = useRef<Assignee[]>(initialRoster);

  const onCreate = (name: string): Assignee => {
    const created = { id: crypto.randomUUID(), name: name.trim(), color: pickColor(name) };
    rosterRef.current = [...rosterRef.current, created];
    setRoster(rosterRef.current);
    return created;
  };

  const onChange = (ids: string[]) => {
    setAssigneeIds(ids);
    // Re-send any people created in this session; the store dedupes by id.
    const newAssignees = rosterRef.current.filter(
      (a) => !initialRoster.some((r) => r.id === a.id),
    );
    emitAssigneeAction({ itemId, assigneeIds: ids, newAssignees });
  };

  // Stay live with the main window's store (e.g. after an undo/redo there): it
  // broadcasts the current assignee state, which we adopt for this item.
  useEffect(() => {
    const un = listen<AssigneesSync>("assignees:sync", (e) => {
      rosterRef.current = e.payload.roster;
      setRoster(e.payload.roster);
      const ids = e.payload.byItem[itemId];
      if (ids) setAssigneeIds(ids);
    });
    return () => {
      void un.then((off) => off());
    };
  }, [itemId]);

  return { roster, assigneeIds, onChange, onCreate };
}

interface AssigneePickerProps {
  /** The list's full roster, to offer as suggestions. */
  roster: Assignee[];
  /** Currently assigned ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Create a new roster member from a typed name; returns the new entry. */
  onCreate: (name: string) => Assignee;
}

/**
 * Free-form, autocompleting assignee field. Pick an existing roster member or
 * type a new name to create one on the spot. Suggestions render inline (in
 * flow), like the search panel, so the floating panel window grows to fit them
 * instead of clipping a dropdown.
 */
export function AssigneePicker({ roster, value, onChange, onCreate }: AssigneePickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selected = resolveAssignees(value, roster);
  const q = search.trim().toLowerCase();
  const available = roster.filter(
    (a) => !value.includes(a.id) && a.name.toLowerCase().includes(q),
  );
  const exists = roster.some((a) => a.name.trim().toLowerCase() === q);
  const showCreate = q.length > 0 && !exists;

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
      {/* Add field stays at the top; suggestions attach right under it, and the
          current chips sit below — mirroring the Settings layout. */}
      <TextInput
        size="xs"
        value={search}
        placeholder="Assign people…"
        leftSection={<IconUserPlus size={14} />}
        onChange={(e) => {
          setSearch(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (available[0]) add(available[0].id);
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
        // Bordered container matching the input, so the suggestions read as part
        // of the same field. The wrapper owns the rounding/clip (radius={0} on the
        // ScrollArea) so its shadows still curve with these corners.
        <Box
          mt={4}
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-md)",
            background: "var(--mantine-color-default)",
            overflow: "hidden",
          }}
        >
          {/* ~2.5 rows tall so the rest scroll (a partial row + shadow hints
              there's more). Each option row is roughly 30px. */}
          <ScrollArea maxHeight={76} radius={0}>
            <Box p={4}>
              {available.map((a) => (
                <Option key={a.id} onSelect={() => add(a.id)}>
                  <AssigneeAvatar assignee={a} size={18} withTooltip={false} />
                  <Text size="xs">{a.name}</Text>
                </Option>
              ))}
              {showCreate && (
                <Option onSelect={create}>
                  <IconPlus size={14} />
                  <Text size="xs">
                    Create “{search.trim()}”
                  </Text>
                </Option>
              )}
            </Box>
          </ScrollArea>
        </Box>
      )}

      {selected.length > 0 && (
        <Group gap={6} mt={6}>
          {selected.map((a) => (
            <SelectedChip key={a.id} assignee={a} onRemove={() => remove(a.id)} />
          ))}
        </Group>
      )}
    </Box>
  );
}

/** A selected-assignee chip: avatar + name + a remove button with a red hover.
 * Less left padding (the avatar already sits inset) so it reads as balanced. */
function SelectedChip({ assignee, onRemove }: { assignee: Assignee; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  const dark = useComputedColorScheme("light") === "dark";
  const btnRef = useRef<HTMLButtonElement>(null);
  // The button sits after the variable-width name, so its left edge lands at a
  // different fractional device-pixel offset on every chip. The icon is exactly
  // centered, but when the button straddles a physical pixel the thin × strokes
  // smear asymmetrically and read as shoved left/right (WKWebView doesn't snap
  // composited layers, so translateZ can't fix it). Measure the sub-pixel
  // remainder and nudge the button onto the device grid so the × is always crisp.
  useLayoutEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    el.style.transform = "none";
    const { left } = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const snapped = Math.round(left * dpr) / dpr;
    el.style.transform = `translateX(${snapped - left}px)`;
  });
  return (
    <Group
      gap={6}
      wrap="nowrap"
      style={{
        padding: 2,
        borderRadius: "var(--mantine-radius-xl)",
        background: "var(--mantine-color-default)",
        border: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <AssigneeAvatar assignee={assignee} size={18} withTooltip={false} />
      <Text size="xs" lh={1}>
        {assignee.name}
      </Text>
      <UnstyledButton
        ref={btnRef}
        aria-label={`Remove ${assignee.name}`}
        onClick={onRemove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Never let a long name squeeze the button below 16px (which threw off
          // the icon centering on wider chips).
          flexShrink: 0,
          width: 16,
          height: 16,
          borderRadius: "50%",
          color: hovered ? dangerFg(dark) : "var(--mantine-color-dimmed)",
          background: hovered ? dangerBg(dark) : "transparent",
          transition: "background 120ms ease, color 120ms ease",
        }}
      >
        {/* Even icon size in the even button → whole-pixel margins; integer
            stroke avoids the asymmetric anti-aliasing of a 2.5 stroke. The chip
            is snapped to the device grid in useLayoutEffect above so these
            strokes never straddle a physical pixel. */}
        <IconX size={12} stroke={2} style={{ display: "block" }} />
      </UnstyledButton>
    </Group>
  );
}

/** One suggestion row. `onMouseDown` (not click) so it fires before the input's
 * blur closes the list. */
function Option({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <UnstyledButton
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        background: hovered ? "var(--mantine-color-default-hover)" : "transparent",
      }}
    >
      {children}
    </UnstyledButton>
  );
}
