import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import {
  INCIDENT_STATUS,
  IncidentStatusBadge,
  SEVERITIES,
  SeverityBadge,
  type Incident,
  type IncidentStatus,
} from '../lib/incidents';
import { formatDate, type Page } from '../lib/requests';

const LIMIT = 100;

const select = 'border border-[#DEDDD7] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy';

// 같은 조직이면 역할과 무관하게 전체 공개 (IC-002). 필터는 API 파라미터 그대로 URL에 둔다.
export default function IncidentList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const severity = params.get('severity') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [data, setData] = useState<Page<Incident> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (status) q.set('status', status);
    if (severity) q.set('severity', severity);
    setData(null);
    setError('');
    api<Page<Incident>>(`/incidents?${q}`).then(setData, (e) =>
      setError(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.'),
    );
  }, [status, severity, page]);

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

  const lastPage = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="상태" className={select} value={status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">전체 상태</option>
          {(Object.keys(INCIDENT_STATUS) as IncidentStatus[]).map((s) => (
            <option key={s} value={s}>
              {INCIDENT_STATUS[s]}
            </option>
          ))}
        </select>
        <select aria-label="심각도" className={select} value={severity} onChange={(e) => setFilter('severity', e.target.value)}>
          <option value="">전체 심각도</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Link to="/incidents/new" className="ml-auto bg-navy text-white text-sm font-semibold rounded px-4 py-2">
          + 장애 등록
        </Link>
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
              {['제목', '심각도', '상태', '담당자', '등록일'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEDE8]">
            {data?.items.map((i) => (
              <tr key={i.id} onClick={() => navigate(`/incidents/${i.id}`)} className="cursor-pointer hover:bg-[#F9F9F7]">
                <td className="px-4 py-3">
                  {/* 키보드 사용자도 상세로 갈 수 있도록 제목은 링크로 둔다 */}
                  <Link to={`/incidents/${i.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {i.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <SeverityBadge severity={i.severity} />
                </td>
                <td className="px-4 py-3">
                  <IncidentStatusBadge status={i.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{i.assignee?.name ?? <span className="text-[#83827D]">-</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap text-[#4A4945]">{formatDate(i.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="px-4 py-10 text-center text-sm text-[#83827D]">장애가 없습니다.</p>}
        {!data && !error && <p className="px-4 py-10 text-center text-sm text-[#83827D]">불러오는 중...</p>}
      </div>

      {data && (
        <div className="flex items-center justify-between text-xs text-[#83827D]">
          <span>전체 {data.total}건</span>
          {lastPage > 1 && (
            <div className="flex items-center gap-2">
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
      )}
    </div>
  );
}
