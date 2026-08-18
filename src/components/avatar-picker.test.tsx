import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AvatarPicker, MAX_AVATAR_SIZE_BYTES } from "./avatar-picker";

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

/** 受控组件在真实页面里总是搭配父组件的 state 使用，这里用一个小 wrapper 模拟。 */
function PickerHarness({
  currentAvatarUrl = null,
  displayNameInitial = "A",
  onFileChange
}: {
  currentAvatarUrl?: string | null;
  displayNameInitial?: string;
  onFileChange?: (file: File | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <AvatarPicker
      value={file}
      onChange={(next) => {
        setFile(next);
        onFileChange?.(next);
      }}
      currentAvatarUrl={currentAvatarUrl}
      displayNameInitial={displayNameInitial}
    />
  );
}

function getGalleryInput(): HTMLInputElement {
  return screen.getByLabelText("更换头像") as HTMLInputElement;
}

function getCameraInput(): HTMLInputElement {
  return screen.getByLabelText("拍照") as HTMLInputElement;
}

describe("AvatarPicker", () => {
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

  it("shows the nickname-initial placeholder (no <img>) when there is no current avatar and no file selected yet", () => {
    const { container } = render(<PickerHarness displayNameInitial="B" />);

    expect(screen.getByText("B")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("shows the current remote avatar as an <img> when one exists and no new file has been selected", () => {
    const { container } = render(
      <PickerHarness currentAvatarUrl="https://example.com/current.jpg" />
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/current.jpg");
  });

  it("accepts a valid file selected via the gallery input, replaces the preview, and reports it to the parent", async () => {
    const onFileChange = vi.fn();
    const { container } = render(
      <PickerHarness currentAvatarUrl="https://example.com/current.jpg" onFileChange={onFileChange} />
    );

    const file = makeFile("selfie.jpg", "image/jpeg", 1024);
    fireEvent.change(getGalleryInput(), { target: { files: [file] } });

    expect(onFileChange).toHaveBeenCalledWith(file);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "blob:mock-url-1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts a valid file selected via the camera input", async () => {
    const onFileChange = vi.fn();
    render(<PickerHarness onFileChange={onFileChange} />);

    const file = makeFile("photo.png", "image/png", 1024);
    fireEvent.change(getCameraInput(), { target: { files: [file] } });

    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it("rejects a file with an unsupported type and shows a visible error, without changing the preview", async () => {
    const onFileChange = vi.fn();
    const { container } = render(
      <PickerHarness currentAvatarUrl="https://example.com/current.jpg" onFileChange={onFileChange} />
    );

    const file = makeFile("photo.gif", "image/gif", 1024);
    fireEvent.change(getGalleryInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("只支持 JPEG、PNG 或 WEBP 格式的图片");
    expect(onFileChange).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/current.jpg"
    );
  });

  it("shows the HEIC-specific message for a HEIC file", async () => {
    render(<PickerHarness />);

    const file = makeFile("IMG_1234.heic", "image/heic", 1024);
    fireEvent.change(getGalleryInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("iPhone 拍摄的 HEIC 格式暂不支持");
  });

  it("rejects a file larger than the max size", async () => {
    render(<PickerHarness />);

    const file = makeFile("big.png", "image/png", MAX_AVATAR_SIZE_BYTES + 1);
    fireEvent.change(getGalleryInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("文件大小不能超过 20MB");
  });

  it("rejects an empty (0 byte) file", async () => {
    render(<PickerHarness />);

    const file = makeFile("empty.png", "image/png", 0);
    fireEvent.change(getGalleryInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("文件是空的，无法上传");
  });

  it("clears a previous error once a valid file is selected afterward", async () => {
    const onFileChange = vi.fn();
    render(<PickerHarness onFileChange={onFileChange} />);

    fireEvent.change(getGalleryInput(), {
      target: { files: [makeFile("bad.gif", "image/gif", 1024)] }
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.change(getGalleryInput(), {
      target: { files: [makeFile("good.jpg", "image/jpeg", 1024)] }
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onFileChange).toHaveBeenCalledWith(makeFile("good.jpg", "image/jpeg", 1024));
  });

  it("revokes the previous object URL when a new file replaces the preview", async () => {
    render(<PickerHarness />);

    fireEvent.change(getGalleryInput(), {
      target: { files: [makeFile("first.jpg", "image/jpeg", 1024)] }
    });
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

    fireEvent.change(getGalleryInput(), {
      target: { files: [makeFile("second.jpg", "image/jpeg", 1024)] }
    });

    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url-1");
  });

  it("revokes the object URL on unmount", () => {
    const { unmount } = render(<PickerHarness />);

    fireEvent.change(getGalleryInput(), {
      target: { files: [makeFile("selfie.jpg", "image/jpeg", 1024)] }
    });

    unmount();

    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });
});
