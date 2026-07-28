import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FeedbackImagePicker,
  MAX_FEEDBACK_IMAGES
} from "./feedback-image-picker";

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

/** 受控组件在真实页面里总是搭配父组件的 state 使用，这里用一个小 wrapper 模拟。 */
function PickerHarness({
  onFilesChange
}: {
  onFilesChange?: (files: File[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <FeedbackImagePicker
      value={files}
      onChange={(next) => {
        setFiles(next);
        onFilesChange?.(next);
      }}
    />
  );
}

function getFileInput(): HTMLInputElement {
  return screen.getByLabelText(/添加截图/) as HTMLInputElement;
}

describe("FeedbackImagePicker", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let urlCounter: number;

  beforeEach(() => {
    urlCounter = 0;
    createObjectURLSpy = vi.fn(() => `blob:mock-url-${++urlCounter}`);
    revokeObjectURLSpy = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("accepts a valid file, shows a preview, and reports it to the parent", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const file = makeFile("screenshot.png", "image/png", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    expect(onFilesChange).toHaveBeenCalledWith([file]);
    expect(await screen.findByText("screenshot.png")).toBeInTheDocument();
    expect(screen.getByAltText("screenshot.png")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects a file with an unsupported type and shows a visible error", async () => {
    render(<PickerHarness />);

    const file = makeFile("photo.gif", "image/gif", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("只支持 JPEG、PNG 或 WEBP 格式的图片");
    expect(screen.queryByText("photo.gif")).not.toBeInTheDocument();
  });

  it("shows a specific HEIC hint instead of the generic unsupported-type message", async () => {
    render(<PickerHarness />);

    const file = makeFile("IMG_0001.heic", "image/heic", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("iPhone 拍摄的 HEIC 格式暂不支持");
  });

  it("rejects a file larger than 20MB", async () => {
    render(<PickerHarness />);

    const file = makeFile("big.png", "image/png", 20 * 1024 * 1024 + 1);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("文件大小不能超过 20MB");
  });

  it("rejects an empty (0 byte) file", async () => {
    render(<PickerHarness />);

    const file = makeFile("empty.png", "image/png", 0);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("文件是空的，无法上传");
  });

  it("rejects a duplicate file (same name + size) within the same selection batch", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const file = makeFile("dup.jpg", "image/jpeg", 2048);
    const duplicate = makeFile("dup.jpg", "image/jpeg", 2048);
    fireEvent.change(getFileInput(), { target: { files: [file, duplicate] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("和已选择的图片重复");
    expect(onFilesChange).toHaveBeenCalledWith([file]);
  });

  it("caps the total number of accepted screenshots at 3 and reports the overflow", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const tooMany = Array.from({ length: MAX_FEEDBACK_IMAGES + 2 }, (_, index) =>
      makeFile(`shot-${index}.jpg`, "image/jpeg", 1024)
    );
    fireEvent.change(getFileInput(), { target: { files: tooMany } });

    expect(onFilesChange).toHaveBeenCalledTimes(1);
    expect(onFilesChange.mock.calls[0][0]).toHaveLength(MAX_FEEDBACK_IMAGES);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(`最多只能上传 ${MAX_FEEDBACK_IMAGES} 张截图`);
  });

  it("does not silently drop files when the picker is already full: it shows a message instead", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const firstBatch = Array.from({ length: MAX_FEEDBACK_IMAGES }, (_, index) =>
      makeFile(`first-${index}.jpg`, "image/jpeg", 1024)
    );
    fireEvent.change(getFileInput(), { target: { files: firstBatch } });
    expect(onFilesChange.mock.calls[0][0]).toHaveLength(MAX_FEEDBACK_IMAGES);

    const extra = makeFile("extra.jpg", "image/jpeg", 1024);
    fireEvent.change(getFileInput(), { target: { files: [extra] } });

    expect(onFilesChange).toHaveBeenCalledTimes(1);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(`最多只能上传 ${MAX_FEEDBACK_IMAGES} 张截图`);
  });

  it("supports dropping files onto the drop zone", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const file = makeFile("dropped.webp", "image/webp", 1024);
    const dropZone = screen.getByTestId("feedback-image-drop-zone");

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(onFilesChange).toHaveBeenCalledWith([file]);
    expect(await screen.findByText("dropped.webp")).toBeInTheDocument();
  });

  it("removes a selected image when its remove button is clicked", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const file = makeFile("screenshot.png", "image/png", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    await screen.findByText("screenshot.png");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(onFilesChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByText("screenshot.png")).not.toBeInTheDocument();
  });

  it("revokes the previous object URL after a file is removed", async () => {
    render(<PickerHarness />);

    const file = makeFile("screenshot.png", "image/png", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    await screen.findByText("screenshot.png");

    expect(createObjectURLSpy).toHaveBeenCalledWith(file);

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await screen.findByText("拖拽截图到此处，或点击从相册选择");
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it("revokes object URLs on unmount", () => {
    const { unmount } = render(<PickerHarness />);

    const file = makeFile("screenshot.png", "image/png", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    unmount();

    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it("does not render a camera capture input (screenshots are picked from the photo library, not taken live)", () => {
    render(<PickerHarness />);

    expect(screen.queryByLabelText("拍照")).not.toBeInTheDocument();
  });
});
