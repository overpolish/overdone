/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Group, Stack, Title } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";

import { type Assignee } from "../lib/todos";
import { AssigneePicker, useAssigneeEditor } from "./AssigneePicker";

interface AssigneePanelProps {
  itemId: string;
  /** The list's assignee roster, to seed the picker's suggestions. */
  roster: Assignee[];
  /** The item's current assignee ids. */
  assigneeIds: string[];
}

/**
 * The assignee picker on its own, shown in the floating panel pinned below a
 * row's assignee control. Assign existing people or type a new name to create
 * one; changes stream back to the main window as they're made.
 */
export function AssigneePanel({ itemId, roster, assigneeIds }: AssigneePanelProps) {
  const editor = useAssigneeEditor(itemId, roster, assigneeIds);
  return (
    <Stack gap="xs" w={280}>
      <Group gap={8} wrap="nowrap">
        <IconUsers size={18} stroke={1.8} />
        <Title order={5}>Assignees</Title>
      </Group>
      <AssigneePicker
        roster={editor.roster}
        value={editor.assigneeIds}
        onChange={editor.onChange}
        onCreate={editor.onCreate}
      />
    </Stack>
  );
}
