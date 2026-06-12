import { Box, Stack, Text, Title } from "@mantine/core";
import { type ReactNode } from "react";

interface PanelProps {
  children?: ReactNode;
}

/**
 * Generic floating secondary panel.
 *
 * The window uses the macOS transparent title bar style (set in the Tauri
 * config, with the traffic-light buttons hidden) so it keeps the native rounded
 * corners and shadow with no visible chrome. The body fills the whole window
 * and paints a solid themed background that follows the app theme (light/dark).
 * Populate with whatever UI is needed later (settings, tags, comments, etc.).
 */
export function Panel({ children }: PanelProps) {
  return (
    <Box
      h="100vh"
      p="md"
      bg="var(--mantine-color-body)"
      style={{ overflow: "auto" }}
    >
      {children ?? <PanelPlaceholder />}
    </Box>
  );
}

function PanelPlaceholder() {
  return (
    <Stack gap={4}>
      <Title order={5}>Panel</Title>
      <Text size="sm" c="dimmed">
        Secondary panel. Populate with settings, tags, comments, etc.
      </Text>
    </Stack>
  );
}
