import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { WorkRequest } from '../lib/requests';

type Template = { id: string; name: string; description: string | null };

const field = 'w-full border border-[#DEDDD7] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy';

// RQ-001 업무 요청 생성. 등록 즉시 PENDING(승인 대기).
export default function RequestNew() {
  const navigate = useNavigate();
  // 기본 GET /request-templates는 모든 역할에게 '사용 중' 유형만 준다 (보관된 유형 제외, RQ-012)
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<Template[]>('/request-templates').then(setTemplates, () => setError('요청 유형을 불러오지 못했습니다.'));
  }, []);

  const canSubmit = templateId !== '' && title.trim() !== '' && content.trim() !== '' && !submitting;
  const selected = templates?.find((t) => t.id === templateId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await api<WorkRequest>('/requests', { method: 'POST', body: JSON.stringify({ templateId, title, content }) });
      navigate(`/requests/${created.id}`, { replace: true });
    } catch (err) {
      // 404: 그사이 유형이 보관된 경우 → 목록을 다시 받아 선택지에서 빠지게 한다
      if (err instanceof ApiError && err.status === 404) {
        setTemplateId('');
        api<Template[]>('/request-templates').then(setTemplates, () => {});
      }
      setError(err instanceof ApiError ? `${err.message} (${err.status})` : '요청을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setSubmitting(false); // 성공하면 화면을 떠나므로 실패할 때만 다시 누를 수 있게 한다 (중복 등록 방지)
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl bg-white border border-[#DEDDD7] rounded px-6 py-6 space-y-5" aria-label="새 업무 요청">
      <div>
        <h2 className="text-base font-bold">새 업무 요청</h2>
        <p className="text-xs text-[#83827D] mt-1">등록하면 '승인 대기' 상태가 되고, Manager·Admin이 승인하거나 반려합니다.</p>
      </div>

      <div>
        <label htmlFor="template" className="block text-xs font-semibold mb-1">
          요청 유형 <span className="text-[#8A3D37]">*</span>
        </label>
        <select id="template" required className={`${field} sm:w-80`} value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!templates}>
          <option value="">{templates ? '유형 선택' : '불러오는 중...'}</option>
          {templates?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {selected?.description && <p className="text-xs text-[#83827D] mt-1">{selected.description}</p>}
        {templates?.length === 0 && <p className="text-xs text-[#8A3D37] mt-1">사용 중인 요청 유형이 없습니다. Admin에게 문의하세요.</p>}
      </div>

      <div>
        <label htmlFor="title" className="block text-xs font-semibold mb-1">
          제목 <span className="text-[#8A3D37]">*</span>
        </label>
        <input id="title" required maxLength={200} className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 운영 DB 읽기 권한 요청" />
      </div>

      <div>
        <label htmlFor="content" className="block text-xs font-semibold mb-1">
          내용 <span className="text-[#8A3D37]">*</span>
        </label>
        <textarea
          id="content"
          required
          rows={6}
          maxLength={5000}
          className={field}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="필요한 이유, 대상, 기한 등"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[#8A3D37] bg-[#FBF3F2] border border-[#E5C4C0] rounded px-4 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={!canSubmit} className="bg-navy text-white text-sm font-semibold rounded px-5 py-2 disabled:opacity-50">
          {submitting ? '등록 중...' : '등록'}
        </button>
        <Link to="/requests" className="border border-[#DEDDD7] rounded px-5 py-2 text-sm font-semibold hover:bg-[#F4F4F2]">
          취소
        </Link>
      </div>
    </form>
  );
}
