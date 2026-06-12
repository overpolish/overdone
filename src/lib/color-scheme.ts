import type { MantineColorSchemeManager } from "@mantine/core";

import { useSettings } from "./settings";

/**
 * Mantine color-scheme manager backed by the zustand settings store, so the
 * theme rides the same cross-window sync + persistence as every other setting.
 *
 * The `subscribe` guard (`state.colorScheme !== prev.colorScheme`) is what keeps
 * Mantine from looping: Mantine subscribes with its `setColorScheme`, which
 * calls `set` again - we only forward genuine value changes.
 */
export function zustandColorSchemeManager(): MantineColorSchemeManager {
  let unsubscribe: (() => void) | undefined;

  return {
    get: (defaultValue) => useSettings.getState().colorScheme ?? defaultValue,

    set: (value) => useSettings.getState().setColorScheme(value),

    subscribe: (onUpdate) => {
      unsubscribe = useSettings.subscribe((state, prev) => {
        if (state.colorScheme !== prev.colorScheme) {
          onUpdate(state.colorScheme);
        }
      });
    },

    unsubscribe: () => {
      unsubscribe?.();
      unsubscribe = undefined;
    },

    clear: () => useSettings.getState().setColorScheme("auto"),
  };
}
