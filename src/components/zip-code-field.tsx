import { MapPin } from "lucide-react";

import { useZipCodeQuery } from "../features/locations/use-zip-code-query";

interface ZipCodeFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 输入框的样式（帖子发布页和找搭子发起页的输入框风格不一样，由调用方传）。 */
  inputClassName: string;
  labelClassName: string;
  /** 发布页改版：标题在左、输入框在右的一行（列表样式）。不传还是上下两行。 */
  rowClassName?: string;
}

/**
 * 发布页 ZIP 定位任务卡：邮编输入框 + 查询结果提示（"📍 Rockville, MD" /
 * 查不到 / 查询失败）。只接受数字、最多 5 位。帖子发布页
 * （pages/publish/publish-page.tsx）和找搭子发起页
 * （pages/activities/create-activity-page.tsx）共用；查到之后怎么填进各自
 * 的州 / 城市字段由页面自己处理（同一个邮编的查询结果有缓存，不会重复请求）。
 */
export function ZipCodeField({ id, value, onChange, inputClassName, labelClassName, rowClassName }: ZipCodeFieldProps) {
  const zip = value.trim();
  const query = useZipCodeQuery(zip);

  const labelAndInput = (
    <>
      <label htmlFor={id} className={labelClassName}>
        邮编（ZIP）
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={5}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        placeholder={rowClassName ? "输入后自动填城市" : "输入邮编，自动填写城市"}
        className={inputClassName}
      />
    </>
  );

  return (
    <div>
      {rowClassName ? <div className={rowClassName}>{labelAndInput}</div> : labelAndInput}
      {zip.length === 5 ? (
        <p role="status" className="mt-2 flex items-center gap-1 text-sm">
          {query.isPending ? (
            <span className="text-text-muted">查询中…</span>
          ) : query.isError ? (
            <span className="text-danger">邮编查询失败，请在下面手动填写地区。</span>
          ) : query.data ? (
            <>
              <MapPin aria-hidden="true" size={14} className="shrink-0 text-primary" />
              <span className="font-medium text-text">
                {query.data.city}, {query.data.stateCode}
              </span>
            </>
          ) : (
            <span className="text-danger">没找到这个邮编，请在下面手动填写地区。</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
