import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const ERRORS: Record<number, string> = {
  401: '이메일 또는 비밀번호가 올바르지 않습니다.',
  403: '비활성화된 계정입니다. 관리자에게 문의하세요.',
  429: '시도 횟수가 너무 많습니다. 잠시 후 다시 시도하세요.',
};

export default function Login() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'in') return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err instanceof ApiError && ERRORS[err.status]) || '로그인 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  const input = 'w-full border border-[#DEDDD7] rounded px-3 py-2 text-sm focus:outline-none focus:border-navy';

  return (
    <div className="min-h-screen bg-[#F4F4F2] flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="bg-white border border-[#DEDDD7] rounded px-8 py-8 max-w-sm w-full">
        <h1 className="text-lg font-bold">OpsFlow</h1>
        <p className="text-xs text-[#83827D] mt-1 mb-6">사내 업무 요청 · 장애 대응 관리</p>
        <label className="block text-xs font-semibold mb-1" htmlFor="email">이메일</label>
        <input id="email" type="email" required autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="block text-xs font-semibold mt-4 mb-1" htmlFor="password">비밀번호</label>
        <input id="password" type="password" required autoComplete="current-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-xs text-[#8A3D37] mt-3">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full mt-6 bg-navy text-white text-sm font-semibold rounded py-2 disabled:opacity-60">
          {submitting ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}
