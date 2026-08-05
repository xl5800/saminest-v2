import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value
  });
}

function renderShell(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/*" element={<AppShell />}>
          <Route index element={<p>page content</p>} />
          <Route path="login" element={<p>login page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    cleanup();
    setNavigatorOnLine(true);
  });

  it("does not show the offline banner while online", () => {
    renderShell();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a '网络连接已断开' banner when navigator.onLine is false", () => {
    setNavigatorOnLine(false);

    renderShell();

    expect(screen.getByRole("alert")).toHaveTextContent("网络连接已断开");
  });

  it("shows the offline banner on immersive routes too (not gated by isImmersive)", () => {
    setNavigatorOnLine(false);

    renderShell("/login");

    expect(screen.getByRole("alert")).toHaveTextContent("网络连接已断开");
    expect(
      screen.queryByRole("navigation", { name: "底部导航" })
    ).not.toBeInTheDocument();
  });
});
