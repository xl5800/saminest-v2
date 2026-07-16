import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })
    }
  })
}));

describe("App", () => {
  it("shows a loading state, then mounts the router at the home page", async () => {
    render(<App />);

    expect(screen.getByRole("status")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Saminest" })
      ).toBeInTheDocument();
    });
  });
});
