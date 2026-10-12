import { useEffect, useState } from "react";

import {
  COMMUNITY_NAME_MAX_LENGTH,
  COMMUNITY_NAME_MIN_LENGTH,
  CommunityFormFields
} from "../../components/community-form-fields";

const NAME_LENGTH_MESSAGE = `社区名称需要 ${COMMUNITY_NAME_MIN_LENGTH}-${COMMUNITY_NAME_MAX_LENGTH} 个字。`;
const STATE_REQUIRED_MESSAGE = "请至少选择一个覆盖的州。";

export interface CommunityEditDraft {
  name: string;
  description: string;
  stateCodes: string[];
  isOfficial: boolean;
}

export interface CommunityEditSheetProps {
  initialDraft: CommunityEditDraft;
  /** 提交失败（比如重名）时由调用方传入的错误文案；本地校验错误由这个组件
   *  自己展示，两者共用同一个错误位置，本地校验优先。 */
  errorMessage: string | null;
  pending?: boolean;
  onConfirm: (draft: CommunityEditDraft) => void;
  onClose: () => void;
}

/**
 * 管理后台"编辑社区"底部弹层（community-requests-page.tsx 的"已通过"/"已关闭"
 * 列表里点"编辑"打开）。字段跟创建社区页完全一样（共用 CommunityFormFields），
 * 外加一个"官方社区"勾选。社区链接（slug）不提供修改——已经分享出去的链接
 * 不能失效。
 *
 * 弹层外壳（遮罩、底部圆角面板、Esc 关闭、打开期间锁住页面滚动、取消/确认
 * 两个按钮）照抄 components/category-form-sheet.tsx：那个组件的字段是写死的
 * 分类字段，没有可以塞入任意内容的插槽，ReasonSheet 也一样只有原因输入框，
 * 所以这里按同一套视觉和交互单独写一份，而不是改动那两个已有组件的接口。
 */
export function CommunityEditSheet({
  initialDraft,
  errorMessage,
  pending = false,
  onConfirm,
  onClose
}: CommunityEditSheetProps) {
  const [draft, setDraft] = useState<CommunityEditDraft>(initialDraft);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function handleConfirm(): void {
    const name = draft.name.trim();
    if (name.length < COMMUNITY_NAME_MIN_LENGTH || name.length > COMMUNITY_NAME_MAX_LENGTH) {
      setValidationError(NAME_LENGTH_MESSAGE);
      return;
    }
    if (draft.stateCodes.length === 0) {
      setValidationError(STATE_REQUIRED_MESSAGE);
      return;
    }
    setValidationError(null);
    onConfirm({ ...draft, name, description: draft.description.trim() });
  }

  const shownError = validationError ?? errorMessage;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="编辑社区"
      className="fixed inset-0 z-30 flex items-end bg-overlay"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <p className="mb-4 text-lg font-medium text-primary">编辑社区</p>

        <CommunityFormFields
          name={draft.name}
          onNameChange={(name) => setDraft((current) => ({ ...current, name }))}
          description={draft.description}
          onDescriptionChange={(description) =>
            setDraft((current) => ({ ...current, description }))
          }
          stateCodes={draft.stateCodes}
          onStateCodesChange={(stateCodes) => setDraft((current) => ({ ...current, stateCodes }))}
        />

        <label className="mb-4 flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={draft.isOfficial}
            onChange={(event) =>
              setDraft((current) => ({ ...current, isOfficial: event.target.checked }))
            }
            className="h-4 w-4"
          />
          官方社区（显示认证标记，不能被关闭）
        </label>

        {shownError ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {shownError}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-xl border border-border px-4 py-3 text-base font-medium text-text hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
