import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime, type Page } from '../lib/requests';

// GET /api/audit-logs 응답 항목
type AuditLog = {
  action: string;
  summary: string;
  changes: Record<string, unknown> | null;
  actor: { id: string; name: string };
  createdAt: string;
  entityType: string;
  entityId: string;
};
type MemberOption = { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' };

// 백엔드가 남기는 entityType 값. 상세 화면이 있는 대상은 링크를 건다.
const ENTITY_TYPES: Record<string, { label: string; link?: string }> = {
  WORK_REQUEST: { label: '업무 요청', link: '/requests' },
  INCIDENT: { label: '장애', link: '/incidents' },
  USER: { label: '구성원' },
  INVITATION: { label: '초대' },
  REQUEST_TEMPLATE: { label: '요청 유형' },
};

const LIMIT = 20; // RQ-002와 같은 기본값

// 화면의 날짜는 브라우저 시간대(한국) 기준이다. 날짜만 보내면 서버가 UTC 자정으로 읽어 9시간 어긋나므로
// 현지 자정을 ISO 시각으로 바꿔 보낸다. from 이상 ~ to 미만이라 끝 날짜는 다음 날 자정으로 보낸다.
const localMidnight = (date: string, addDays = 0) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + addDays);
  return d.toISOString();
};

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '없음' : String(v));

// changes(jsonb)를 읽기 쉬운 줄로: { status: { from, to } } → "status: PENDING → APPROVED"
function describeChanges(changes: AuditLog['changes']): string[] {
  if (!changes) return [];
  return Object.entries(changes).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && ('from' in value || 'to' in value)) {
      const { from, to } = value as { from?: unknown; to?: unknown };
      return `${key}: ${show(from)} → ${show(to)}`;
    }
    return `${key}: ${Array.isArray(value) ? value.join(', ') : show(value)}`;
  });
}

const field = 'border border-[#DEDDD7] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy';

export default function AuditLogs() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  const actorId = params.get('actorId') ?? '';
  const entityType = params.get('entityType') ?? '';
  const fromDate = params.get('from') ?? '';
  const toDate = params.get('to') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [data, setData] = useState<Page<AuditLog> | null>(null);
  const [error, setError] = useState('');

  // 행위자 select: 비활성화된 구성원도 로그에는 남아 있으니 함께 보여 준다
  useEffect(() => {
    if (isAdmin) api<{ members: MemberOption[] }>('/users').then((r) => setMembers(r.members), () => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (actorId) q.set('actorId', actorId);
    if (entityType) q.set('entityType', entityType);
    // 한쪽 날짜만 고르면 그 하루만 본다 (단일 날짜)
    const start = fromDate || toDate;
    if (start) {
      q.set('from', localMidnight(start));
      q.set('to', localMidnight(toDate || fromDate, 1));
    }
    setData(null);
    setError('');
    api<Page<AuditLog>>(`/audit-logs?${q}`).then(setData, (e) =>
      setError(e instanceof ApiError ? `${e.message} (${e.status})` : '감사 로그를 불러오지 못했습니다.'),
    );
  }, [isAdmin, actorId, entityType, fromDate, toDate, page]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next, { replace: true });
  };
  const goPage = (n: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(n));
    setParams(next);
  };

  if (!isAdmin)
    return (
      <div className="bg-white border border-[#DEDDD7] rounded px-6 py-16 text-center text-sm text-[#83827D]">
        감사 로그는 Admin만 볼 수 있습니다.
      </div>
    );

  const lastPage = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const hasFilter = actorId || entityType || fromDate || toDate;

  return (
    <div className="space-y-4">
      {/* 상세 화면의 "← 목록으로" 자리와 겹치지 않도록 첫 줄은 텍스트만 둔다 (목록 화면들과 같은 배치) */}
      <div className="flex items-center justify-between gap-4 min-h-9">
        <p className="text-sm text-[#83827D]">{data && `전체 ${data.total}건 · 읽기 전용`}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="from" className="block text-xs font-semibold mb-1">
            시작일
          </label>
          <input id="from" type="date" className={field} value={fromDate} max={toDate || undefined} onChange={(e) => setFilter('from', e.target.value)} />
        </div>
        <div>
          <label htmlFor="to" className="block text-xs font-semibold mb-1">
            종료일 <span className="font-normal text-[#83827D]">(비우면 시작일 하루)</span>
          </label>
          <input id="to" type="date" className={field} value={toDate} min={fromDate || undefined} onChange={(e) => setFilter('to', e.target.value)} />
        </div>
        <div>
          <label htmlFor="actor" className="block text-xs font-semibold mb-1">
            행위자
          </label>
          <select id="actor" className={field} value={actorId} onChange={(e) => setFilter('actorId', e.target.value)}>
            <option value="">전체</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.status === 'INACTIVE' ? ' (비활성)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="entity" className="block text-xs font-semibold mb-1">
            대상 유형
          </label>
          <select id="entity" className={field} value={entityType} onChange={(e) => setFilter('entityType', e.target.value)}>
            <option value="">전체</option>
            {Object.entries(ENTITY_TYPES).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {hasFilter && (
          <button type="button" onClick={() => setParams({}, { replace: true })} className="text-sm text-navy px-2 py-2 hover:underline">
            필터 초기화
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-[#8A3D37]">
          {error}
        </p>
      )}

      <div className="bg-white border border-[#DEDDD7] rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[#83827D] border-b border-[#DEDDD7]">
            <tr>
              {['시각', '행위자', '행위', '대상', '변경 내용'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEDE8] align-top">
            {data?.items.map((log, i) => {
              const type = ENTITY_TYPES[log.entityType];
              const lines = describeChanges(log.changes);
              return (
                <tr key={`${log.createdAt}-${i}`}>
                  <td className="px-4 py-3 whitespace-nowrap text-[#4A4945]">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{log.actor.name}</td>
                  <td className="px-4 py-3">
                    <p>{log.summary}</p>
                    <p className="text-[11px] text-[#83827D] font-mono">{log.action}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p>{type?.label ?? log.entityType}</p>
                    {type?.link ? (
                      <Link to={`${type.link}/${log.entityId}`} className="text-[11px] text-navy font-mono hover:underline">
                        {log.entityId.slice(0, 8)}
                      </Link>
                    ) : (
                      <p className="text-[11px] text-[#83827D] font-mono">{log.entityId.slice(0, 8)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#4A4945] font-mono break-all">
                    {lines.length ? lines.map((l) => <p key={l}>{l}</p>) : <span className="text-[#83827D]">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-[#83827D]">조건에 맞는 감사 로그가 없습니다.</p>
        )}
        {!data && !error && <p className="px-4 py-10 text-center text-sm text-[#83827D]">불러오는 중...</p>}
      </div>

      {data && lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-[#83827D]">
          <button disabled={page <= 1} onClick={() => goPage(page - 1)} className="border border-[#DEDDD7] rounded px-2 py-1 disabled:opacity-40">
            이전
          </button>
          <span>
            {page} / {lastPage}
          </span>
          <button disabled={page >= lastPage} onClick={() => goPage(page + 1)} className="border border-[#DEDDD7] rounded px-2 py-1 disabled:opacity-40">
            다음
          </button>
        </div>
      )}
    </div>
  );
}
