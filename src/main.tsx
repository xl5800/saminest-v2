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

// 原生感 A 批：iOS 的 WebView 里，页面上没有任何 touchstart 监听时 :active 不会
// 生效（按钮按下去没有变暗反馈）；挂一个空的被动监听就能打开。
document.addEventListener("touchstart", () => {}, { passive: true });

void initializeMobileShell();
initAnalytics();
