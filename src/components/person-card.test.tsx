import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/render-with-providers";
import { PersonCard } from "./person-card";

describe("PersonCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders as a single link to /users/:userId (整行可点)", () => {
    renderWithProviders(
      <PersonCard userId="user-1" displayName="Bob" avatarUrl={null} subtitle="发起人" />
    );

    expect(screen.getByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/users/user-1");
  });

  it("renders the display name and the caller-provided subtitle", () => {
    renderWithProviders(
      <PersonCard userId="user-1" displayName="Bob" avatarUrl={null} subtitle="发布于 3 天前" />
    );

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("发布于 3 天前")).toBeInTheDocument();
  });

  it("renders an <img> avatar when avatarUrl is present", () => {
    // 头像 <img alt=""> 是装饰性图片（昵称文字已经在旁边），无障碍树里不会
    // 带 role="img"，getByRole 查不到，跟 conversation-list-page.test.tsx
    // 处理头像 <img> 是同一个原因，这里同样直接用 querySelector。
    const { container } = renderWithProviders(
      <PersonCard
        userId="user-1"
        displayName="Bob"
        avatarUrl="https://img.example.com/bob.jpg"
        subtitle="发起人"
      />
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://img.example.com/bob.jpg"
    );
  });

  it("falls back to an uppercase nickname-initial placeholder (no <img>) when avatarUrl is null", () => {
    const { container } = renderWithProviders(
      <PersonCard userId="user-1" displayName="bob" avatarUrl={null} subtitle="发起人" />
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
