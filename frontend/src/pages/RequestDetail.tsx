import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { formatDateTime, StatusBadge, type RequestDetail as Detail } from '../lib/requests';

type Assignable = { id: string; name: string; role: string };

// 403·404·409는 백엔드 문구를 그대로 보여 준다 (예: "자신의 요청은 승인하거나 반려할 수 없습니다.")
const errorText = (e: unknown) =>
  e instanceof ApiError ? `${e.message} (${e.status})` : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

// 버튼 노출 규칙: README 업무 요청 API 표(= 백엔드 request-policy)와 같다. 최종 판단은 서버가 한다.
function actionsFor(user: User, req: Detail) {
  const isManagerOrAdmin = user.role === 'MANAGER' || user.role === 'ADMIN';
  const isRequester = user.id === req.requester.id;
  const isAssignee = user.id === req.assignee?.id;
  return {
    cancel: isRequester && req.status === 'PENDING',
    decide: isManagerOrAdmin && !isRequester && req.status === 'PENDING',
    assign: isManagerOrAdmin && !isAssignee && (req.status === 'APPROVED' || req.status === 'IN_PROGRESS'),
    complete: (isAssignee || isManagerOrAdmin) && req.status === 'IN_PROGRESS',
  };
}

const button = 'w-full rounded px-3 py-2 text-sm font-semibold disabled:opacity-50';
const primary = `${button} bg-navy text-white`;
const secondary = `${button} border border-[#DEDDD7] bg-white hover:bg-[#F4F4F2]`;
const danger = `${button} border border-[#E5C4C0] text-[#8A3D37] bg-white hover:bg-[#FBF3F2]`;
const field = 'w-full border border-[#DEDDD7] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[#83827D]">{label}</dt>
      <dd className="text-sm mt-0.5">{children}</dd>
    </div>
  );
}

export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [req, setReq] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [assignees, setAssignees] = useState<Assignable[] | null>(null);
  const [assigneeId, setAssigneeId] = useState('');

  const load = useCallback(
    () =>
      api<Detail>(`/requests/${id}`).then(setReq, (e) =>
        setLoadError(
          e instanceof ApiError && e.status === 404
            ? '요청을 찾을 수 없습니다.'
            : e instanceof ApiError && e.status === 403
              ? '이 요청을 볼 권한이 없습니다.'
              : errorText(e),
        ),
      ),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const actions = user && req ? actionsFor(user, req) : null;

  // 담당자 후보는 지정 권한이 있을 때만 불러온다 (Member는 403)
  useEffect(() => {
    if (actions?.assign && assignees === null) {
      api<Assignable[]>('/users/assignable').then(setAssignees, (e) => setActionError(errorText(e)));
    }
  }, [actions?.assign, assignees]);

  async function run(path: string, init: RequestInit) {
    setBusy(true);
    setActionError('');
    try {
      await api(`/requests/${id}${path}`, init);
      setRejecting(false);
      setReason('');
      setAssigneeId('');
      await load();
    } catch (e) {
      setActionError(errorText(e));
      await load(); // 다른 사람이 먼저 처리했을 수 있으니(409) 최신 상태로 갱신
    } finally {
      setBusy(false);
    }
  }
  const post = (path: string, body?: object) =>
    run(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

  if (loadError)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-[#8A3D37]">
          {loadError}
        </p>
        <Link to="/requests" className="text-sm text-navy hover:underline">
          ← 목록으로
        </Link>
      </div>
    );
  if (!req || !user || !actions) return <p className="text-sm text-[#83827D]">불러오는 중...</p>;

  // 자기 자신은 지정할 수 없고(403), 현재 담당자를 다시 고르는 것은 의미가 없어 뺀다
  const candidates = (assignees ?? []).filter((u) => u.id !== user.id && u.id !== req.assignee?.id);
  const hasAction = actions.cancel || actions.decide || actions.assign || actions.complete;

  return (
    <div className="space-y-4">
      <Link to="/requests" className="text-sm text-navy hover:underline">
        ← 목록으로
      </Link>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-white border border-[#DEDDD7] rounded px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold">{req.title}</h2>
              <StatusBadge status={req.status} />
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
              <Info label="요청 유형">{req.template.name}</Info>
              <Info label="요청자">{req.requester.name}</Info>
              <Info label="담당자">{req.assignee?.name ?? '-'}</Info>
              <Info label="생성일">{formatDateTime(req.createdAt)}</Info>
            </dl>
            {req.status === 'REJECTED' && req.rejectionReason && (
              <div className="mt-5 rounded bg-[#FBF3F2] border border-[#E5C4C0] px-4 py-3 text-sm">
                <p className="text-xs font-semibold text-[#8A3D37]">반려 사유 · {req.rejectedBy?.name}</p>
                <p className="mt-1 whitespace-pre-wrap">{req.rejectionReason}</p>
              </div>
            )}
            <div className="mt-5 pt-5 border-t border-[#EEEDE8]">
              <p className="text-xs text-[#83827D] mb-1">내용</p>
              <p className="text-sm whitespace-pre-wrap">{req.content}</p>
            </div>
          </section>

          <section className="bg-white border border-[#DEDDD7] rounded px-6 py-5">
            <h3 className="text-sm font-bold mb-4">처리 이력</h3>
            <ol className="space-y-3">
              {req.history.map((h, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-navy" aria-hidden />
                  <div>
                    <p>
                      {h.summary} <span className="text-[#83827D]">· {h.actor.name}</span>
                    </p>
                    <p className="text-xs text-[#83827D]">{formatDateTime(h.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="bg-white border border-[#DEDDD7] rounded px-5 py-5 space-y-3" aria-label="처리">
          <h3 className="text-sm font-bold">처리</h3>
          {actionError && (
            <p role="alert" className="text-xs text-[#8A3D37] bg-[#FBF3F2] rounded px-3 py-2">
              {actionError}
            </p>
          )}
          {!hasAction && <p className="text-sm text-[#83827D]">현재 상태에서 할 수 있는 작업이 없습니다.</p>}

          {actions.decide && !rejecting && (
            <div className="space-y-2">
              <button className={primary} disabled={busy} onClick={() => post('/approve')}>
                승인
              </button>
              <button className={danger} disabled={busy} onClick={() => setRejecting(true)}>
                반려
              </button>
            </div>
          )}
          {actions.decide && rejecting && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                post('/reject', { reason });
              }}
            >
              <label htmlFor="reason" className="block text-xs font-semibold">
                반려 사유
              </label>
              <textarea id="reason" required rows={3} maxLength={1000} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="submit" className={danger} disabled={busy || !reason.trim()}>
                반려 확정
              </button>
              <button type="button" className={secondary} disabled={busy} onClick={() => setRejecting(false)}>
                취소
              </button>
            </form>
          )}

          {actions.assign && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                run('/assignee', { method: 'PATCH', body: JSON.stringify({ assigneeId }) });
              }}
            >
              <label htmlFor="assignee" className="block text-xs font-semibold">
                {req.status === 'APPROVED' ? '담당자 지정' : '담당자 변경'}
              </label>
              <select id="assignee" className={field} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={assignees === null}>
                <option value="">{assignees === null ? '불러오는 중...' : '담당자 선택'}</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
              <button type="submit" className={primary} disabled={busy || !assigneeId}>
                {req.status === 'APPROVED' ? '지정하고 진행 시작' : '담당자 변경'}
              </button>
            </form>
          )}

          {actions.complete && (
            <button className={primary} disabled={busy} onClick={() => post('/complete')}>
              완료 처리
            </button>
          )}
          {actions.cancel && (
            <button className={danger} disabled={busy} onClick={() => post('/cancel')}>
              요청 취소
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
