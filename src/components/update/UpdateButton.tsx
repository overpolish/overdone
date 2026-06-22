/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Tooltip, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";

import { openUpdatePanel } from "../../lib/panel";
import { updateFg } from "../../lib/styles";
import { selectUpdateAvailable, useUpdate } from "../../lib/update";

/**
 * A title-bar call-to-action that appears only when a newer release exists -
 * nobody needs to see their current version, just whether to update. Clicking
 * opens the changelog panel, which links out to the store.
 */
export function UpdateButton() {
  const available = useUpdate(selectUpdateAvailable);
  const latestVersion = useUpdate((s) => s.latestVersion);
  const latestNotes = useUpdate((s) => s.latestNotes);
  const dark = useComputedColorScheme("light") === "dark";

  if (!available || !latestVersion) return null;

  return (
    <Tooltip label={`Version ${latestVersion} available`} withArrow openDelay={300}>
      <UnstyledButton
        aria-label={`Update to version ${latestVersion}`}
        onClick={() => openUpdatePanel(latestVersion, latestNotes)}
        style={{
          pointerEvents: "auto",
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: updateFg(dark),
        }}
      >
        <IconDownload size={15} stroke={2} style={{ display: "block" }} />
      </UnstyledButton>
    </Tooltip>
  );
}
