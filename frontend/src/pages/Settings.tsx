import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

// GET /api/request-templates?includeArchived=true (Admin) 응답 항목 (RQ-012)
type Template = { id: string; name: string; description: string | null; isActive: boolean; createdAt: string };

const errorText = (e: unknown) =>
  e instanceof ApiError ? `${e.message} (${e.status})` : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

const field = 'border border-[#DEDDD7] rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-navy';
const small = 'border border-[#DEDDD7] rounded px-2.5 py-1 text-xs font-semibold bg-white hover:bg-[#F4F4F2] disabled:opacity-50';
const primarySmall = 'bg-navy text-white rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-50';

// 업무 요청 유형 관리 (RQ-012). 삭제는 없고 보관만 있다. 보관 해제(재활성화)는 SRS 범위 밖이라 API도 없다.
function RequestTemplates() {
  const [items, setItems] = useState<Template[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // 보관된 유형도 관리해야 하므로 Admin 전용 includeArchived=true로 받는다
  const load = useCallback(() => api<Template[]>('/request-templates?includeArchived=true').then(setItems, (e) => setError(errorText(e))), []);
  useEffect(() => {
    load();
  }, [load]);

  // 실패하면 메시지를 띄우고 입력은 그대로 둔다(고쳐서 다시 저장). 성공하면 onDone 후 목록을 다시 받는다.
  async function run(work: () => Promise<unknown>, onDone: () => void) {
    setBusy(true);
    setError('');
    try {
      await work();
      onDone();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function create(e: FormEvent) {
    e.preventDefault();
    run(
      () => api('/request-templates', { method: 'POST', body: JSON.stringify({ name: newName }) }),
      () => {
        setNewName('');
        setAdding(false);
      },
    );
  }

  function rename(e: FormEvent, t: Template) {
    e.preventDefault();
    if (editName.trim() === t.name) return setEditingId(null);
    run(
      () => api(`/request-templates/${t.id}`, { method: 'PATCH', body: JSON.stringify({ name: editName }) }),
      () => setEditingId(null),
    );
  }

  function archive(t: Template) {
    if (!confirm(`"${t.name}" 유형을 보관할까요? 새 요청에서 더 이상 고를 수 없게 됩니다. 기존 요청은 그대로 유지되고, 보관 해제는 지원하지 않습니다.`)) return;
    run(
      () => api(`/request-templates/${t.id}/archive`, { method: 'POST' }),
      () => setEditingId(null),
    );
  }

  return (
    <section className="bg-white border border-[#DEDDD7] rounded" aria-labelledby="templates-title">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[#DEDDD7]">
        <div>
          <h2 id="templates-title" className="text-sm font-bold">
            업무 요청 유형 관리
          </h2>
          <p className="text-xs text-[#83827D] mt-0.5">요청 작성 시 고를 수 있는 유형입니다. 보관하면 새 요청에서 빠지고 기존 요청은 유지됩니다.</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="bg-navy text-white text-sm font-semibold rounded px-4 py-2 shrink-0"
          >
            + 유형 추가
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={create} className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#EEEDE8] bg-[#F9F9F7]" aria-label="유형 추가">
          <label htmlFor="new-template" className="text-xs font-semibold">
            유형명
          </label>
          <input id="new-template" required maxLength={100} autoFocus className={`${field} flex-1 min-w-48`} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className={primarySmall} disabled={busy || !newName.trim()}>
            추가
          </button>
          <button type="button" className={small} onClick={() => setAdding(false)}>
            취소
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mx-5 mt-3 text-sm text-[#8A3D37] bg-[#FBF3F2] border border-[#E5C4C0] rounded px-4 py-2">
          {error}
        </p>
      )}

      <table className="w-full text-sm">
        <thead className="text-left text-xs text-[#83827D] border-b border-[#DEDDD7]">
          <tr>
            <th className="px-5 py-3 font-semibold">유형명</th>
            <th className="px-5 py-3 font-semibold w-28">상태</th>
            <th className="px-5 py-3 w-64" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEDE8]">
          {items?.map((t) =>
            editingId === t.id ? (
              <tr key={t.id} data-name={t.name} className="bg-[#F9F9F7]">
                <td className="px-5 py-2" colSpan={3}>
                  <form onSubmit={(e) => rename(e, t)} className="flex flex-wrap items-center gap-2" aria-label={`${t.name} 수정`}>
                    <input aria-label="유형명" required maxLength={100} autoFocus className={`${field} flex-1 min-w-48`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <button type="submit" className={primarySmall} disabled={busy || !editName.trim()}>
                      저장
                    </button>
                    <button type="button" className={small} onClick={() => setEditingId(null)}>
                      취소
                    </button>
                    {t.isActive ? (
                      <button type="button" className={`${small} text-[#8A3D37] ml-auto`} disabled={busy} onClick={() => archive(t)}>
                        보관하기
                      </button>
                    ) : (
                      <span className="ml-auto text-xs text-[#83827D]">보관됨 · 보관 해제는 지원하지 않습니다</span>
                    )}
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={t.id} data-name={t.name}>
                <td className={`px-5 py-3 ${t.isActive ? '' : 'text-[#83827D]'}`}>{t.name}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-block text-[11px] font-semibold rounded px-2 py-0.5 ${
                      t.isActive ? 'bg-[#E2EFE6] text-[#2F6B45]' : 'bg-[#ECEBE6] text-[#83827D]'
                    }`}
                  >
                    {t.isActive ? '사용 중' : '보관됨'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    className={small}
                    onClick={() => {
                      setEditingId(t.id);
                      setEditName(t.name);
                      setAdding(false);
                      setError('');
                    }}
                  >
                    수정
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {!items && !error && <p className="px-5 py-8 text-center text-sm text-[#83827D]">불러오는 중...</p>}
    </section>
  );
}

export default function Settings() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN')
    return (
      <div className="bg-white border border-[#DEDDD7] rounded px-6 py-16 text-center text-sm text-[#83827D]">
        설정은 Admin만 사용할 수 있습니다.
      </div>
    );
  // 조직 정보·알림 섹션은 받아줄 API가 없어 이번 범위에서 뺐다
  return <RequestTemplates />;
}
