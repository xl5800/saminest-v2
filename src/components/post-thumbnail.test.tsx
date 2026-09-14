import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PostThumbnail } from "./post-thumbnail";

describe("PostThumbnail", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an <img> with the cover image url and the given sizeClassName when coverImageUrl is present", () => {
    const { container } = render(
      <PostThumbnail
        coverImageUrl="https://img.example.com/cover.jpg"
        categoryName="租房"
        sizeClassName="aspect-[4/5] w-full"
      />
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://img.example.com/cover.jpg");
    expect(img).toHaveClass("aspect-[4/5]", "w-full", "object-cover");
    expect(screen.queryByTestId("post-thumbnail-placeholder")).not.toBeInTheDocument();
  });

  it("defaults the <img> alt to an empty string (decorative) when no alt prop is passed", () => {
    const { container } = render(
      <PostThumbnail
        coverImageUrl="https://img.example.com/cover.jpg"
        categoryName="租房"
        sizeClassName="h-20 w-20"
      />
    );

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("passes through a custom alt when provided (post-list.tsx passes the post title)", () => {
    const { container } = render(
      <PostThumbnail
        coverImageUrl="https://img.example.com/cover.jpg"
        categoryName="租房"
        sizeClassName="aspect-[4/5] w-full"
        alt="Sunny room near metro"
      />
    );

    expect(container.querySelector("img")).toHaveAttribute("alt", "Sunny room near metro");
  });

  it("renders the category-color icon placeholder (not an <img>) when coverImageUrl is null", () => {
    const { container } = render(
      <PostThumbnail coverImageUrl={null} categoryName="租房" sizeClassName="aspect-[4/5] w-full" />
    );

    const placeholder = screen.getByTestId("post-thumbnail-placeholder");
    expect(placeholder).toHaveClass("bg-primary-light", "aspect-[4/5]", "w-full");
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("shows the category name text alongside the icon by default (compact=false)", () => {
    render(
      <PostThumbnail coverImageUrl={null} categoryName="租房" sizeClassName="aspect-[4/5] w-full" />
    );

    expect(screen.getByText("租房")).toBeInTheDocument();
    const placeholder = screen.getByTestId("post-thumbnail-placeholder");
    expect(placeholder.querySelector("svg")).toHaveAttribute("width", "28");
  });

  it("hides the category name text and shrinks the icon when compact is true", () => {
    render(
      <PostThumbnail
        coverImageUrl={null}
        categoryName="租房"
        sizeClassName="h-20 w-20 shrink-0 rounded-xl"
        compact
      />
    );

    expect(screen.queryByText("租房")).not.toBeInTheDocument();
    const placeholder = screen.getByTestId("post-thumbnail-placeholder");
    expect(placeholder.querySelector("svg")).toHaveAttribute("width", "20");
  });

  // 32 号卡起就有的分类→图标映射（这次从 post-list.tsx 原样搬到这个共享
  // 组件），按 categoryName 精确字符串匹配，见文件顶部 getCategoryPlaceholderIcon
  // 的注释；这里直接测组件而不是重复测那个函数本身。
  it.each([
    ["求租", "lucide-search"],
    ["租房", "lucide-house"],
    ["二手", "lucide-tag"],
    ["某个新分类", "lucide-image-off"]
  ])("maps categoryName '%s' to the %s icon", (categoryName, expectedIconClass) => {
    render(
      <PostThumbnail coverImageUrl={null} categoryName={categoryName} sizeClassName="h-20 w-20" />
    );

    expect(
      screen.getByTestId("post-thumbnail-placeholder").querySelector(`svg.${expectedIconClass}`)
    ).toBeInTheDocument();
  });
});
