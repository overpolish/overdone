/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { UnstyledButton } from "@mantine/core";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface PickerOptionProps {
  onSelect: () => void;
  children: ReactNode;
  /** Bold the row - the value currently applied. */
  bold?: boolean;
  /** Controlled highlight for keyboard navigation. When provided, the row's wash
   *  follows this prop instead of its own hover, and it scrolls into view as it
   *  becomes highlighted. Pair with `onHover` so the mouse can take it back. */
  highlighted?: boolean;
  /** Mouse moved over the row (controlled mode): hand the highlight back to it. */
  onHover?: () => void;
}

/**
 * One suggestion row, shared by the label, assignee, and code-language pickers.
 * `onMouseDown` (not click) so it fires before the field's blur closes the list.
 * By default the row tracks its own hover; pass `highlighted`/`onHover` to drive
 * it from keyboard navigation instead - then the mouse only takes the highlight on
 * actual movement (`onMouseMove`), so it doesn't fight the arrow keys under a
 * stationary pointer.
 */
export function PickerOption({ onSelect, children, bold, highlighted, onHover }: PickerOptionProps) {
  const controlled = onHover !== undefined;
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const lit = controlled ? Boolean(highlighted) : hovered;

  // Keep the keyboard-highlighted row in view as it moves past an edge.
  useEffect(() => {
    if (controlled && highlighted) ref.current?.scrollIntoView({ block: "nearest" });
  }, [controlled, highlighted]);

  return (
    <UnstyledButton
      ref={ref}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={controlled ? undefined : () => setHovered(true)}
      onMouseLeave={controlled ? undefined : () => setHovered(false)}
      onMouseMove={onHover}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        textAlign: "left",
        fontWeight: bold ? 600 : undefined,
        background: lit ? "var(--mantine-color-default-hover)" : "transparent",
      }}
    >
      {children}
    </UnstyledButton>
  );
}
