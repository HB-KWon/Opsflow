import { useEffect, useState } from 'react';

// 아직은 화면을 다 옮기기 전, 환경이 잘 붙었는지 확인하는 용도의 임시 화면.
// 백엔드 /health 를 호출해서 연결 상태를 보여준다.
function App() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('error'));
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F4F2] flex items-center justify-center">
      <div className="bg-white border border-[#DEDDD7] rounded px-8 py-6 max-w-sm w-full">
        <div className="text-sm font-bold">OpsFlow</div>
        <div className="text-xs text-[#83827D] mt-1">사내 업무 요청 · 장애 대응 관리</div>
        <div className="mt-4 text-xs">
          백엔드 연결 상태:{' '}
          <span
            className={
              apiStatus === 'ok'
                ? 'text-[#2F6B3C] font-semibold'
                : apiStatus === 'error'
                  ? 'text-[#8A3D37] font-semibold'
                  : 'text-[#83827D]'
            }
          >
            {apiStatus === 'checking' ? '확인 중...' : apiStatus === 'ok' ? '정상' : '연결 안 됨'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
