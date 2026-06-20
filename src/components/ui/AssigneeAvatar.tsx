/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Tooltip, UnstyledButton } from "@mantine/core";
import { IconCirclePlus } from "@tabler/icons-react";

import { initials, readableText } from "../../lib/assignee";
import { type Assignee } from "../../lib/todos";

/** A circular, initialed, colored badge for one assignee, with a name tooltip. */
export function AssigneeAvatar({
  assignee,
  size = 22,
  withTooltip = true,
}: {
  assignee: Assignee;
  size?: number;
  withTooltip?: boolean;
}) {
  const badge = (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        lineHeight: 1,
        color: readableText(assignee.color),
        userSelect: "none",
        // Avoid sitting on the text baseline when used in an inline context.
        verticalAlign: "middle",
        background: assignee.color,
      }}
    >
      {initials(assignee.name)}
    </span>
  );
  if (!withTooltip) return badge;
  return (
    <Tooltip label={assignee.name} withArrow openDelay={300}>
      {badge}
    </Tooltip>
  );
}

/** Empty-state control: an add-circle to add a first assignee. `size` is the
 * avatar-disc footprint to match (not the raw icon size): IconCirclePlus insets
 * its ring to ~75% of the icon box, so we draw the icon larger and center it in
 * a `size`-wide box (the overflow is transparent). That makes its visible ring
 * the same diameter and center as a filled avatar disc in adjacent rows. */
export function AddAssigneeButton({
  size = 14,
  onClick,
}: {
  size?: number;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Tooltip label="Assign" withArrow openDelay={300}>
      <UnstyledButton
        aria-label="Assign someone"
        onClick={onClick}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          // Match the row's details/comment icon (subtle gray ActionIcon); no
          // hover state of its own - the row's hover already reveals it.
          color: "var(--mantine-color-gray-light-color)",
        }}
      >
        <IconCirclePlus size={Math.round(size / 0.75)} stroke={1.8} />
      </UnstyledButton>
    </Tooltip>
  );
}

/** A row of avatars; collapses the overflow into a "+k" chip. Now that avatars
 * are ringless, they sit side by side with a small gap rather than overlapping
 * (which relied on the ring to stay separated). */
export function AssigneeAvatars({
  assignees,
  size = 20,
  max = 3,
}: {
  assignees: Assignee[];
  size?: number;
  max?: number;
}) {
  if (assignees.length === 0) return null;
  const shown = assignees.slice(0, max);
  const extra = assignees.length - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {shown.map((a) => (
        <AssigneeAvatar key={a.id} assignee={a} size={size} />
      ))}
      {extra > 0 && (
        <Tooltip
          label={assignees.slice(max).map((a) => a.name).join(", ")}
          withArrow
          openDelay={300}
        >
          <span
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: Math.round(size * 0.38),
              fontWeight: 600,
              color: "var(--mantine-color-dimmed)",
              background: "var(--mantine-color-default)",
            }}
          >
            +{extra}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
