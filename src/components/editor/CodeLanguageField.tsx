/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Popover } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import { codeLanguages } from "../../lib/highlight";
import { PickerOption } from "../ui/PickerOption";
import { ScrollArea } from "../ui/ScrollArea";

/**
 * The in-block language field: an unstyled input with a suggestion popover whose
 * rows match the label/assignee pickers. The input doubles as the search; picking
 * (or Enter) commits the language and blurs the field, while typing then blurring
 * commits whatever was entered (an unknown name just auto-detects on highlight).
 */
export function CodeLanguageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (lang: string) => void;
}) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  // The keyboard-highlighted row (arrow keys move it, Enter picks it).
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when a row is picked so the blur it triggers doesn't re-commit the stale
  // search text (the pick already committed; setSearch hasn't flushed yet).
  const justPicked = useRef(false);

  // Reflect external language changes (e.g. undo) while not being edited.
  useEffect(() => {
    if (!open) setSearch(value);
  }, [value, open]);

  const q = search.trim().toLowerCase();
  const matches = (q ? codeLanguages.filter((l) => l.includes(q)) : codeLanguages).slice(0, 60);
  // Clamp the highlight in case the match list shrank under it.
  const highlight = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  const pick = (lang: string) => {
    justPicked.current = true;
    setSearch(lang);
    onChange(lang);
    setOpen(false);
    // Selecting commits and drops focus, so the dropdown doesn't reopen.
    inputRef.current?.blur();
  };

  return (
    <Box component="span" contentEditable={false} style={{ flex: 1, minWidth: 0, display: "block" }}>
      <Popover
        opened={open && matches.length > 0}
        onChange={setOpen}
        position="bottom-start"
        offset={2}
        width={132}
        shadow="md"
        radius="md"
        trapFocus={false}
        returnFocus={false}
        withinPortal
      >
        <Popover.Target>
          <input
            ref={inputRef}
            className="code-block-lang"
            spellCheck={false}
            placeholder="auto"
            aria-label="Code language"
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => {
              setActiveIndex(0);
              setOpen(true);
            }}
            onBlur={() => {
              setOpen(false);
              if (justPicked.current) {
                justPicked.current = false;
                return;
              }
              if (search !== value) onChange(search.trim());
            }}
            onKeyDown={(e) => {
              // Keep field keys from reaching the editor (Backspace deleting the block).
              e.stopPropagation();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setOpen(true);
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(matches[highlight] ?? search.trim());
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </Popover.Target>
        <Popover.Dropdown p={0} style={{ overflow: "hidden" }}>
          <ScrollArea maxHeight={104} radius={0}>
            <Box p={4}>
              {matches.map((lang, i) => (
                <PickerOption
                  key={lang}
                  bold={lang === value}
                  highlighted={i === highlight}
                  onHover={() => setActiveIndex(i)}
                  onSelect={() => pick(lang)}
                >
                  {/* Size the row text explicitly (xs) like the label/assignee
                      pickers - the dropdown's inherited font doesn't reach here. */}
                  <span style={{ fontSize: "var(--mantine-font-size-xs)" }}>{lang}</span>
                </PickerOption>
              ))}
            </Box>
          </ScrollArea>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}
