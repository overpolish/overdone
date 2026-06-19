/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "overlayscrollbars/styles/overlayscrollbars.css";
import "./theme.css";

import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { PanelHost } from "./components/PanelHost";
import { ScratchpadWindow } from "./components/ScratchpadWindow";
import { zustandColorSchemeManager } from "./lib/color-scheme";
import { theme } from "./theme";

const colorSchemeManager = zustandColorSchemeManager();

/** Which window are we rendering into? Falls back to the main app. */
function currentLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

/** Each OS window loads the same bundle; render its view by window label. */
function Root() {
  switch (currentLabel()) {
    case "panel":
      return <PanelHost />;
    case "scratchpad":
      return <ScratchpadWindow />;
    default:
      return <App />;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
      colorSchemeManager={colorSchemeManager}
    >
      <Root />
    </MantineProvider>
  </React.StrictMode>,
);
