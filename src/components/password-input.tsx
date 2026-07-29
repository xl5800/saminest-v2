import { useState } from "react";

import { authInputClassName, authLabelClassName } from "./auth-layout";

export interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}

/**
 * 登录/注册/重置密码几个认证页面共用的密码输入框：内置显示/隐藏切换
 * （纯 UI 状态，在 "password"/"text" 之间切换 input 的 type，不涉及任何
 * 校验或提交逻辑）。四个页面里有四处密码框要加这个功能，行为和样式完全
 * 一样，抽成一个组件而不是复制四份。
 *
 * label 用 htmlFor/id 显式关联，而不是让 <label> 直接包住输入框+按钮——
 * 后者会导致切换按钮"显示/隐藏"这几个字也被算进 label 的可访问名称里
 * （label 的 accessible name 是它子树内所有文本节点的拼接），
 * getByLabelText("密码") 这类精确匹配的查询会因此匹配不上。
 */
export function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className={authLabelClassName}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          className={`${authInputClassName} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "隐藏密码" : "显示密码"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-text-muted hover:text-text"
        >
          {visible ? "隐藏" : "显示"}
        </button>
      </div>
    </div>
  );
}
