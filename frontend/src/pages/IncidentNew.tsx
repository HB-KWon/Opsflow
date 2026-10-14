import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { SEVERITIES, type Incident, type Severity } from '../lib/incidents';

const field = 'w-full border border-[#DEDDD7] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy';

// IC-001 장애 등록. 인증된 모든 역할이 쓸 수 있다.
export default function IncidentNew() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // '' = 보내지 않음 → 서버 기본값 MEDIUM
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 백엔드에서 제목·설명 모두 필수(1자 이상)라 둘 다 비어 있으면 막는다
  const canSubmit = title.trim() !== '' && description.trim() !== '' && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await api<Incident>('/incidents', {
        method: 'POST',
        body: JSON.stringify({ title, description, ...(severity && { severity }) }),
      });
      navigate(`/incidents/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message} (${err.status})` : '장애를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setSubmitting(false); // 성공하면 화면을 떠나므로 실패할 때만 다시 누를 수 있게 한다 (중복 등록 방지)
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl bg-white border border-[#DEDDD7] rounded px-6 py-6 space-y-5" aria-label="장애 등록">
      <div>
        <h2 className="text-base font-bold">장애 등록</h2>
        <p className="text-xs text-[#83827D] mt-1">등록하면 바로 '접수' 상태가 되고, Manager·Admin이 담당자를 지정합니다.</p>
      </div>

      <div>
        <label htmlFor="title" className="block text-xs font-semibold mb-1">
          제목 <span className="text-[#8A3D37]">*</span>
        </label>
        <input id="title" required maxLength={200} className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 결제 API 5xx 급증" />
      </div>

      <div>
        <label htmlFor="description" className="block text-xs font-semibold mb-1">
          설명 <span className="text-[#8A3D37]">*</span>
        </label>
        <textarea
          id="description"
          required
          rows={6}
          maxLength={5000}
          className={field}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="언제부터, 어떤 증상이, 어디에 영향을 주는지"
        />
      </div>

      <div>
        <label htmlFor="severity" className="block text-xs font-semibold mb-1">
          초기 심각도
        </label>
        <select id="severity" className={`${field} sm:w-64`} value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')}>
          <option value="">선택 안 함 (기본값 MEDIUM)</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
        <Link to="/incidents" className="border border-[#DEDDD7] rounded px-5 py-2 text-sm font-semibold hover:bg-[#F4F4F2]">
          취소
        </Link>
      </div>
    </form>
  );
}
