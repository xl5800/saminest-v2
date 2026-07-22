import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_POST_IMAGES,
  PostImagePicker
} from "./post-image-picker";

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
    <PostImagePicker
      value={files}
      onChange={(next) => {
        setFiles(next);
        onFilesChange?.(next);
      }}
    />
  );
}

function getFileInput(): HTMLInputElement {
  return screen.getByLabelText(/上传图片/) as HTMLInputElement;
}

describe("PostImagePicker", () => {
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

    const file = makeFile("room.jpg", "image/jpeg", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    expect(onFilesChange).toHaveBeenCalledWith([file]);
    expect(await screen.findByText("room.jpg")).toBeInTheDocument();
    expect(screen.getByAltText("room.jpg")).toBeInTheDocument();
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

  it("rejects a duplicate file selected in a later batch against an already-accepted file", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const file = makeFile("dup.jpg", "image/jpeg", 2048);
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    expect(onFilesChange).toHaveBeenLastCalledWith([file]);

    const duplicateAgain = makeFile("dup.jpg", "image/jpeg", 2048);
    fireEvent.change(getFileInput(), { target: { files: [duplicateAgain] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("和已选择的图片重复");
    expect(onFilesChange).toHaveBeenLastCalledWith([file]);
  });

  it("caps the total number of accepted images at the max and reports the overflow", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const tooMany = Array.from({ length: MAX_POST_IMAGES + 3 }, (_, index) =>
      makeFile(`photo-${index}.jpg`, "image/jpeg", 1024)
    );
    fireEvent.change(getFileInput(), { target: { files: tooMany } });

    expect(onFilesChange).toHaveBeenCalledTimes(1);
    expect(onFilesChange.mock.calls[0][0]).toHaveLength(MAX_POST_IMAGES);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(`最多只能上传 ${MAX_POST_IMAGES} 张图片`);
  });

  it("does not silently drop files when the picker is already full: it shows a message instead", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const firstBatch = Array.from({ length: MAX_POST_IMAGES }, (_, index) =>
      makeFile(`first-${index}.jpg`, "image/jpeg", 1024)
    );
    fireEvent.change(getFileInput(), { target: { files: firstBatch } });
    expect(onFilesChange.mock.calls[0][0]).toHaveLength(MAX_POST_IMAGES);

    const extra = makeFile("extra.jpg", "image/jpeg", 1024);
    fireEvent.change(getFileInput(), { target: { files: [extra] } });

    // Still only one successful onChange call (the first batch); the extra
    // file was rejected outright rather than triggering a second update.
    expect(onFilesChange).toHaveBeenCalledTimes(1);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(`最多只能上传 ${MAX_POST_IMAGES} 张图片`);
  });

  it("supports dropping files onto the drop zone", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const file = makeFile("dropped.webp", "image/webp", 1024);
    const dropZone = screen.getByTestId("post-image-drop-zone");

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(onFilesChange).toHaveBeenCalledWith([file]);
    expect(await screen.findByText("dropped.webp")).toBeInTheDocument();
  });

  it("removes a selected image when its remove button is clicked", async () => {
    const onFilesChange = vi.fn();
    render(<PickerHarness onFilesChange={onFilesChange} />);

    const file = makeFile("room.jpg", "image/jpeg", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    await screen.findByText("room.jpg");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(onFilesChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByText("room.jpg")).not.toBeInTheDocument();
  });

  it("revokes the previous object URL after a file is removed", async () => {
    render(<PickerHarness />);

    const file = makeFile("room.jpg", "image/jpeg", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    await screen.findByText("room.jpg");

    expect(createObjectURLSpy).toHaveBeenCalledWith(file);

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await screen.findByText("拖拽图片到此处，或点击从相册选择");
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it("revokes object URLs on unmount", () => {
    const { unmount } = render(<PickerHarness />);

    const file = makeFile("room.jpg", "image/jpeg", 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    unmount();

    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });
});
