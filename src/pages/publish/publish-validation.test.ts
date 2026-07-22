import { describe, expect, it } from "vitest";

import { validatePublishInput } from "./publish-validation";

const validInput = {
  categoryId: "cat-1",
  locationId: "loc-1",
  title: "Sunny room near metro",
  description: "A description that is definitely long enough.",
  price: "1200",
  contactMethod: "email",
  contactValue: "user@example.com"
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
        title: "Sunny room near metro",
        description: "A description that is definitely long enough.",
        priceAmount: 1200,
        contactMethod: "email",
        contactValue: "user@example.com"
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
  });

  it("rejects an empty title", () => {
    const result = validatePublishInput({ ...validInput, title: "   " });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_TITLE_REQUIRED");
  });

  it("accepts a single-character title", () => {
    const result = validatePublishInput({ ...validInput, title: "A" });

    expect(result.success).toBe(true);
  });

  it("rejects a title longer than 120 characters", () => {
    const result = validatePublishInput({ ...validInput, title: "a".repeat(121) });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_TITLE_LENGTH");
  });

  it("accepts a title exactly at the 120 character upper boundary", () => {
    const result = validatePublishInput({ ...validInput, title: "a".repeat(120) });

    expect(result.success).toBe(true);
  });

  it("rejects an empty description", () => {
    const result = validatePublishInput({ ...validInput, description: "   " });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_DESCRIPTION_REQUIRED");
  });

  it("accepts a single-character description", () => {
    const result = validatePublishInput({ ...validInput, description: "A" });

    expect(result.success).toBe(true);
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

  it("rejects a contact method outside the posts.contact_method enum", () => {
    const result = validatePublishInput({
      ...validInput,
      contactMethod: "carrier_pigeon"
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PUBLISH_CONTACT_METHOD_INVALID");
  });

  it("accepts every allowed contact_method enum value", () => {
    for (const method of ["message", "email", "phone", "wechat", "other"]) {
      const result = validatePublishInput({
        ...validInput,
        contactMethod: method,
        contactValue: "some-value"
      });
      expect(result.success).toBe(true);
    }
  });

  it("allows a contact method without a contact value, since contact_value is nullable", () => {
    const result = validatePublishInput({
      ...validInput,
      contactMethod: "phone",
      contactValue: ""
    });

    expect(result.success).toBe(true);
    expect(result.data?.contactMethod).toBe("phone");
    expect(result.data?.contactValue).toBeNull();
  });

  it("allows a contact value without a contact method, since contact_method is nullable", () => {
    const result = validatePublishInput({
      ...validInput,
      contactMethod: "",
      contactValue: "555-0100"
    });

    expect(result.success).toBe(true);
    expect(result.data?.contactMethod).toBeNull();
    expect(result.data?.contactValue).toBe("555-0100");
  });

  it("allows omitting contact method and value together", () => {
    const result = validatePublishInput({
      ...validInput,
      contactMethod: "",
      contactValue: ""
    });

    expect(result.success).toBe(true);
    expect(result.data?.contactMethod).toBeNull();
    expect(result.data?.contactValue).toBeNull();
  });
});
