import { describe, expect, it } from "vitest";

import { AppError, getModerationErrorMessage } from "./app-error";

describe("AppError moderation mapping", () => {
  it("turns the database's blocked_term / display_name_reserved errors into friendly messages", () => {
    const blocked = new AppError("blocked_term", "POST_CREATE_FAILED");
    expect(blocked.code).toBe("CONTENT_BLOCKED_TERM");
    expect(blocked.message).toBe("内容含有不当词语，请修改。");
    expect(getModerationErrorMessage(blocked)).toBe("内容含有不当词语，请修改。");

    const reserved = new AppError("display_name_reserved", "PROFILE_UPDATE_FAILED");
    expect(reserved.code).toBe("DISPLAY_NAME_RESERVED");
    expect(getModerationErrorMessage(reserved)).toBe("这个昵称不能使用，请换一个。");
  });

  it("leaves other errors alone", () => {
    const other = new AppError("network down", "POST_CREATE_FAILED");
    expect(other.code).toBe("POST_CREATE_FAILED");
    expect(other.message).toBe("network down");
    expect(getModerationErrorMessage(other)).toBeNull();
    expect(getModerationErrorMessage(new Error("blocked_term"))).toBeNull();
  });
});
