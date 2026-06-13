import { Tooltip, UnstyledButton } from "@mantine/core";
import { IconCirclePlus } from "@tabler/icons-react";

import { initials } from "../lib/assignee";
import { type Assignee } from "../lib/todos";

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
        color: "#fff",
        userSelect: "none",
        // Avoid sitting on the text baseline when used in an inline context.
        verticalAlign: "middle",
        background: assignee.color,
        // A subtle ring so overlapping avatars stay visually separated against
        // any background.
        boxShadow: "0 0 0 1.5px var(--mantine-color-body)",
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

/** Empty-state control: a dashed circle with a plus, to add a first assignee. */
export function AddAssigneeButton({
  size = 18,
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
          display: "flex",
          color: "var(--mantine-color-dimmed)",
        }}
      >
        <IconCirclePlus size={size} stroke={1.8} />
      </UnstyledButton>
    </Tooltip>
  );
}

/** An overlapping stack of avatars; collapses the overflow into a "+k" chip. */
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
    <div style={{ display: "flex", alignItems: "center", paddingInline: 2 }}>
      {shown.map((a, i) => (
        <div
          key={a.id}
          style={{ display: "flex", marginLeft: i === 0 ? 0 : -size * 0.35 }}
        >
          <AssigneeAvatar assignee={a} size={size} />
        </div>
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
              marginLeft: -size * 0.35,
              borderRadius: "50%",
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: Math.round(size * 0.38),
              fontWeight: 600,
              color: "var(--mantine-color-dimmed)",
              background: "var(--mantine-color-default)",
              boxShadow: "0 0 0 1.5px var(--mantine-color-body)",
            }}
          >
            +{extra}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
