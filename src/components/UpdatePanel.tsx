/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { IconDownload, IconExternalLink } from "@tabler/icons-react";

import { openExternal } from "../lib/links";
import { STORE_URL } from "../lib/update";
import { ReleaseNotes } from "./ReleaseNotes";

/**
 * The secondary panel shown when a newer version is available: the version, its
 * changelog, and a button out to the store (Payhip) where the build is sold.
 * Wider than the inline title-bar control, so the changelog has room to breathe
 * without a scroll-cramped border.
 */
export function UpdatePanel({
  version,
  notes,
}: {
  version: string;
  notes?: string;
}) {
  return (
    <Stack gap="md" w={360}>
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap={8} wrap="nowrap">
          <IconDownload size={18} stroke={1.8} />
          <Title order={5}>Version {version}</Title>
        </Group>
        <Button
          size="xs"
          leftSection={<IconExternalLink size={14} stroke={1.8} />}
          onClick={() => void openExternal(STORE_URL)}
        >
          Get the update
        </Button>
      </Group>

      {notes ? (
        <ReleaseNotes html={notes} />
      ) : (
        <Text size="sm" c="dimmed">
          A new version is available. Open the store to download it.
        </Text>
      )}
    </Stack>
  );
}
