/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Group, Stack, Text, TextInput } from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { IconBell, IconCalendar } from "@tabler/icons-react";
import { listen } from "@tauri-apps/api/event";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { type DatesSync, emitDatesAction } from "../../lib/panel";

// Mantine's date components speak strings: dates are "YYYY-MM-DD", date-times
// "YYYY-MM-DD HH:mm:ss" (local wall-clock). The store keeps epoch ms, so convert
// at the boundary. A due date is stored at local midnight (date-only).
const DATE_FMT = "YYYY-MM-DD";
const DATETIME_FMT = "YYYY-MM-DD HH:mm:ss";

const toDateStr = (ms: number | undefined) => (ms == null ? null : dayjs(ms).format(DATE_FMT));
const toDateTimeStr = (ms: number | undefined) =>
  ms == null ? null : dayjs(ms).format(DATETIME_FMT);
const fromStr = (s: string | null) => (s ? dayjs(s).valueOf() : undefined);

/** Today at 00:00 as a date string - the floor for both fields (no past dates). */
const todayStr = () => dayjs().startOf("day").format(DATE_FMT);

/**
 * Controller for editing one item's notification time, reminder body, and due
 * date. Holds the working set locally and streams each change back to the main
 * window (the list owner) which persists it. All values are sent together so
 * clearing one is unambiguous. A back-sync keeps an open panel live, so a
 * comment that sets a reminder shows up here without a reopen.
 */
export function useDatesEditor(
  itemId: string,
  initialNotifyAt: number | undefined,
  initialDueDate: number | undefined,
  initialNotifyMessage: string | undefined,
) {
  const [notifyAt, setNotifyAtState] = useState(initialNotifyAt);
  const [dueDate, setDueDateState] = useState(initialDueDate);
  const [notifyMessage, setNotifyMessageState] = useState(initialNotifyMessage);

  const setNotifyAt = (ms: number | undefined) => {
    // Clearing the reminder drops its message too - there's nothing left to
    // attach it to (and a stale body shouldn't ride a future reminder).
    const msg = ms == null ? undefined : notifyMessage;
    setNotifyAtState(ms);
    setNotifyMessageState(msg);
    emitDatesAction({ itemId, notifyAt: ms, dueDate, notifyMessage: msg });
  };
  const setDueDate = (ms: number | undefined) => {
    setDueDateState(ms);
    emitDatesAction({ itemId, notifyAt, dueDate: ms, notifyMessage });
  };
  const setNotifyMessage = (msg: string | undefined) => {
    setNotifyMessageState(msg);
    emitDatesAction({ itemId, notifyAt, dueDate, notifyMessage: msg });
  };

  // Adopt date changes the main window broadcasts for this item (a comment that
  // set a reminder, undo/redo). Uses the raw setters, not the emitting ones, so
  // adopting an echo of our own edit doesn't loop back to the store.
  useEffect(() => {
    const un = listen<DatesSync>("dates:sync", (e) => {
      const d = e.payload.byItem[itemId];
      if (!d) return;
      setNotifyAtState(d.notifyAt);
      setDueDateState(d.dueDate);
      setNotifyMessageState(d.notifyMessage);
    });
    return () => {
      void un.then((off) => off());
    };
  }, [itemId]);

  return {
    notifyAt,
    dueDate,
    notifyMessage,
    setNotifyAt,
    setDueDate,
    setNotifyMessage,
  };
}

/**
 * Notification time + due date, stacked in the panel's right column. Each opens
 * a Mantine picker in a popover (floats over the panel rather than growing it);
 * both are floored to today so nothing can be scheduled in the past. When a
 * notify time is set, an optional message field appears under it: that text is
 * what the reminder shows instead of the item's own text.
 */
export function DatesSection({ dates }: { dates: ReturnType<typeof useDatesEditor> }) {
  const min = todayStr();
  const icon = (Icon: typeof IconBell) => (
    <Icon size={14} stroke={1.8} style={{ display: "block" }} />
  );

  // A notification can't fire in the past: minDate blocks past days, and this
  // clamps a same-day time that's already gone up to now.
  const changeNotify = (s: string | null) => {
    let ms = fromStr(s);
    if (ms != null && ms < Date.now()) ms = Date.now();
    dates.setNotifyAt(ms);
  };

  return (
    <>
      <Stack gap={6}>
        {/* Match the COMMENTS column's header row (fixed h=22 for the format
            icons, gap=6) so the field below lines up with the comment composer
            across the gap. */}
        <Group h={22} align="center" wrap="nowrap">
          <Text size="xs" fw={600} c="dimmed">
            NOTIFY
          </Text>
        </Group>
        <DateTimePicker
          size="xs"
          clearable
          minDate={min}
          value={toDateTimeStr(dates.notifyAt)}
          onChange={changeNotify}
          defaultTimeValue={dayjs().format("HH:mm")}
          valueFormat="MMM D, h:mm A"
          placeholder="Set…"
          leftSection={icon(IconBell)}
          // Open to the left of the field - it lives in the panel's right
          // column, so dropping down/right would clip against the window edge.
          popoverProps={{ position: "left-start" }}
          // Plain spin fields, no nested time dropdown (it would clip / stack a
          // second popover); commit is live, so hide the submit ✓ - the popover
          // closes on outside-click.
          timePickerProps={{ withDropdown: false, format: "12h" }}
          submitButtonProps={{ style: { display: "none" } }}
        />
        {/* The reminder's custom body: when set, this is what the notification
            shows instead of the item's text. Live like the rest of the panel -
            no submit; an empty field clears it back to the item-text default. */}
        <TextInput
          size="xs"
          placeholder="Message (optional)..."
          value={dates.notifyMessage ?? ""}
          onChange={(e) => dates.setNotifyMessage(e.currentTarget.value || undefined)}
        />
      </Stack>
      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed">
          DUE
        </Text>
        <DatePickerInput
          size="xs"
          clearable
          minDate={min}
          value={toDateStr(dates.dueDate)}
          onChange={(s) => dates.setDueDate(fromStr(s))}
          valueFormat="MMM D, YYYY"
          placeholder="Set…"
          leftSection={icon(IconCalendar)}
          // Open to the left (see NOTIFY above) so the calendar clears the window edge.
          popoverProps={{ position: "left-start" }}
        />
      </Stack>
    </>
  );
}
