import {
  Divider,
  Group,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { TODO_STATES, todoStateMeta, type TodoState } from "../lib/todo";

const BOX_SIZE = 20;

interface StateBoxProps {
  state: TodoState;
  size?: number;
  /** Apply the per-glyph optical nudge (only wanted at the small dropdown size). */
  optical?: boolean;
}

/**
 * The square status indicator. `todo` mirrors the plain Mantine checkbox
 * surface (`default` bg + border); the other states paint a filled color box
 * with a white glyph, matching the "normal check" / clock the popover offers.
 */
function StateBox({ state, size = BOX_SIZE, optical = false }: StateBoxProps) {
  const { color, icon: Icon, iconNudgeY } = todoStateMeta(state);
  const filled = color != null;
  // Snap to an even integer (~0.7 of the box) so the glyph sits on whole pixels
  // and stays centered — a fractional size leaves it visibly off (e.g. the
  // clock's round face) at the 16px dropdown size.
  const iconSize = Math.round((size * 0.7) / 2) * 2;
  // Optical correction, scaled to the box. Only for the small dropdown swatches
  // — at the larger main-checkbox size the glyph already reads centered.
  const nudgeY = optical && iconNudgeY ? size * iconNudgeY : 0;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--mantine-radius-sm)",
        background: filled
          ? `var(--mantine-color-${color}-6)`
          : "var(--mantine-color-default)",
        border: filled
          ? "1px solid transparent"
          : "1px solid var(--mantine-color-default-border)",
        color: "var(--mantine-color-white)",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      {/* `display: block` drops the inline-SVG baseline gap; `nudgeY` applies
          the per-glyph optical correction. */}
      {Icon && (
        <Icon
          size={iconSize}
          stroke={3}
          style={{
            display: "block",
            transform: nudgeY ? `translateY(${nudgeY}px)` : undefined,
          }}
        />
      )}
    </div>
  );
}

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
        borderRadius: "var(--mantine-radius-sm)",
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

  return (
    <UnstyledButton
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-sm)",
        color: "var(--mantine-color-red-6)",
        background: hovered
          ? "var(--mantine-color-red-light)"
          : "transparent",
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

interface StateCheckboxProps {
  value: TodoState;
  onChange: (value: TodoState) => void;
  onDelete: () => void;
}

/**
 * Custom checkbox that opens a popover to pick the item's status rather than a
 * plain on/off toggle. The popover also hosts the item's delete action.
 */
export function StateCheckbox({ value, onChange, onDelete }: StateCheckboxProps) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      withArrow
      shadow="md"
      radius="md"
      width={160}
    >
      <Popover.Target>
        <UnstyledButton
          aria-label="Change status"
          onClick={() => setOpened((o) => !o)}
          style={{ display: "flex", lineHeight: 0 }}
        >
          <StateBox state={value} />
        </UnstyledButton>
      </Popover.Target>

      <Popover.Dropdown p={4}>
        <Stack gap={2}>
          {TODO_STATES.map((s) => (
            <StateOption
              key={s.value}
              state={s.value}
              selected={s.value === value}
              onSelect={() => {
                onChange(s.value);
                setOpened(false);
              }}
            />
          ))}

          <Divider my={4} />

          <DeleteOption
            onSelect={() => {
              setOpened(false);
              onDelete();
            }}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
