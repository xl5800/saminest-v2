import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders a pulsing, aria-hidden placeholder block with the border-colored background", () => {
    const { container } = render(<Skeleton className="h-4 w-3/4" />);

    const block = container.firstElementChild;
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block).toHaveClass("animate-pulse", "rounded-md", "bg-border", "h-4", "w-3/4");
  });

  it("renders without crashing when no className is provided", () => {
    const { container } = render(<Skeleton />);

    const block = container.firstElementChild;
    expect(block).toHaveClass("animate-pulse", "rounded-md", "bg-border");
  });
});
