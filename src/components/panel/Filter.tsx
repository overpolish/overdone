/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconBookmark,
  IconFilter,
  IconPlus,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { useState } from "react";

import {
  type DueFilter,
  emptyCriteria,
  type FilterCriteria,
  hasActiveCriteria,
  isViewAltered,
  type SortKey,
  type Tri,
  useFilters,
} from "../../lib/filters";
import { TODO_STATES, type TodoState } from "../../lib/todo";
import { type Assignee, type Label } from "../../lib/todos";
import { AssigneeAvatar } from "../ui/AssigneeAvatar";
import { IconButton } from "../ui/IconButton";
import { LabelBadge } from "../ui/LabelBadge";
import { ScrollArea } from "../ui/ScrollArea";
import { StateBox } from "../ui/StateBox";
import { PillToggle, ToggleChip } from "./FilterChips";
import { SavedRow } from "./SavedFilters";

/** Single-select due-date buckets, in display order. */
const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "has", label: "Has date" },
  { value: "none", label: "No date" },
];

/** Three-way presence switch, shared by the comments / reminder filters. */
const TRI_DATA = [
  { value: "any", label: "Any" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const SORT_DATA = [
  { value: "manual", label: "Manual" },
  { value: "updated", label: "Updated" },
  { value: "created", label: "Created" },
  { value: "due", label: "Due" },
];

/**
 * The filter panel for the active list, shown in the secondary window. Edits the
 * BroadcastChannel-synced {@link useFilters} store live, so the main window's
 * list hides / sorts as controls here change. Filters can be saved (list-scoped,
 * or global to reuse on any list).
 */
export function Filter({
  listId,
  labels,
  assignees,
}: {
  listId: string;
  labels: Label[];
  assignees: Assignee[];
}) {
  const c = useFilters((s) => s.active[listId]) ?? emptyCriteria();
  const saved = useFilters((s) => s.saved);
  const patch = useFilters((s) => s.patchCriteria);
  const setCriteria = useFilters((s) => s.setCriteria);
  const clear = useFilters((s) => s.clear);
  const saveFilter = useFilters((s) => s.saveFilter);
  const deleteSaved = useFilters((s) => s.deleteSaved);

  const [name, setName] = useState("");
  const [global, setGlobal] = useState(false);

  const active = hasActiveCriteria(c);
  const altered = isViewAltered(c);
  const applicable = saved.filter((f) => f.global || f.listId === listId);

  const toggle = <K extends "states" | "labels" | "assignees">(
    key: K,
    value: FilterCriteria[K][number],
  ) => {
    const list = c[key] as string[];
    const next = list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
    patch(listId, { [key]: next } as Partial<FilterCriteria>);
  };

  const save = () => {
    if (!name.trim() || !active) return;
    saveFilter(name.trim(), global, listId, c);
    setName("");
    setGlobal(false);
  };

  return (
    <Stack gap="md" w={600}>
      <Group justify="space-between" wrap="nowrap" align="center" px={8}>
        <Group gap={8} wrap="nowrap" align="center">
          <IconFilter size={18} stroke={1.8} style={{ display: "block" }} />
          <Title order={5}>Filter</Title>
        </Group>
        {altered && (
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            onClick={() => clear(listId)}
          >
            Clear
          </Button>
        )}
      </Group>

      <ScrollArea maxHeight={560}>
        {/* Pad inside the scroll clip so chips and the selection rings on
            selected pills clear the rounded corners instead of being cut. */}
        <Stack gap="md" px={8} py={6}>
          <Group align="flex-start" grow wrap="nowrap" gap="md">
            <Stack gap="md">
              <Section title="Status">
                <Group gap={6}>
                  {TODO_STATES.map((s) => (
                    <ToggleChip
                      key={s.value}
                      selected={c.states.includes(s.value)}
                      onClick={() => toggle("states", s.value as TodoState)}
                    >
                      <StateBox state={s.value} size={14} />
                      <span>{s.label}</span>
                    </ToggleChip>
                  ))}
                </Group>
              </Section>

              {labels.length > 0 && (
                <Section title="Labels">
                  <Group gap={6}>
                    {labels.map((l) => (
                      <PillToggle
                        key={l.id}
                        selected={c.labels.includes(l.id)}
                        onClick={() => toggle("labels", l.id)}
                      >
                        <LabelBadge label={l} size={16} />
                      </PillToggle>
                    ))}
                  </Group>
                </Section>
              )}

              {assignees.length > 0 && (
                <Section title="Assignees">
                  <Group gap={6}>
                    {assignees.map((a) => (
                      <ToggleChip
                        key={a.id}
                        selected={c.assignees.includes(a.id)}
                        onClick={() => toggle("assignees", a.id)}
                      >
                        <AssigneeAvatar
                          assignee={a}
                          size={16}
                          withTooltip={false}
                        />
                        <span>{a.name}</span>
                      </ToggleChip>
                    ))}
                  </Group>
                </Section>
              )}

              <Section title="Due date">
                <Group gap={6}>
                  {DUE_OPTIONS.map((d) => (
                    <ToggleChip
                      key={d.value}
                      selected={c.due === d.value}
                      onClick={() => patch(listId, { due: d.value })}
                    >
                      <span>{d.label}</span>
                    </ToggleChip>
                  ))}
                </Group>
              </Section>
            </Stack>

            <Stack gap="md">
              <Section title="Comments">
                <SegmentedControl
                  size="xs"
                  fullWidth
                  data={TRI_DATA}
                  value={c.hasComments}
                  onChange={(v) => patch(listId, { hasComments: v as Tri })}
                />
              </Section>

              <Section title="Reminder">
                <SegmentedControl
                  size="xs"
                  fullWidth
                  data={TRI_DATA}
                  value={c.hasReminder}
                  onChange={(v) => patch(listId, { hasReminder: v as Tri })}
                />
              </Section>

              <Section title="Sort">
                <Group gap={6} wrap="nowrap" align="center">
                  <SegmentedControl
                    size="xs"
                    style={{ flex: 1 }}
                    data={SORT_DATA}
                    value={c.sort}
                    onChange={(v) => patch(listId, { sort: v as SortKey })}
                  />
                  {c.sort !== "manual" && (
                    <IconButton
                      label={
                        c.sortDir === "asc"
                          ? "Sort ascending"
                          : "Sort descending"
                      }
                      icon={
                        c.sortDir === "asc"
                          ? IconSortAscending
                          : IconSortDescending
                      }
                      onClick={() =>
                        patch(listId, {
                          sortDir: c.sortDir === "asc" ? "desc" : "asc",
                        })
                      }
                    />
                  )}
                </Group>
              </Section>

              <Divider />

              <Section title="Save filter">
                <Stack gap={8}>
                  <Group
                    component="label"
                    justify="space-between"
                    wrap="nowrap"
                    style={{ cursor: active ? "pointer" : "default" }}
                  >
                    <Text size="sm" fw={500} c={active ? undefined : "dimmed"}>
                      Available on all lists
                    </Text>
                    <Checkbox
                      checked={global}
                      disabled={!active}
                      onChange={(e) => setGlobal(e.currentTarget.checked)}
                    />
                  </Group>
                  <Group gap={6} wrap="nowrap" align="center">
                    <TextInput
                      size="xs"
                      style={{ flex: 1 }}
                      placeholder="Name this filter…"
                      leftSection={<IconBookmark size={14} />}
                      value={name}
                      disabled={!active}
                      onChange={(e) => setName(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          save();
                        }
                      }}
                    />
                    <ActionIcon
                      variant="default"
                      size={22}
                      aria-label="Save filter"
                      disabled={!active || !name.trim()}
                      onClick={save}
                    >
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Group>
                </Stack>
              </Section>
            </Stack>
          </Group>

          {applicable.length > 0 && (
            <>
              <Divider />
              <Section title="Saved filters">
                <ScrollArea maxHeight={104} hideScrollbar>
                  <Stack gap={2} p={4}>
                    {applicable.map((f) => (
                      <SavedRow
                        key={f.id}
                        filter={f}
                        onLoad={() => setCriteria(listId, f.criteria)}
                        onDelete={() => deleteSaved(f.id)}
                      />
                    ))}
                  </Stack>
                </ScrollArea>
              </Section>
            </>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

/** A titled sub-section: an UPPERCASE eyebrow label above its controls (matches
 * the details panel's LABELS / ASSIGNEES headings). */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="xs">
      <Text
        size="xs"
        fw={600}
        c="dimmed"
        style={{ textTransform: "uppercase" }}
      >
        {title}
      </Text>
      {children}
    </Stack>
  );
}
