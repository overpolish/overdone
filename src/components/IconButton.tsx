import { UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { type IconProps } from "@tabler/icons-react";
import { type ComponentType, useState } from "react";

import { dangerBg, dangerFg } from "../lib/styles";

interface IconButtonProps {
  label: string;
  icon: ComponentType<IconProps>;
  onClick: () => void;
  /** Tints red on hover (destructive actions like close / delete). */
  danger?: boolean;
}

/**
 * A small square icon button: dimmed and chrome-free at rest, gaining a hover
 * surface (red for destructive actions) only on pointer-over. Shared by the
 * title bar's window controls and the comment log's edit/delete actions.
 */
export function IconButton({ label, icon: Icon, onClick, danger }: IconButtonProps) {
  const [hovered, setHovered] = useState(false);
  const dark = useComputedColorScheme("light") === "dark";

  return (
    <UnstyledButton
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // Re-enable events for the button; some hosts (the title bar) sit in a
        // drag region that disables them.
        pointerEvents: "auto",
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--mantine-radius-md)",
        opacity: hovered ? 1 : 0.5,
        color: danger && hovered ? dangerFg(dark) : "var(--mantine-color-dimmed)",
        background: hovered
          ? danger
            ? dangerBg(dark)
            : "var(--mantine-color-default-hover)"
          : "transparent",
        transition: "opacity 120ms ease, background 120ms ease, color 120ms ease",
      }}
    >
      <Icon size={14} stroke={2} style={{ display: "block" }} />
    </UnstyledButton>
  );
}
