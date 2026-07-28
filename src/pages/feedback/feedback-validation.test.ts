import { describe, expect, it } from "vitest";

import { validateSubmitFeedbackInput } from "./feedback-validation";

const validInput = {
  type: "bug",
  title: "首页图片加载失败",
  content: "在首页点击帖子卡片时，封面图一直显示占位图，详情页里图片是正常的。"
};

describe("validateSubmitFeedbackInput", () => {
  it("accepts a fully valid submission and trims whitespace", () => {
    const result = validateSubmitFeedbackInput({
      ...validInput,
      title: `  ${validInput.title}  `,
      content: `  ${validInput.content}  `
    });

    expect(result).toEqual({
      success: true,
      error: null,
      data: validInput
    });
  });

  it("requires a feedback type to be selected", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, type: "" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FEEDBACK_TYPE_REQUIRED");
  });

  it("rejects a feedback type outside the allowed enum", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, type: "compliment" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FEEDBACK_TYPE_INVALID");
  });

  it("accepts every allowed feedback type", () => {
    for (const type of ["bug", "suggestion", "complaint", "other"]) {
      const result = validateSubmitFeedbackInput({ ...validInput, type });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a title shorter than 5 characters", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, title: "abcd" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FEEDBACK_TITLE_LENGTH");
  });

  it("rejects an empty title", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, title: "   " });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FEEDBACK_TITLE_LENGTH");
  });

  it("accepts a title exactly at the 5 character lower boundary", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, title: "abcde" });

    expect(result.success).toBe(true);
  });

  it("rejects a title longer than 50 characters", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, title: "a".repeat(51) });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FEEDBACK_TITLE_LENGTH");
  });

  it("accepts a title exactly at the 50 character upper boundary", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, title: "a".repeat(50) });

    expect(result.success).toBe(true);
  });

  it("rejects content shorter than 10 characters", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, content: "short" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FEEDBACK_CONTENT_LENGTH");
  });

  it("accepts content exactly at the 10 character lower boundary", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, content: "a".repeat(10) });

    expect(result.success).toBe(true);
  });

  it("rejects content longer than 500 characters", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, content: "a".repeat(501) });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FEEDBACK_CONTENT_LENGTH");
  });

  it("accepts content exactly at the 500 character upper boundary", () => {
    const result = validateSubmitFeedbackInput({ ...validInput, content: "a".repeat(500) });

    expect(result.success).toBe(true);
  });
});
