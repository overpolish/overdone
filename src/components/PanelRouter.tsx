import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import { Lists } from "./Lists";
import { Settings } from "./Settings";

type PanelView = "settings" | "lists";

/**
 * Renders the panel's current view. The Rust `show_panel` command emits a
 * `panel:view` event naming which view to show before the window is revealed,
 * so switching views (logo -> settings, lists button -> lists) reuses the one
 * panel window.
 */
export function PanelRouter() {
  const [view, setView] = useState<PanelView>("settings");

  useEffect(() => {
    const unlisten = listen<PanelView>("panel:view", (event) => {
      setView(event.payload);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  return view === "lists" ? <Lists /> : <Settings />;
}
