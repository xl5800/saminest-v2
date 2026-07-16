import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePage } from "./home-page";

describe("HomePage", () => {
  it("renders a page skeleton", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "Saminest" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
