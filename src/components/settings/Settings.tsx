/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Group, SegmentedControl, Stack, Title } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { useState } from "react";

import { type Assignee, type Label } from "../../lib/todos";
import { AssigneeSettings } from "./AssigneeSettings";
import { GlobalSettings } from "./GlobalSettings";
import { LabelSettings } from "./LabelSettings";

/** Which settings category the pill nav is showing. */
type SettingsTab = "global" | "list";

export function Settings({
  roster = [],
  labels = [],
}: {
  roster?: Assignee[];
  labels?: Label[];
}) {
  const [tab, setTab] = useState<SettingsTab>("global");

  return (
    <Stack gap="md" w={300}>
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap={8} wrap="nowrap">
          <IconSettings size={18} stroke={1.8} />
          <Title order={5}>Settings</Title>
        </Group>
        <SegmentedControl
          size="xs"
          value={tab}
          onChange={(value) => setTab(value as SettingsTab)}
          data={[
            { label: "Global", value: "global" },
            { label: "List", value: "list" },
          ]}
        />
      </Group>

      {tab === "list" ? (
        <Stack gap="lg">
          <LabelSettings initial={labels} />
          <AssigneeSettings initial={roster} />
        </Stack>
      ) : (
        <GlobalSettings />
      )}
    </Stack>
  );
}
