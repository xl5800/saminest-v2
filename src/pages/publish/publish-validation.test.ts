import { describe, expect, it } from "vitest";

import {
  OTHER_LOCATION_VALUE,
  stripTitleLineFromDescription,
  validatePublishInput
} from "./publish-validation";

const validInput = {
  categoryId: "cat-1",
  locationId: "loc-1",
  locationText: "",
  // 发布页简化改版（任务卡 7）：没有 contactMethod / contactValue 输入了；
  // 标题、正文是两个独立输入（标题 + 正文编辑区），正文不含标题。
  title: "Sunny room near metro",
  description: "A description that is definitely long enough.",
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
        description: "A description that is definitely long enough.",
        priceAmount: 1200,
        contactMethod: "message",
        contactValue: null,
        posterAge: null,
        posterGender: null,
        job: null,
        zipCode: null
      }
    });
  });

  // 发布页 ZIP 定位任务卡
  it("accepts an empty or 5-digit zip code and rejects anything else", () => {
    expect(validatePublishInput({ ...validInput, zipCode: " 20850 " }).data?.zipCode).toBe("20850");
    expect(validatePublishInput({ ...validInput, zipCode: "2085" }).error?.message).toBe("邮编要是 5 位数字。");
  });

  // 附近的二手任务卡
  it("requires a zip code only when zipCodeRequired is set", () => {
    expect(validatePublishInput({ ...validInput, zipCode: " ", zipCodeRequired: true }).error?.code).toBe(
      "PUBLISH_ZIP_CODE_REQUIRED"
    );
    expect(validatePublishInput({ ...validInput, zipCode: "20850", zipCodeRequired: true }).data?.zipCode).toBe("20850");
    expect(validatePublishInput({ ...validInput, zipCode: "" }).data?.zipCode).toBeNull();
  });

  // 招聘求职任务卡
  it("requires an employment type for job posts", () => {
    const result = validatePublishInput({
      ...validInput,
      job: { salaryUnit: "hour", employmentType: "", perks: [] }
    });
    expect(result.error?.code).toBe("PUBLISH_EMPLOYMENT_TYPE_REQUIRED");
  });

  it("treats an empty salary as 面议 and drops the unit", () => {
    const result = validatePublishInput({
      ...validInput,
      price: "",
      job: { salaryUnit: "hour", employmentType: "either", perks: ["training", "bogus"] }
    });
    expect(result.data?.job).toEqual({
      salaryUnit: null,
      employmentType: "either",
      perks: ["training"],
      negotiable: true
    });
  });

  it("requires a valid salary unit when a salary is given, and calls it 薪资 in errors", () => {
    expect(
      validatePublishInput({
        ...validInput,
        price: "20",
        job: { salaryUnit: "fortnight", employmentType: "full_time", perks: [] }
      }).error?.code
    ).toBe("PUBLISH_SALARY_UNIT_REQUIRED");
    expect(
      validatePublishInput({
        ...validInput,
        price: "-1",
        job: { salaryUnit: "hour", employmentType: "full_time", perks: [] }
      }).error?.message
    ).toBe("薪资不能小于 0。");
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

  // 标题、正文分开：title 来自标题输入框，description 原样保存正文，不再
  // 从正文第一行派生标题，标题也不会出现在正文里。
  it("takes the title from the title field and keeps the description without the title line", () => {
    const result = validatePublishInput({
      ...validInput,
      title: "  标题行  ",
      description: "第一行正文\n第二行"
    });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("标题行");
    expect(result.data?.description).toBe("第一行正文\n第二行");
  });

  it("allows an empty description as long as there is a title", () => {
    const result = validatePublishInput({ ...validInput, description: "   " });

    expect(result.success).toBe(true);
    expect(result.data?.description).toBe("");
  });

  // 空标题必须在前端拦住，不能提交到数据库触发 posts_title_length_check。
  it("rejects an empty / whitespace-only title even when the description has content", () => {
    for (const title of ["", "   "]) {
      const result = validatePublishInput({ ...validInput, title, description: "有正文" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PUBLISH_TITLE_REQUIRED");
      expect(result.error?.message).toBe("请填写标题。");
    }
  });

  it("rejects a title longer than 120 characters, counted by code point", () => {
    expect(validatePublishInput({ ...validInput, title: "😀".repeat(120) }).success).toBe(true);

    const result = validatePublishInput({ ...validInput, title: "a".repeat(121) });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_TITLE_LENGTH");
  });

  it("accepts a single-character title (posts_title_length_check lower bound is 1)", () => {
    const result = validatePublishInput({ ...validInput, title: "A" });

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

// 编辑模式回填：任务卡 7 之后、标题/正文分开之前发布的帖子，正文第一行就是
// 标题，回填正文时要去掉这一行，不然标题会在标题框和正文框里各出现一次。
describe("stripTitleLineFromDescription", () => {
  it("removes the first line when it equals the title (old derived-title posts)", () => {
    expect(stripTitleLineFromDescription("标题", "标题\n正文\n第二段")).toBe("正文\n第二段");
  });

  it("handles leading whitespace, CRLF and a blank line after the title", () => {
    expect(stripTitleLineFromDescription("标题", "\r\n  标题  \r\n\r\n正文")).toBe("正文");
  });

  it("matches a title that was truncated to 120 characters from a longer first line", () => {
    const longLine = "a".repeat(150);
    expect(stripTitleLineFromDescription("a".repeat(120), `${longLine}\n正文`)).toBe("正文");
  });

  it("returns an empty body when the description was only the title line", () => {
    expect(stripTitleLineFromDescription("只有一行", "只有一行")).toBe("");
  });

  it("returns the description unchanged when its first line is not the title (legacy or new posts)", () => {
    expect(stripTitleLineFromDescription("旧标题", "这是一段独立的描述")).toBe("这是一段独立的描述");
    expect(stripTitleLineFromDescription("旧标题", "")).toBe("");
  });
});
