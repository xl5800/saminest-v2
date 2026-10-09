import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostImageCarousel } from "./post-image-carousel";

function makeUrls(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `https://img.example.com/${i + 1}.jpg`);
}

/** jsdom 没有布局，clientWidth 恒为 0——手动给滚动容器一个宽度和 scrollLeft。 */
function scrollTo(scroller: HTMLElement, scrollLeft: number, clientWidth = 300): void {
  Object.defineProperty(scroller, "clientWidth", { configurable: true, value: clientWidth });
  scroller.scrollLeft = scrollLeft;
  fireEvent.scroll(scroller);
}

/** jsdom 没有 PointerEvent，fireEvent.pointerDown 造出来的是普通 Event，没有
 *  clientX——手动补上，React 的合成事件才能读到。 */
function pointerDown(element: HTMLElement, clientX: number): void {
  const event = createEvent.pointerDown(element);
  Object.defineProperty(event, "clientX", { value: clientX });
  fireEvent(element, event);
}

function activeDotIndex(): number {
  const dots = screen.getByRole("img", { name: /第 \d+ 张/ }).querySelectorAll("[data-active]");
  return Array.from(dots).findIndex((dot) => dot.getAttribute("data-active") === "true");
}

describe("PostImageCarousel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<PostImageCarousel images={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a single image without scroller or dots, using the given aspect ratio", () => {
    const { container } = render(<PostImageCarousel images={makeUrls(1)} aspectRatio="1 / 1" />);

    expect(container.querySelector("img")).toHaveAttribute("src", makeUrls(1)[0]);
    expect(container.querySelector("img")).toHaveClass("object-cover");
    expect(container.firstElementChild).toHaveStyle({ aspectRatio: "1 / 1" });
    expect(screen.queryByTestId("post-image-carousel-scroller")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /第 \d+ 张/ })).not.toBeInTheDocument();
  });

  it("defaults the aspect ratio to 4 / 3", () => {
    const { container } = render(<PostImageCarousel images={makeUrls(1)} />);

    expect(container.firstElementChild).toHaveStyle({ aspectRatio: "4 / 3" });
  });

  it("renders several images in a snap-scrolling row with one dot per image, first one active", () => {
    const { container } = render(<PostImageCarousel images={makeUrls(3)} />);

    const scroller = screen.getByTestId("post-image-carousel-scroller");
    expect(scroller).toHaveClass("overflow-x-auto", "snap-x", "snap-mandatory");
    expect(Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"))).toEqual(
      makeUrls(3)
    );
    expect(screen.getByRole("img", { name: "第 1 张，共 3 张" })).toBeInTheDocument();
    expect(activeDotIndex()).toBe(0);
  });

  it("moves the active dot as the scroller scrolls", () => {
    render(<PostImageCarousel images={makeUrls(5)} />);
    const scroller = screen.getByTestId("post-image-carousel-scroller");

    scrollTo(scroller, 600);
    expect(activeDotIndex()).toBe(2);
    expect(screen.getByRole("img", { name: "第 3 张，共 5 张" })).toBeInTheDocument();

    scrollTo(scroller, 1190);
    expect(activeDotIndex()).toBe(4);

    scrollTo(scroller, 0);
    expect(activeDotIndex()).toBe(0);
  });

  it("handles the maximum of 9 images", () => {
    render(<PostImageCarousel images={makeUrls(9)} />);
    const scroller = screen.getByTestId("post-image-carousel-scroller");

    expect(screen.getByRole("img", { name: "第 1 张，共 9 张" }).querySelectorAll("[data-active]")).toHaveLength(9);
    scrollTo(scroller, 300 * 8);
    expect(activeDotIndex()).toBe(8);
  });

  describe("click vs swipe", () => {
    it("calls onImageClick with the clicked image's own index on a still click", () => {
      const onImageClick = vi.fn();
      render(<PostImageCarousel images={makeUrls(4)} onImageClick={onImageClick} />);
      const scroller = screen.getByTestId("post-image-carousel-scroller");
      scrollTo(scroller, 600);

      pointerDown(scroller, 100);
      fireEvent.click(screen.getByRole("button", { name: "查看大图 3" }), { clientX: 100 });

      expect(onImageClick).toHaveBeenCalledTimes(1);
      expect(onImageClick).toHaveBeenCalledWith(2);
    });

    it("works for a single image too", () => {
      const onImageClick = vi.fn();
      render(<PostImageCarousel images={makeUrls(1)} onImageClick={onImageClick} />);

      fireEvent.click(screen.getByRole("button", { name: "查看大图 1" }));

      expect(onImageClick).toHaveBeenCalledWith(0);
    });

    it("does not call onImageClick when the pointer moved horizontally between down and click", () => {
      const onImageClick = vi.fn();
      render(<PostImageCarousel images={makeUrls(3)} onImageClick={onImageClick} />);
      const scroller = screen.getByTestId("post-image-carousel-scroller");

      pointerDown(scroller, 200);
      fireEvent.click(screen.getByRole("button", { name: "查看大图 1" }), { clientX: 120 });

      expect(onImageClick).not.toHaveBeenCalled();
    });

    it("does not call onImageClick when the scroll position changed between down and click", () => {
      const onImageClick = vi.fn();
      render(<PostImageCarousel images={makeUrls(3)} onImageClick={onImageClick} />);
      const scroller = screen.getByTestId("post-image-carousel-scroller");

      pointerDown(scroller, 100);
      scrollTo(scroller, 300);
      fireEvent.click(screen.getByRole("button", { name: "查看大图 2" }), { clientX: 100 });

      expect(onImageClick).not.toHaveBeenCalled();
    });

    it("also swallows the click for an enclosing <Link> after a swipe, but lets a still click through", () => {
      const onLinkClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
      render(
        <MemoryRouter>
          <a href="/post/1" onClick={onLinkClick}>
            <PostImageCarousel images={makeUrls(3)} />
          </a>
        </MemoryRouter>
      );
      const scroller = screen.getByTestId("post-image-carousel-scroller");
      const firstImage = scroller.querySelector("img") as HTMLElement;

      pointerDown(scroller, 200);
      fireEvent.click(firstImage, { clientX: 100 });
      expect(onLinkClick).not.toHaveBeenCalled();

      pointerDown(scroller, 200);
      fireEvent.click(firstImage, { clientX: 200 });
      expect(onLinkClick).toHaveBeenCalledTimes(1);
    });

    it("renders plain images (no buttons) when onImageClick is not provided", () => {
      render(<PostImageCarousel images={makeUrls(3)} />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
