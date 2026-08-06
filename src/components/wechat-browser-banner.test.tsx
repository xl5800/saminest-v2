import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WechatBrowserBanner } from "./wechat-browser-banner";

const ORIGINAL_USER_AGENT = window.navigator.userAgent;

function setUserAgent(value: string): void {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value
  });
}

describe("WechatBrowserBanner", () => {
  beforeEach(() => {
    setUserAgent(ORIGINAL_USER_AGENT);
  });

  afterEach(() => {
    cleanup();
    setUserAgent(ORIGINAL_USER_AGENT);
  });

  it("renders nothing in a normal browser", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );

    const { container } = render(<WechatBrowserBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the guidance banner when opened inside WeChat's built-in browser", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002833) NetType/WIFI Language/zh_CN"
    );

    render(<WechatBrowserBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "点击右上角\"···\"选择\"在浏览器中打开\"，才能使用完整功能"
    );
  });
});
