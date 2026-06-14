/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Anchor, Box, Group, Stack, Text } from "@mantine/core";
import { IconWorld } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { linkLabel, openExternal, scanCommentLinks } from "../../lib/links";
import { type Comment } from "../../lib/todos";
import { ScrollArea } from "../ScrollArea";

/** The site's favicon (via Google's service), falling back to a generic globe
 * if the host has none or the fetch fails. Decorative, so it carries no alt. */
function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const host = useMemo(() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  }, [url]);

  if (failed || !host) {
    return (
      <IconWorld
        size={14}
        stroke={1.8}
        style={{ display: "block", flexShrink: 0, color: "var(--mantine-color-dimmed)" }}
      />
    );
  }

  return (
    <img
      // sz=64 so the 14px render stays crisp on hi-dpi displays.
      src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`}
      alt=""
      width={14}
      height={14}
      onError={() => setFailed(true)}
      style={{ display: "block", flexShrink: 0, borderRadius: 2 }}
    />
  );
}

/** A link's clickable label - opens in the default browser. */
function LinkText({ url, title }: { url: string; title?: string }) {
  return (
    <Anchor
      size="xs"
      underline="always"
      href={url}
      title={url}
      onClick={(e) => {
        e.preventDefault();
        void openExternal(url);
      }}
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {linkLabel({ url, title })}
    </Anchor>
  );
}

/**
 * A read-only roll-up of the links found in an item's comments, shown full-width
 * below the comment log. There's no separate saved list: a link's "when" is the
 * comment it lives in, so comments are the single source of truth - to add or
 * remove a link, edit the comment. Deduped by URL, newest mention first.
 */
export function LinksSection({ comments }: { comments: Comment[] }) {
  const links = useMemo(() => scanCommentLinks(comments), [comments]);

  return (
    <Stack gap="xs">
      <Text size="xs" fw={600} c="dimmed">
        LINKS
      </Text>

      {links.length > 0 ? (
        <ScrollArea maxHeight={180}>
          <Stack gap={2} pr={4}>
            {links.map((l) => (
              <Group key={l.url} gap={6} wrap="nowrap" style={{ minWidth: 0, padding: "2px 4px" }}>
                <Favicon url={l.url} />
                <Box style={{ minWidth: 0, display: "flex" }}>
                  <LinkText url={l.url} title={l.title} />
                </Box>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      ) : (
        <Text size="xs" c="dimmed">
          Links shared in comments show up here.
        </Text>
      )}
    </Stack>
  );
}
