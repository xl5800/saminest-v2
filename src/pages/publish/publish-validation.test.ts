import { describe, expect, it } from "vitest";

import {
  composeEditableDescription,
  deriveTitleFromDescription,
  OTHER_LOCATION_VALUE,
  validatePublishInput
} from "./publish-validation";

const validInput = {
  categoryId: "cat-1",
  locationId: "loc-1",
  locationText: "",
  // 发布页简化改版（任务卡 7）：没有独立的 title / contactMethod /
  // contactValue 输入了，title 从描述第一行派生。
  description: "Sunny room near metro\nA description that is definitely long enough.",
  price: "1200",
  // 31 号卡新增字段：这份 baseline fixture 里留空，代表"非求租分类/没填"
  // 这个最常见的场景——已有的一大批用例都是继承自这个 baseline，不需要
  // 逐个改动就能覆盖"两者都不填时校验通过、返回 null/null"。
  posterAge: "",
  posterGender: ""
};

describe("validatePublishInput", () => {
  it("accepts a fully valid submission and normalizes optional fields", () => {
    const result = validatePublishInput(validInput);

    expect(result).toEqual({
      success: true,
      error: null,
      data: {
        categoryId: "cat-1",
        locationId: "loc-1",
        locationText: null,
        title: "Sunny room near metro",
        // description 保存完整原文，第一行（标题行）不剔除。
        description: "Sunny room near metro\nA description that is definitely long enough.",
        priceAmount: 1200,
        contactMethod: "message",
        contactValue: null,
        posterAge: null,
        posterGender: null
      }
    });
  });

  it("requires a category to be selected", () => {
    const result = validatePublishInput({ ...validInput, categoryId: "" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_CATEGORY_REQUIRED");
  });

  it("allows an empty location and normalizes it to null", () => {
    const result = validatePublishInput({ ...validInput, locationId: "" });

    expect(result.success).toBe(true);
    expect(result.data?.locationId).toBeNull();
    expect(result.data?.locationText).toBeNull();
  });

  it("requires locationText when the location is the 'other' sentinel", () => {
    const result = validatePublishInput({
      ...validInput,
      locationId: OTHER_LOCATION_VALUE,
      locationText: "   "
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_LOCATION_TEXT_REQUIRED");
  });

  it("rejects locationText longer than 100 characters", () => {
    const result = validatePublishInput({
      ...validInput,
      locationId: OTHER_LOCATION_VALUE,
      locationText: "a".repeat(101)
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_LOCATION_TEXT_LENGTH");
  });

  it("normalizes the 'other' location into a null locationId and a trimmed locationText", () => {
    const result = validatePublishInput({
      ...validInput,
      locationId: OTHER_LOCATION_VALUE,
      locationText: "  Somewhere else  "
    });

    expect(result.success).toBe(true);
    expect(result.data?.locationId).toBeNull();
    expect(result.data?.locationText).toBe("Somewhere else");
  });

  // design_handoff_saminest_ios 第 6 项：locationId（真实的州/城市外键）和
  // locationText（"城市/具体位置"补充说明）不再互斥，可以同时提交——照抄
  // activities 的 landmarkText 是独立字段这个先例，见 publish-validation.ts
  // 里 OTHER_LOCATION_VALUE 上方的注释。
  it("accepts a real locationId together with a supplementary locationText, trimmed, both non-null", () => {
    const result = validatePublishInput({
      ...validInput,
      locationId: "loc-state-ca",
      locationText: "  近 UCLA  "
    });

    expect(result.success).toBe(true);
    expect(result.data?.locationId).toBe("loc-state-ca");
    expect(result.data?.locationText).toBe("近 UCLA");
  });

  it("rejects a supplementary locationText longer than 100 characters even with a real locationId", () => {
    const result = validatePublishInput({
      ...validInput,
      locationId: "loc-state-ca",
      locationText: "a".repeat(101)
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_LOCATION_TEXT_LENGTH");
  });

  // 发布页简化改版（任务卡 7）：title 从描述第一行派生。
  it("derives the title from the first line of the description and keeps the full text as description", () => {
    const result = validatePublishInput({ ...validInput, description: "  标题行  \n第二行正文\n第三行" });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("标题行");
    expect(result.data?.description).toBe("标题行  \n第二行正文\n第三行");
  });

  it("uses the whole text as title when the description has a single line (no body)", () => {
    const result = validatePublishInput({ ...validInput, description: "只有一行" });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("只有一行");
    expect(result.data?.description).toBe("只有一行");
  });

  it("handles CRLF line breaks and ignores leading blank lines when picking the first line", () => {
    const result = validatePublishInput({ ...validInput, description: "\r\n\r\n标题\r\n正文" });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("标题");
  });

  it("truncates a first line longer than 120 characters to exactly 120 for the title, without truncating the description", () => {
    const longLine = "a".repeat(150);
    const result = validatePublishInput({ ...validInput, description: longLine + "\n正文" });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("a".repeat(120));
    expect(result.data?.description).toBe(longLine + "\n正文");
  });

  it("truncates by code point so an emoji at the boundary is never split in half", () => {
    const line = "a".repeat(119) + "😀😀";
    const result = validatePublishInput({ ...validInput, description: line });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("a".repeat(119) + "😀");
  });

  // 整段描述为空 → 派生出来的 title 也是空，必须在前端拦住，不能让空 title
  // 提交到数据库触发 posts_title_length_check。
  it("rejects an empty / whitespace-only description, because the derived title would be empty", () => {
    for (const description of ["", "   ", "\n\n  \n"]) {
      const result = validatePublishInput({ ...validInput, description });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PUBLISH_CONTENT_REQUIRED");
      expect(result.error?.message).toBe("请至少写点什么。");
    }
  });

  it("accepts a single-character description (it is also the title)", () => {
    const result = validatePublishInput({ ...validInput, description: "A" });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("A");
  });

  it("rejects a description longer than 10000 characters", () => {
    const result = validatePublishInput({
      ...validInput,
      description: "a".repeat(10001)
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_DESCRIPTION_LENGTH");
  });

  it("accepts a description exactly at the 10000 character upper boundary", () => {
    const result = validatePublishInput({
      ...validInput,
      description: "a".repeat(10000)
    });

    expect(result.success).toBe(true);
  });

  it("treats an empty price as no price (null), which the database allows", () => {
    const result = validatePublishInput({ ...validInput, price: "" });

    expect(result.success).toBe(true);
    expect(result.data?.priceAmount).toBeNull();
  });

  it("accepts a price of exactly 0", () => {
    const result = validatePublishInput({ ...validInput, price: "0" });

    expect(result.success).toBe(true);
    expect(result.data?.priceAmount).toBe(0);
  });

  it("rejects a negative price", () => {
    const result = validatePublishInput({ ...validInput, price: "-1" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_PRICE_NEGATIVE");
  });

  it("rejects a non-numeric price", () => {
    const result = validatePublishInput({ ...validInput, price: "abc" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_PRICE_INVALID");
  });

  // 发布页简化改版（任务卡 7）：联系方式不再是表单输入，固定站内私信。
  it("always submits contact_method 'message' and contact_value null", () => {
    const result = validatePublishInput(validInput);

    expect(result.success).toBe(true);
    expect(result.data?.contactMethod).toBe("message");
    expect(result.data?.contactValue).toBeNull();
  });

  // 31 号卡（求租板块改版）：posterAge/posterGender 是"可选、不强制"字段，
  // 校验规则跟 edit-profile-validation.ts 的 age 完全一致（同一对
  // MIN_AGE/MAX_AGE 常量），这里不重复测那份文件已经覆盖过的每一个边界，
  // 只覆盖"留空通过"“非整数/超出范围拒绝”“性别枚举外的值拒绝”这几个
  // 这个函数自己新增的分支。
  it("allows omitting poster age and gender together, since they are optional", () => {
    const result = validatePublishInput({ ...validInput, posterAge: "", posterGender: "" });

    expect(result.success).toBe(true);
    expect(result.data?.posterAge).toBeNull();
    expect(result.data?.posterGender).toBeNull();
  });

  it("accepts a valid poster age and gender", () => {
    const result = validatePublishInput({
      ...validInput,
      posterAge: "25",
      posterGender: "女"
    });

    expect(result.success).toBe(true);
    expect(result.data?.posterAge).toBe(25);
    expect(result.data?.posterGender).toBe("女");
  });

  it("rejects a non-integer poster age", () => {
    const result = validatePublishInput({ ...validInput, posterAge: "25.5" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_POSTER_AGE_INVALID");
  });

  it("rejects a poster age outside the 13-120 range", () => {
    const result = validatePublishInput({ ...validInput, posterAge: "12" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_POSTER_AGE_OUT_OF_RANGE");
  });

  it("rejects a poster gender outside the enum", () => {
    const result = validatePublishInput({ ...validInput, posterGender: "其他" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_POSTER_GENDER_INVALID");
  });
});

describe("deriveTitleFromDescription", () => {
  it("returns the trimmed first line", () => {
    expect(deriveTitleFromDescription("  Hello  \nworld")).toBe("Hello");
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(deriveTitleFromDescription("")).toBe("");
    expect(deriveTitleFromDescription(" \n ")).toBe("");
  });
});

// 编辑模式回填：历史帖子的 title 是单独填的、不一定出现在 description 里，
// 回填时必须保证"重新提交后派生出来的 title 仍然是原标题"。
describe("composeEditableDescription", () => {
  it("returns the description unchanged when its first line already equals the title (new-format posts)", () => {
    expect(composeEditableDescription("标题", "标题\n正文")).toBe("标题\n正文");
  });

  it("prepends the title as the first line for legacy posts whose description does not start with it", () => {
    const composed = composeEditableDescription("旧标题", "这是一段独立的描述");

    expect(composed).toBe("旧标题\n这是一段独立的描述");
    expect(deriveTitleFromDescription(composed)).toBe("旧标题");
  });

  it("returns just the title when a legacy post has an empty description", () => {
    expect(composeEditableDescription("旧标题", "")).toBe("旧标题");
  });
});
