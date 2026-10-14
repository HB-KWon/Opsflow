import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { formatDate, REQUEST_STATUS, StatusBadge, type Page, type RequestStatus, type WorkRequest } from '../lib/requests';

type Template = { id: string; name: string };

// 한 번에 API 최대치(100건)를 받는다. 제목 검색은 백엔드 파라미터가 없어 받은 페이지 안에서만 거른다.
const LIMIT = 100;

const select = 'border border-[#DEDDD7] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy';

export default function RequestList() {
  const navigate = useNavigate();
  // 필터는 URL에 둔다 → 상세에 갔다가 뒤로 와도 유지
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const templateId = params.get('templateId') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [data, setData] = useState<Page<WorkRequest> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Template[]>('/request-templates').then(setTemplates, () => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (status) q.set('status', status);
    if (templateId) q.set('templateId', templateId);
    setData(null);
    setError('');
    api<Page<WorkRequest>>(`/requests?${q}`).then(setData, (e) =>
      setError(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.'),
    );
  }, [status, templateId, page]);

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

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.items ?? []).filter((r) => !keyword || r.title.toLowerCase().includes(keyword));
  }, [data, search]);

  const lastPage = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="상태" className={select} value={status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">전체 상태</option>
          {(Object.keys(REQUEST_STATUS) as RequestStatus[]).map((s) => (
            <option key={s} value={s}>
              {REQUEST_STATUS[s]}
            </option>
          ))}
        </select>
        <select aria-label="유형" className={select} value={templateId} onChange={(e) => setFilter('templateId', e.target.value)}>
          <option value="">전체 유형</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="제목 검색"
          placeholder="제목 검색"
          className={`${select} w-56`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Link to="/requests/new" className="ml-auto bg-navy text-white text-sm font-semibold rounded px-4 py-2">
          + 새 요청
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
              {['제목', '유형', '요청자', '담당자', '상태', '생성일'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEDE8]">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/requests/${r.id}`)} className="cursor-pointer hover:bg-[#F9F9F7]">
                <td className="px-4 py-3">
                  {/* 키보드 사용자도 상세로 갈 수 있도록 제목은 링크로 둔다 */}
                  <Link to={`/requests/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.title}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{r.template.name}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.requester.name}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.assignee?.name ?? <span className="text-[#83827D]">-</span>}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[#4A4945]">{formatDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-[#83827D]">
            {search ? '검색 결과가 없습니다.' : '업무 요청이 없습니다.'}
          </p>
        )}
        {!data && !error && <p className="px-4 py-10 text-center text-sm text-[#83827D]">불러오는 중...</p>}
      </div>

      {data && (
        <div className="flex items-center justify-between text-xs text-[#83827D]">
          <span>
            전체 {data.total}건{search && ` 중 이 페이지에서 ${rows.length}건 일치`}
          </span>
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
