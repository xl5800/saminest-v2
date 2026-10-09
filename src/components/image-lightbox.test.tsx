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

  // 真实 bug 修复 + 关闭按钮位置调整任务卡：关闭按钮要叠在图片本身左上角
  // （跟 img 共享同一个 relative 容器），不是挂在最外层浮层（dialog）上，
  // 防止以后不小心又挪回页面级别的固定栏，重蹈这次任务卡诊断出的安全区
  // 定位缺失覆辙。
  it("renders the close button as an overlay on the image itself (same parent as the img), not directly on the outer dialog", () => {
    render(<ImageLightbox images={images} initialIndex={0} onClose={vi.fn()} />);

    const closeButton = screen.getByRole("button", { name: "关闭" });
    const img = screen.getByRole("img");
    const dialog = screen.getByRole("dialog");

    expect(closeButton.parentElement).toBe(img.parentElement);
    expect(closeButton.parentElement).not.toBe(dialog);
  });

  describe("touch swipe", () => {
    function swipe(from: [number, number], to: [number, number]): void {
      const dialog = screen.getByRole("dialog");
      fireEvent.touchStart(dialog, { touches: [{ clientX: from[0], clientY: from[1] }] });
      fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
    }

    it("shows the next image when swiping left", () => {
      render(<ImageLightbox images={images} initialIndex={0} onClose={vi.fn()} />);

      swipe([300, 200], [100, 205]);

      expect(screen.getByRole("img")).toHaveAttribute("src", images[1]);
    });

    it("shows the previous image when swiping right", () => {
      render(<ImageLightbox images={images} initialIndex={1} onClose={vi.fn()} />);

      swipe([100, 200], [300, 195]);

      expect(screen.getByRole("img")).toHaveAttribute("src", images[0]);
    });

    it("ignores short movements and mostly-vertical movements", () => {
      render(<ImageLightbox images={images} initialIndex={1} onClose={vi.fn()} />);

      swipe([200, 200], [230, 200]);
      expect(screen.getByRole("img")).toHaveAttribute("src", images[1]);

      swipe([200, 100], [280, 400]);
      expect(screen.getByRole("img")).toHaveAttribute("src", images[1]);
    });

    it("does nothing (and does not close) when swiping with only one image", () => {
      const onClose = vi.fn();
      render(<ImageLightbox images={[images[0]]} initialIndex={0} onClose={onClose} />);

      swipe([300, 200], [100, 200]);

      expect(screen.getByRole("img")).toHaveAttribute("src", images[0]);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("keeps the buttons and the N / M indicator working alongside swipe", () => {
      render(<ImageLightbox images={images} initialIndex={0} onClose={vi.fn()} />);

      swipe([300, 200], [100, 200]);
      fireEvent.click(screen.getByRole("button", { name: "下一张" }));

      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });
  });
});
