import { type ChangeEvent, useRef } from "react";

export interface TitleBodyEditorProps {
  title: string;
  onTitleChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  titleMaxLength: number;
  bodyMaxLength: number;
  titleAriaLabel: string;
  bodyAriaLabel: string;
  /** 发布页改版：提示文字跟着分类变（二手"卖什么？"、招聘"招什么职位？"…）。
   *  不传还是"添加标题 / 添加正文"。 */
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
}

/**
 * 标题 + 正文合在同一块编辑区里（参照小红书）：视觉上是一个框，实际仍是
 * 两个输入框——第一行大号的标题（常规字重，跟发出去后的标题样式一致）
 * （提示"添加标题"），下面是正文（提示"添加正文"），中间没有分隔线、没有
 * 小标签。
 *
 * 不做成"一个文本框、第一行自动算标题"：用户随手换行会把标题和正文切错，
 * 标题的长度上限和编辑回填也不好处理，标题还会在正文里重复出现一次。
 * 标题里按回车直接跳到正文，不在标题里换行（输入法组字中的回车不算）。
 * 正文随内容自动撑高，到 60dvh 封顶后内部滚动。
 *
 * 原本内联在社区发帖页（create-community-post-page.tsx），租房/二手发布页
 * （publish-page.tsx）改成同样的编辑区时抽到这里两边共用。
 */
export function TitleBodyEditor({
  title,
  onTitleChange,
  body,
  onBodyChange,
  titleMaxLength,
  bodyMaxLength,
  titleAriaLabel,
  bodyAriaLabel,
  titlePlaceholder = "添加标题",
  bodyPlaceholder = "添加正文"
}: TitleBodyEditorProps) {
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  function handleBodyChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onBodyChange(event.target.value);
    // 先重置成 "auto" 再读 scrollHeight：不重置的话浏览器还按撑高之前的
    // 高度算 scrollHeight，只会越撑越高，删字缩不回去。
    event.target.style.height = "auto";
    event.target.style.height = `${event.target.scrollHeight}px`;
  }

  return (
    <div className="mb-4 rounded-xl bg-field px-3.5 py-3">
      <input
        type="text"
        aria-label={titleAriaLabel}
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            bodyRef.current?.focus();
          }
        }}
        maxLength={titleMaxLength}
        placeholder={titlePlaceholder}
        className="w-full bg-transparent text-xl text-text placeholder:text-text-placeholder focus:outline-none"
      />
      <textarea
        ref={bodyRef}
        aria-label={bodyAriaLabel}
        value={body}
        onChange={handleBodyChange}
        maxLength={bodyMaxLength}
        placeholder={bodyPlaceholder}
        className="mt-2 max-h-[60dvh] min-h-[160px] w-full resize-none overflow-y-auto bg-transparent text-base text-text placeholder:text-text-placeholder focus:outline-none"
      />
    </div>
  );
}
