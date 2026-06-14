import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "./theme.css";

import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { PanelHost } from "./components/PanelHost";
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

const isPanel = currentLabel() === "panel";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
      colorSchemeManager={colorSchemeManager}
    >
      {isPanel ? <PanelHost /> : <App />}
    </MantineProvider>
  </React.StrictMode>,
);
