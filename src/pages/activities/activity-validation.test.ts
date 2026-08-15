import { describe, expect, it } from "vitest";

import { validateActivityInput, type ActivityFormInput } from "./activity-validation";

const validInput: ActivityFormInput = {
  channel: "food",
  tagText: "火锅",
  title: "周末吃火锅",
  description: "一起吃火锅，AA制",
  locationId: "loc-1",
  landmarkText: "海底捞",
  isOnline: false,
  // 足够远的未来时间，不会因为测试运行慢而意外变成"过去"。
  startAt: "2099-01-01T10:00",
  capacity: "4",
  contactMethod: "wechat",
  contactValue: "abc123"
};

describe("validateActivityInput", () => {
  it("succeeds and converts startAt to an ISO string, trims text fields, and maps empty optional fields to null", () => {
    const result = validateActivityInput(validInput);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      channel: "food",
      tagText: "火锅",
      title: "周末吃火锅",
      description: "一起吃火锅，AA制",
      locationId: "loc-1",
      landmarkText: "海底捞",
      isOnline: false,
      startAt: new Date("2099-01-01T10:00").toISOString(),
      capacity: 4,
      contactMethod: "wechat",
      contactValue: "abc123"
    });
  });

  it("fails when channel is empty", () => {
    const result = validateActivityInput({ ...validInput, channel: "  " });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_CHANNEL_REQUIRED" }
    });
  });

  it("fails when tagText exceeds the max length", () => {
    const result = validateActivityInput({ ...validInput, tagText: "a".repeat(21) });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_TAG_TEXT_LENGTH" }
    });
  });

  it("succeeds with an empty optional tagText, mapping it to null", () => {
    const result = validateActivityInput({ ...validInput, tagText: "  " });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.tagText).toBeNull();
  });

  it("fails when title is empty", () => {
    const result = validateActivityInput({ ...validInput, title: "  " });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_TITLE_REQUIRED" }
    });
  });

  it("fails when title exceeds the max length", () => {
    const result = validateActivityInput({ ...validInput, title: "a".repeat(121) });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_TITLE_LENGTH" }
    });
  });

  it("fails when description is empty", () => {
    const result = validateActivityInput({ ...validInput, description: "  " });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_DESCRIPTION_REQUIRED" }
    });
  });

  it("fails when description exceeds the max length", () => {
    const result = validateActivityInput({ ...validInput, description: "a".repeat(2001) });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_DESCRIPTION_LENGTH" }
    });
  });

  it("fails when the activity is offline and no location is selected", () => {
    const result = validateActivityInput({ ...validInput, isOnline: false, locationId: "  " });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_LOCATION_REQUIRED" }
    });
  });

  it("succeeds without a location when the activity is online", () => {
    const result = validateActivityInput({ ...validInput, isOnline: true, locationId: "  " });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.locationId).toBeNull();
    expect(result.data.isOnline).toBe(true);
  });

  it("fails when landmarkText exceeds the max length", () => {
    const result = validateActivityInput({ ...validInput, landmarkText: "a".repeat(101) });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_LANDMARK_TEXT_LENGTH" }
    });
  });

  it("succeeds with an empty optional landmarkText, mapping it to null", () => {
    const result = validateActivityInput({ ...validInput, landmarkText: "  " });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.landmarkText).toBeNull();
  });

  it("fails when startAt is empty", () => {
    const result = validateActivityInput({ ...validInput, startAt: "" });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_START_AT_REQUIRED" }
    });
  });

  it("fails when startAt is not a valid date", () => {
    const result = validateActivityInput({ ...validInput, startAt: "not-a-date" });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_START_AT_INVALID" }
    });
  });

  it("fails when startAt is in the past", () => {
    const result = validateActivityInput({ ...validInput, startAt: "2020-01-01T10:00" });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_START_AT_PAST" }
    });
  });

  it("fails when capacity is not an integer", () => {
    const result = validateActivityInput({ ...validInput, capacity: "3.5" });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_CAPACITY_INVALID" }
    });
  });

  it("fails when capacity is zero or negative", () => {
    const result = validateActivityInput({ ...validInput, capacity: "0" });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_CAPACITY_INVALID" }
    });
  });

  it("succeeds with an empty optional capacity, mapping it to null", () => {
    const result = validateActivityInput({ ...validInput, capacity: "  " });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.capacity).toBeNull();
  });

  it("fails when contactMethod is provided but not a recognized value", () => {
    const result = validateActivityInput({ ...validInput, contactMethod: "carrier-pigeon" });

    expect(result).toMatchObject({
      success: false,
      error: { code: "ACTIVITY_CONTACT_METHOD_INVALID" }
    });
  });

  it("succeeds with empty optional contactMethod/contactValue, mapping them to null", () => {
    const result = validateActivityInput({
      ...validInput,
      contactMethod: "  ",
      contactValue: "  "
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contactMethod).toBeNull();
    expect(result.data.contactValue).toBeNull();
  });
});
