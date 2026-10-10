import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { US_STATES, formatStateLabelByCode } from "../../data/us-states";
import { useMyCommunityRequestsQuery } from "../../features/community/use-my-community-requests-query";
import { useRequestCommunityMutation } from "../../features/community/use-request-community-mutation";
import type { CommunityRequest } from "../../repositories/community-repository";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import { formatPublishedAt } from "../../utils/format";

export const COMMUNITY_NAME_MIN_LENGTH = 2;
export const COMMUNITY_NAME_MAX_LENGTH = 30;
export const COMMUNITY_DESCRIPTION_MAX_LENGTH = 200;

// DMV 三个州放在最前面做成快捷选项；其余州从下拉框里添加。
const QUICK_STATE_CODES = ["DC", "MD", "VA"];

const NAME_LENGTH_MESSAGE = `社区名称需要 ${COMMUNITY_NAME_MIN_LENGTH}-${COMMUNITY_NAME_MAX_LENGTH} 个字。`;
const STATE_REQUIRED_MESSAGE = "请至少选择一个覆盖的州。";
const GENERIC_ERROR_MESSAGE = "提交失败，请稍后重试。";
const SUBMIT_SUCCESS_MESSAGE = "申请已提交，管理员审核后会通过系统通知告诉你结果。";

// 用户能主动展示出原因的几种失败（重复申请 / 重名 / 账号受限），其余都退回通用文案。
const KNOWN_ERROR_CODES = new Set([
  "COMMUNITY_REQUEST_PENDING_EXISTS",
  "COMMUNITY_NAME_TAKEN",
  "ACCOUNT_RESTRICTED"
]);

const STATUS_LABELS: Record<CommunityRequest["status"], { label: string; className: string }> = {
  pending: { label: "审核中", className: "bg-warning/10 text-warning" },
  active: { label: "已通过", className: "bg-success/10 text-success" },
  rejected: { label: "未通过", className: "bg-danger/10 text-danger" },
  archived: { label: "已下线", className: "bg-bg text-text-muted" }
};

/**
 * 创建社区页（/community/create，RequireAuth 包裹，见 routes.tsx）——首页左上角
 * 菜单的"创建社区"进入。普通用户在这里提交申请，管理员在后台"社区申请"审核，
 * 通过后社区才上线、申请人自动成为成员（这一版社区主没有管理权限）。
 *
 * - 表单：社区名称（2-30 字，必填）、简介（最多 200 字，可选）、覆盖的州（至少
 *   一个；DC / MD / VA 三个快捷选项 + 下拉框添加其它州）。前端先做一遍跟数据库
 *   函数相同的长度 / 必填校验，真正的校验（重名、只能有一个审核中的申请、账号
 *   受限）在 request_community 里。
 * - 已经有一个审核中的申请时不显示表单，只显示"正在审核"的提示——数据库同样
 *   会拒绝第二个申请，前端提前挡住，避免用户填完才被告知。
 * - 下方"我的申请"：列出自己提交过的申请和结果（审核中 / 已通过 + 进入社区 /
 *   未通过 + 原因）。
 */
export function CreateCommunityPage() {
  const userId = useAuthStore((s) => s.session)?.user.id;
  const { data: requests, isPending: requestsPending, isError: requestsError } =
    useMyCommunityRequestsQuery(userId);
  const requestCommunity = useRequestCommunityMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stateCodes, setStateCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const pendingRequest = requests?.find((request) => request.status === "pending");
  const otherStates = US_STATES.filter((state) => !QUICK_STATE_CODES.includes(state.code));
  const extraSelected = stateCodes.filter((code) => !QUICK_STATE_CODES.includes(code));

  function toggleState(code: string): void {
    setStateCodes((current) =>
      current.includes(code) ? current.filter((value) => value !== code) : [...current, code]
    );
  }

  function addState(code: string): void {
    if (!code) return;
    setStateCodes((current) => (current.includes(code) ? current : [...current, code]));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (requestCommunity.isPending) return;
    setError(null);
    setSuccessMessage(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (
      trimmedName.length < COMMUNITY_NAME_MIN_LENGTH ||
      trimmedName.length > COMMUNITY_NAME_MAX_LENGTH
    ) {
      setError(NAME_LENGTH_MESSAGE);
      return;
    }
    if (stateCodes.length === 0) {
      setError(STATE_REQUIRED_MESSAGE);
      return;
    }

    try {
      await requestCommunity.mutateAsync({
        name: trimmedName,
        description: trimmedDescription,
        stateCodes
      });
      setName("");
      setDescription("");
      setStateCodes([]);
      setSuccessMessage(SUBMIT_SUCCESS_MESSAGE);
    } catch (submitError) {
      setError(
        submitError instanceof AppError && KNOWN_ERROR_CODES.has(submitError.code)
          ? submitError.message
          : GENERIC_ERROR_MESSAGE
      );
    }
  }

  const chipBase = "flex h-9 items-center rounded-full px-4 text-sm whitespace-nowrap";

  function renderForm() {
    if (requestsPending) {
      return (
        <div role="status">
          <span className="sr-only">加载中…</span>
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="mt-4 h-24 w-full rounded-xl" />
        </div>
      );
    }
    if (pendingRequest) {
      return (
        <p role="status" className="rounded-xl bg-primary-light px-4 py-3 text-sm text-primary">
          你申请的社区「{pendingRequest.name}」正在审核中，审核结果会通过系统通知告诉你。
          同一时间只能有一个审核中的申请。
        </p>
      );
    }
    return (
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        {error ? (
          <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

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
            onChange={(event) => setName(event.target.value)}
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
            onChange={(event) => setDescription(event.target.value)}
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

        <button
          type="submit"
          disabled={requestCommunity.isPending}
          className="h-12 w-full rounded-full bg-primary text-base font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {requestCommunity.isPending ? "提交中…" : "提交申请"}
        </button>
      </form>
    );
  }

  function renderRequests() {
    if (requestsError) {
      return <p role="alert" className="text-sm text-text-muted">申请记录加载失败，请稍后重试。</p>;
    }
    if (!requests || requests.length === 0) return null;
    return (
      <section aria-label="我的申请" className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">我的申请</h2>
        <ul className="flex flex-col gap-2">
          {requests.map((request) => {
            const status = STATUS_LABELS[request.status] ?? STATUS_LABELS.pending;
            return (
              <li key={request.id} className="rounded-xl bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-base text-text">{request.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-subtle">
                  {formatPublishedAt(request.createdAt)} ·{" "}
                  {request.stateCodes.map((code) => code).join(" / ")}
                </p>
                {request.status === "rejected" && request.rejectionReason ? (
                  <p className="mt-2 rounded bg-bg px-2 py-1 text-xs text-text-muted">
                    未通过原因：{request.rejectionReason}
                  </p>
                ) : null}
                {request.status === "active" ? (
                  <Link
                    to={`/community/${request.slug}`}
                    className="mt-2 inline-block text-sm font-medium text-primary"
                  >
                    进入社区 ›
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <main className="min-h-dvh bg-bg pb-24 md:pb-6">
      <TopBar variant="nav-only" title="创建社区" />
      <div className="mx-auto max-w-2xl px-4 py-4">
        <p className="mb-4 text-sm text-text-muted">
          填写社区信息并提交申请，管理员审核通过后社区才会上线，你会自动加入这个社区。
        </p>
        {successMessage ? (
          <p role="status" className="mb-4 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            {successMessage}
          </p>
        ) : null}
        {renderForm()}
        {renderRequests()}
      </div>
    </main>
  );
}
