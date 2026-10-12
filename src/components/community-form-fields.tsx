import { X } from "lucide-react";

import { US_STATES, formatStateLabelByCode } from "../data/us-states";

export const COMMUNITY_NAME_MIN_LENGTH = 2;
export const COMMUNITY_NAME_MAX_LENGTH = 30;
export const COMMUNITY_DESCRIPTION_MAX_LENGTH = 200;

const QUICK_STATE_CODES = ["DC", "MD", "VA"];

export interface CommunityFormFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  stateCodes: string[];
  onStateCodesChange: (value: string[]) => void;
}

/**
 * 社区的三个基本字段：名称（2-30 字，带字数）、简介（最多 200 字，可选）、
 * 覆盖的州（DC / MD / VA 三个快捷胶囊 + 下拉框添加其它州，已选的其它州显示成
 * 可移除的胶囊）。
 *
 * 原本内联在创建社区页（create-community-page.tsx），管理后台编辑社区
 * （community-edit-sheet.tsx）要用完全相同的字段和规则，抽到这里两边共用。
 * 这个组件只负责展示和收集输入，不做校验——校验和提交由调用方负责（两边的
 * 校验规则跟数据库函数 request_community / admin_update_community 一致）。
 */
export function CommunityFormFields({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  stateCodes,
  onStateCodesChange
}: CommunityFormFieldsProps) {
  const otherStates = US_STATES.filter((state) => !QUICK_STATE_CODES.includes(state.code));
  const extraSelected = stateCodes.filter((code) => !QUICK_STATE_CODES.includes(code));
  const chipBase = "flex h-9 items-center rounded-full px-4 text-sm whitespace-nowrap";

  function toggleState(code: string): void {
    onStateCodesChange(
      stateCodes.includes(code) ? stateCodes.filter((value) => value !== code) : [...stateCodes, code]
    );
  }

  function addState(code: string): void {
    if (!code || stateCodes.includes(code)) return;
    onStateCodesChange([...stateCodes, code]);
  }

  return (
    <>
      <label className="mb-4 block">
        <span className="mb-2 flex items-center justify-between text-xs font-semibold text-text">
          社区名称
          <span className="font-normal text-text-subtle">
            {name.trim().length}/{COMMUNITY_NAME_MAX_LENGTH}
          </span>
        </span>
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={COMMUNITY_NAME_MAX_LENGTH}
          placeholder="比如：DMV 华人羽毛球"
          className="w-full rounded-xl bg-card px-3.5 py-3 text-base text-text placeholder:text-text-placeholder focus:outline-none focus:ring-4 focus:ring-primary-light"
        />
      </label>

      <label className="mb-4 block">
        <span className="mb-2 flex items-center justify-between text-xs font-semibold text-text">
          简介（可选）
          <span className="font-normal text-text-subtle">
            {description.trim().length}/{COMMUNITY_DESCRIPTION_MAX_LENGTH}
          </span>
        </span>
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          maxLength={COMMUNITY_DESCRIPTION_MAX_LENGTH}
          rows={3}
          placeholder="这个社区聊什么？"
          className="w-full resize-none rounded-xl bg-card px-3.5 py-3 text-base text-text placeholder:text-text-placeholder focus:outline-none focus:ring-4 focus:ring-primary-light"
        />
      </label>

      <fieldset className="mb-6">
        <legend className="mb-2 text-xs font-semibold text-text">覆盖的州（至少选一个）</legend>
        <div className="flex flex-wrap gap-2">
          {QUICK_STATE_CODES.map((code) => {
            const selected = stateCodes.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleState(code)}
                className={`${chipBase} ${
                  selected
                    ? "bg-primary font-semibold text-white"
                    : "border border-border bg-card text-text-muted"
                }`}
              >
                {formatStateLabelByCode(code)}
              </button>
            );
          })}
          {extraSelected.map((code) => (
            <span key={code} className={`${chipBase} gap-1 bg-primary font-semibold text-white`}>
              {formatStateLabelByCode(code)}
              <button
                type="button"
                aria-label={`移除 ${formatStateLabelByCode(code)}`}
                onClick={() => toggleState(code)}
                className="-mr-1 flex h-5 w-5 items-center justify-center rounded-full"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <select
          aria-label="添加其他州"
          value=""
          onChange={(event) => addState(event.target.value)}
          className="mt-3 w-full rounded-xl bg-card px-3.5 py-3 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light"
        >
          <option value="">＋ 添加其他州</option>
          {otherStates.map((state) => (
            <option key={state.code} value={state.code} disabled={stateCodes.includes(state.code)}>
              {formatStateLabelByCode(state.code)}
            </option>
          ))}
        </select>
      </fieldset>
    </>
  );
}
