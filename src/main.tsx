import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { initializeMobileShell } from "./app/mobile-bootstrap";
import { initAnalytics } from "./features/analytics/track";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

void initializeMobileShell();
initAnalytics();
