/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import {
  Divider,
  Group,
  Stack,
  Text,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { closePanel, emitStatusAction } from "../lib/panel";
import { dangerBg, dangerFg } from "../lib/styles";
import { TODO_STATES, todoStateMeta, type TodoState } from "../lib/todo";
import { StateBox } from "./StateBox";

interface StateOptionProps {
  state: TodoState;
  selected: boolean;
  onSelect: () => void;
}

function StateOption({ state, selected, onSelect }: StateOptionProps) {
  const [hovered, setHovered] = useState(false);
  const { label } = todoStateMeta(state);

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
        background:
          hovered || selected
            ? "var(--mantine-color-default-hover)"
            : "transparent",
      }}
    >
      <StateBox state={state} size={16} optical />
      <Text size="sm">{label}</Text>
    </UnstyledButton>
  );
}

function DeleteOption({ onSelect }: { onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const dark = useComputedColorScheme("light") === "dark";

  return (
    <UnstyledButton
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        color: dangerFg(dark),
        background: hovered ? dangerBg(dark) : "transparent",
      }}
    >
      <Group gap={8} wrap="nowrap">
        <IconTrash size={16} stroke={2} style={{ display: "block" }} />
        <Text size="sm" c="inherit">
          Delete
        </Text>
      </Group>
    </UnstyledButton>
  );
}

interface StatusPickerProps {
  itemId: string;
  state: TodoState;
}

/**
 * The status menu, rendered inside the floating panel (sized to fit, pinned
 * below the clicked item). Picking a state or delete routes the action back to
 * the main window and closes the panel.
 */
export function StatusPicker({ itemId, state }: StatusPickerProps) {
  return (
    <Stack gap={2} w={150}>
      {TODO_STATES.map((s) => (
        <StateOption
          key={s.value}
          state={s.value}
          selected={s.value === state}
          onSelect={() => {
            emitStatusAction({ itemId, type: "set", state: s.value });
            closePanel();
          }}
        />
      ))}

      <Divider my={4} />

      <DeleteOption
        onSelect={() => {
          emitStatusAction({ itemId, type: "delete" });
          closePanel();
        }}
      />
    </Stack>
  );
}
