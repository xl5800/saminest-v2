import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProfileSummary } from "./profile-summary";

describe("ProfileSummary", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an <img> avatar when avatarUrl is present", () => {
    const { container } = render(
      <ProfileSummary displayName="Bob" avatarUrl="https://example.com/bob.jpg" />
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/bob.jpg"
    );
  });

  it("renders an uppercase nickname-initial placeholder (no <img>) when avatarUrl is null", () => {
    const { container } = render(<ProfileSummary displayName="bob" avatarUrl={null} />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("falls back to a '?' placeholder initial when displayName is null/blank", () => {
    render(<ProfileSummary displayName={null} avatarUrl={null} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders the display name as the page heading", () => {
    render(<ProfileSummary displayName="Bob" avatarUrl={null} />);

    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
  });

  it("shows the location only when locationName is non-empty", () => {
    const { rerender } = render(
      <ProfileSummary displayName="Bob" avatarUrl={null} locationName="Rockville" />
    );
    expect(screen.getByText("Rockville")).toBeInTheDocument();

    rerender(<ProfileSummary displayName="Bob" avatarUrl={null} locationName={null} />);
    expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
  });

  it("shows the bio only when it is non-empty, without a '暂无简介' placeholder", () => {
    const { rerender } = render(
      <ProfileSummary displayName="Bob" avatarUrl={null} bio="Hi there, I like hiking." />
    );
    expect(screen.getByText("Hi there, I like hiking.")).toBeInTheDocument();

    rerender(<ProfileSummary displayName="Bob" avatarUrl={null} bio={null} />);
    expect(screen.queryByText("Hi there, I like hiking.")).not.toBeInTheDocument();
    expect(screen.queryByText(/暂无简介/)).not.toBeInTheDocument();
  });

  it("renders children below the avatar/name/location/bio block, regardless of what the caller passes", () => {
    render(
      <ProfileSummary displayName="Bob" avatarUrl={null}>
        <button type="button">发消息</button>
      </ProfileSummary>
    );

    expect(screen.getByRole("button", { name: "发消息" })).toBeInTheDocument();
  });

  describe("size='compact' (56px 头像卡片，'我的'页用)", () => {
    it("does not render an <h1> — the caller's TopBar already owns the page's single <h1>", () => {
      render(<ProfileSummary size="compact" displayName="Alice" avatarUrl={null} />);

      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    it("shows nickname/signature(bio)/tertiaryText but not locationName, matching the old profile-redesign card's 3-line spec", () => {
      render(
        <ProfileSummary
          size="compact"
          displayName="Alice"
          avatarUrl={null}
          bio="喜欢 hiking"
          locationName="Rockville"
          tertiaryText="alice@example.com"
        />
      );

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("喜欢 hiking")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
    });

    it("still falls back to an uppercase initial placeholder when avatarUrl is null", () => {
      render(<ProfileSummary size="compact" displayName="bob" avatarUrl={null} />);

      expect(screen.getByText("B")).toBeInTheDocument();
    });
  });

  it("size='default' (the implicit default) still renders the display name as the page's <h1>, unaffected by the compact variant", () => {
    render(<ProfileSummary displayName="Bob" avatarUrl={null} />);

    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
  });
});
