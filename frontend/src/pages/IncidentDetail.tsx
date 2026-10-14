import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { IncidentStatusBadge, SEVERITIES, SeverityBadge, type IncidentDetail as Detail, type Severity } from '../lib/incidents';
import { formatDateTime } from '../lib/requests';

type Assignable = { id: string; name: string; role: string };
type Postmortem = { cause: string; action: string; prevention: string };

// 403·404·409는 백엔드 문구를 그대로 보여 준다 (예: Postmortem 없이 종료 시 409)
const errorText = (e: unknown) =>
  e instanceof ApiError ? `${e.message} (${e.status})` : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

// 버튼 노출 규칙: README 장애 대응 API 표(= 백엔드 incident-policy)와 같다. 최종 판단은 서버가 한다.
// 종료 버튼은 peak 심각도가 응답에 없어 Postmortem 의무 여부를 알 수 없으므로 RESOLVED면 보여 주고, 판정은 서버(409)에 맡긴다.
function actionsFor(user: User, inc: Detail) {
  const isManagerOrAdmin = user.role === 'MANAGER' || user.role === 'ADMIN';
  const isResponder = isManagerOrAdmin || user.id === inc.assignee?.id;
  return {
    assign: isManagerOrAdmin && (inc.status === 'OPEN' || inc.status === 'INVESTIGATING'),
    note: isResponder && inc.status !== 'CLOSED',
    severity: isResponder && inc.status !== 'CLOSED',
    resolve: isResponder && inc.status === 'INVESTIGATING',
    postmortem: isResponder && inc.status === 'RESOLVED',
    close: isManagerOrAdmin && inc.status === 'RESOLVED',
  };
}

const button = 'w-full rounded px-3 py-2 text-sm font-semibold disabled:opacity-50';
const primary = `${button} bg-navy text-white`;
const field = 'w-full border border-[#DEDDD7] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy';
const card = 'bg-white border border-[#DEDDD7] rounded px-6 py-5';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[#83827D]">{label}</dt>
      <dd className="text-sm mt-0.5">{children}</dd>
    </div>
  );
}

const POSTMORTEM_FIELDS: { key: keyof Postmortem; label: string }[] = [
  { key: 'cause', label: '원인' },
  { key: 'action', label: '조치' },
  { key: 'prevention', label: '재발 방지' },
];

export default function IncidentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [inc, setInc] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignees, setAssignees] = useState<Assignable[] | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [note, setNote] = useState('');
  const [pm, setPm] = useState<Postmortem>({ cause: '', action: '', prevention: '' });

  const load = useCallback(
    () =>
      api<Detail>(`/incidents/${id}`).then(
        (data) => {
          setInc(data);
          setSeverity(data.severity);
          // 이미 쓴 Postmortem이 있으면 수정할 수 있게 채워 둔다
          // 응답의 writtenAt까지 넣으면 PUT 본문에 섞여 400(허용되지 않은 필드)이 나므로 세 칸만 꺼낸다
          if (data.postmortem) {
            const { cause, action, prevention } = data.postmortem;
            setPm({ cause, action, prevention });
          }
        },
        (e) => setLoadError(e instanceof ApiError && e.status === 404 ? '장애를 찾을 수 없습니다.' : errorText(e)),
      ),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const actions = user && inc ? actionsFor(user, inc) : null;

  // 담당자 후보는 지정 권한이 있을 때만 불러온다 (Member는 403)
  useEffect(() => {
    if (actions?.assign && assignees === null) {
      api<Assignable[]>('/users/assignable').then(setAssignees, (e) => setActionError(errorText(e)));
    }
  }, [actions?.assign, assignees]);

  async function run(path: string, method: string, body?: object, onDone?: () => void) {
    setBusy(true);
    setActionError('');
    try {
      await api(`/incidents/${id}${path}`, { method, body: body ? JSON.stringify(body) : undefined });
      onDone?.();
      await load();
    } catch (e) {
      setActionError(errorText(e));
      await load(); // 다른 사람이 먼저 처리했을 수 있으니(409) 최신 상태로 갱신
    } finally {
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-[#8A3D37]">
          {loadError}
        </p>
        <Link to="/incidents" className="text-sm text-navy hover:underline">
          ← 목록으로
        </Link>
      </div>
    );
  if (!inc || !user || !actions) return <p className="text-sm text-[#83827D]">불러오는 중...</p>;

  // RQ와 달리 자기 자신도 지정할 수 있다 (IC-004). 현재 담당자만 뺀다.
  const candidates = (assignees ?? []).filter((u) => u.id !== inc.assignee?.id);
  const hasPanelAction = actions.assign || actions.severity || actions.resolve || actions.close;
  const pmComplete = POSTMORTEM_FIELDS.every((f) => pm[f.key].trim());

  return (
    <div className="space-y-4">
      <Link to="/incidents" className="text-sm text-navy hover:underline">
        ← 목록으로
      </Link>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <section className={card}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold">{inc.title}</h2>
              <div className="flex shrink-0 gap-1.5">
                <SeverityBadge severity={inc.severity} />
                <IncidentStatusBadge status={inc.status} />
              </div>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
              <Info label="등록자">{inc.reporter.name}</Info>
              <Info label="담당자">{inc.assignee?.name ?? '-'}</Info>
              <Info label="등록일">{formatDateTime(inc.createdAt)}</Info>
            </dl>
            <div className="mt-5 pt-5 border-t border-[#EEEDE8]">
              <p className="text-xs text-[#83827D] mb-1">설명</p>
              <p className="text-sm whitespace-pre-wrap">{inc.description}</p>
            </div>
          </section>

          {(actions.postmortem || inc.postmortem) && (
            <section className={card} aria-label="Postmortem">
              <h3 className="text-sm font-bold mb-4">
                Postmortem
                {inc.postmortem && (
                  <span className="ml-2 font-normal text-xs text-[#83827D]">{formatDateTime(inc.postmortem.writtenAt)} 저장</span>
                )}
              </h3>
              {actions.postmortem ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run('/postmortem', 'PUT', pm);
                  }}
                >
                  {POSTMORTEM_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label htmlFor={`pm-${f.key}`} className="block text-xs font-semibold mb-1">
                        {f.label}
                      </label>
                      <textarea
                        id={`pm-${f.key}`}
                        required
                        rows={3}
                        maxLength={5000}
                        className={field}
                        value={pm[f.key]}
                        onChange={(e) => setPm({ ...pm, [f.key]: e.target.value })}
                      />
                    </div>
                  ))}
                  <button type="submit" className={`${primary} sm:w-auto sm:px-6`} disabled={busy || !pmComplete}>
                    {inc.postmortem ? 'Postmortem 수정' : 'Postmortem 저장'}
                  </button>
                </form>
              ) : (
                <dl className="space-y-3">
                  {POSTMORTEM_FIELDS.map((f) => (
                    <Info key={f.key} label={f.label}>
                      <span className="whitespace-pre-wrap">{inc.postmortem![f.key]}</span>
                    </Info>
                  ))}
                </dl>
              )}
            </section>
          )}

          <section className={card}>
            <h3 className="text-sm font-bold mb-4">대응 타임라인</h3>
            <ol className="space-y-3">
              {inc.timeline.map((t, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.content ? 'bg-[#7A5A1E]' : 'bg-navy'}`} aria-hidden />
                  <div className="min-w-0">
                    <p>
                      {t.summary} <span className="text-[#83827D]">· {t.actor.name}</span>
                    </p>
                    {t.content && (
                      <p className="mt-1 rounded bg-[#F9F9F7] border border-[#EEEDE8] px-3 py-2 whitespace-pre-wrap">{t.content}</p>
                    )}
                    <p className="text-xs text-[#83827D] mt-0.5">{formatDateTime(t.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
            {actions.note && (
              <form
                className="mt-5 pt-5 border-t border-[#EEEDE8] space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run('/timeline', 'POST', { content: note }, () => setNote(''));
                }}
              >
                <label htmlFor="note" className="block text-xs font-semibold">
                  대응 기록 추가
                </label>
                <textarea
                  id="note"
                  rows={2}
                  maxLength={5000}
                  placeholder="조치 내용, 확인한 사실 등"
                  className={field}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button type="submit" className={`${primary} sm:w-auto sm:px-6`} disabled={busy || !note.trim()}>
                  기록 추가
                </button>
              </form>
            )}
          </section>
        </div>

        <aside className="bg-white border border-[#DEDDD7] rounded px-5 py-5 space-y-4" aria-label="처리">
          <h3 className="text-sm font-bold">처리</h3>
          {actionError && (
            <p role="alert" className="text-xs text-[#8A3D37] bg-[#FBF3F2] rounded px-3 py-2">
              {actionError}
            </p>
          )}
          {!hasPanelAction && <p className="text-sm text-[#83827D]">현재 상태에서 할 수 있는 작업이 없습니다.</p>}

          {actions.severity && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                run('/severity', 'PATCH', { severity });
              }}
            >
              <label htmlFor="severity" className="block text-xs font-semibold">
                심각도
              </label>
              <select id="severity" className={field} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button type="submit" className={primary} disabled={busy || severity === inc.severity}>
                심각도 변경
              </button>
            </form>
          )}

          {actions.assign && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                run('/assignee', 'PATCH', { assigneeId }, () => setAssigneeId(''));
              }}
            >
              <label htmlFor="assignee" className="block text-xs font-semibold">
                {inc.status === 'OPEN' ? '담당자 지정' : '담당자 변경'}
              </label>
              <select id="assignee" className={field} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={assignees === null}>
                <option value="">{assignees === null ? '불러오는 중...' : '담당자 선택'}</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role}){u.id === user.id ? ' · 나' : ''}
                  </option>
                ))}
              </select>
              <button type="submit" className={primary} disabled={busy || !assigneeId}>
                {inc.status === 'OPEN' ? '지정하고 조사 시작' : '담당자 변경'}
              </button>
            </form>
          )}

          {(actions.resolve || actions.close) && (
            <div className="space-y-2 pt-1">
              {actions.resolve && (
                <button className={primary} disabled={busy} onClick={() => run('/resolve', 'POST')}>
                  해결 처리
                </button>
              )}
              {actions.close && (
                <button className={primary} disabled={busy} onClick={() => run('/close', 'POST')}>
                  종료 처리
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
