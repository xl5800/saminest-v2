import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Fab } from "./fab";

describe("Fab", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the given label", () => {
    render(<Fab label="发起搭子" onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: /发起搭子/ })).toBeInTheDocument();
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<Fab label="发布" onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: /发布/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("defaults to the primary (default) blue background", () => {
    render(<Fab label="发布" onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: /发布/ })).toHaveClass("bg-primary");
  });

  it("uses the darker 'dark' variant background when requested, for scene differentiation (e.g. 找搭子)", () => {
    render(<Fab label="发起搭子" variant="dark" onClick={vi.fn()} />);

    const button = screen.getByRole("button", { name: /发起搭子/ });
    expect(button).toHaveClass("bg-primary-dark");
    expect(button).not.toHaveClass("bg-primary");
  });

  it("disables the button and does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(<Fab label="发布" onClick={onClick} disabled />);

    const button = screen.getByRole("button", { name: /发布/ });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
