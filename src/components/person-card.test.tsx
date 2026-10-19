import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 功能开关（config/feature-flags.ts）：这个文件的用例测的是功能打开时的行为，
// 默认都按"打开"跑；个别用例把开关改成 false 测关闭时的样子。
const featureFlags = vi.hoisted(() => ({ USER_PROFILE_PAGE_ENABLED: true, PHONE_REGISTRATION_ENABLED: true }));
vi.mock("../config/feature-flags", () => ({
  get USER_PROFILE_PAGE_ENABLED() {
    return featureFlags.USER_PROFILE_PAGE_ENABLED;
  },
  get PHONE_REGISTRATION_ENABLED() {
    return featureFlags.PHONE_REGISTRATION_ENABLED;
  }
}));

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

  it("is display-only (no link, no chevron) while viewing user profiles is turned off", () => {
    featureFlags.USER_PROFILE_PAGE_ENABLED = false;
    try {
      const { container } = renderWithProviders(
        <PersonCard userId="user-1" displayName="Bob" avatarUrl={null} subtitle="发起人" />
      );
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(container.querySelector("svg")).toBeNull();
    } finally {
      featureFlags.USER_PROFILE_PAGE_ENABLED = true;
    }
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
