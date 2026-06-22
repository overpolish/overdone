/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { UnstyledButton } from "@mantine/core";
import { useState } from "react";

/** A pill toggle with an icon/text label and a selected (primary) state. */
export function ToggleChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <UnstyledButton
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: "var(--mantine-radius-xl)",
        fontSize: "var(--mantine-font-size-xs)",
        border: `1px solid ${
          selected
            ? "var(--mantine-primary-color-filled)"
            : "var(--mantine-color-default-border)"
        }`,
        background: selected
          ? "var(--mantine-primary-color-light)"
          : hovered
            ? "var(--mantine-color-default-hover)"
            : "transparent",
        color: selected
          ? "var(--mantine-color-text)"
          : "var(--mantine-color-dimmed)",
        transition:
          "background 120ms ease, border-color 120ms ease, color 120ms ease",
      }}
    >
      {children}
    </UnstyledButton>
  );
}

/** A bare toggle for an already-styled pill (e.g. a label badge): dim when
 * unselected, full + a ring when selected, so the badge's own color shows. */
export function PillToggle({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        display: "inline-flex",
        borderRadius: "var(--mantine-radius-xl)",
        opacity: selected ? 1 : 0.5,
        boxShadow: selected
          ? "0 0 0 2px var(--mantine-primary-color-filled)"
          : "none",
        transition: "opacity 120ms ease, box-shadow 120ms ease",
      }}
    >
      {children}
    </UnstyledButton>
  );
}
