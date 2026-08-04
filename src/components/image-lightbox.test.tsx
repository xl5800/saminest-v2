import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImageLightbox } from "./image-lightbox";

const images = [
  "https://img.example.com/1.jpg",
  "https://img.example.com/2.jpg",
  "https://img.example.com/3.jpg"
];

describe("ImageLightbox", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the image at initialIndex", () => {
    render(<ImageLightbox images={images} initialIndex={1} onClose={vi.fn()} />);

    expect(screen.getByRole("img")).toHaveAttribute("src", images[1]);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={images} initialIndex={0} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop (dialog container) is clicked", () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={images} initialIndex={0} onClose={onClose} />);

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the image itself is clicked", () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={images} initialIndex={0} onClose={onClose} />);

    fireEvent.click(screen.getByRole("img"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={images} initialIndex={0} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cycles to the next image without closing, wrapping from the last back to the first", () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={images} initialIndex={2} onClose={onClose} />);

    expect(screen.getByRole("img")).toHaveAttribute("src", images[2]);
    fireEvent.click(screen.getByRole("button", { name: "下一张" }));

    expect(screen.getByRole("img")).toHaveAttribute("src", images[0]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cycles to the previous image without closing, wrapping from the first back to the last", () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={images} initialIndex={0} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "上一张" }));

    expect(screen.getByRole("img")).toHaveAttribute("src", images[2]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not render navigation buttons or the page indicator when there is only one image", () => {
    render(<ImageLightbox images={[images[0]]} initialIndex={0} onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "上一张" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一张" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it("shows the correct page indicator text for multiple images", () => {
    render(<ImageLightbox images={images} initialIndex={1} onClose={vi.fn()} />);

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });
});
