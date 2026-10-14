import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// 사이드바 메뉴. 상단바 제목도 현재 경로에 맞는 항목의 이름을 쓴다.
export const NAV = [
  { to: '/', label: '대시보드' },
  { to: '/requests', label: '업무 요청' },
  { to: '/incidents', label: '장애 관리' },
  { to: '/members', label: '구성원' },
  { to: '/audit-logs', label: '감사 로그' },
  { to: '/settings', label: '설정' },
];

const ROLE_LABEL = { MEMBER: 'Member', MANAGER: 'Manager', ADMIN: 'Admin' } as const;

const titleOf = (path: string) =>
  NAV.find((n) => (n.to === '/' ? path === '/' : path === n.to || path.startsWith(`${n.to}/`)))?.label ?? 'OpsFlow';

// 로그인한 사용자용 화면의 공통 틀: 좌측 사이드바 + 상단바 + 본문(<Outlet />).
// 라우트에서 이 컴포넌트 아래에 화면을 중첩하면 된다. 로그인 안 했으면 /login으로 보낸다.
export default function AppLayout() {
  const { status, user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (status === 'loading') return null;
  if (status === 'out') return <Navigate to="/login" replace />;

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#F4F4F2] text-[#1F1E1C]">
      <aside className="fixed inset-y-0 left-0 w-56 bg-white border-r border-[#DEDDD7] flex flex-col">
        <div className="px-5 py-5 border-b border-[#DEDDD7]">
          <p className="text-base font-bold">OpsFlow</p>
          <p className="text-[11px] text-[#83827D] mt-0.5">업무 요청 · 장애 대응</p>
        </div>
        <nav className="flex-1 p-3 space-y-1" aria-label="주 메뉴">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${
                  isActive ? 'bg-navy text-white font-semibold' : 'text-[#4A4945] hover:bg-[#F4F4F2]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="pl-56">
        <header className="h-14 bg-white border-b border-[#DEDDD7] px-6 flex items-center justify-between">
          <h1 className="text-base font-bold">{titleOf(pathname)}</h1>
          <div className="flex items-center gap-4 text-sm">
            {user && (
              <span className="text-[#4A4945]">
                {user.name} · {ROLE_LABEL[user.role]}
              </span>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="border border-[#DEDDD7] rounded px-3 py-1.5 text-xs font-semibold hover:bg-[#F4F4F2]"
            >
              로그아웃
            </button>
          </div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// 아직 만들지 않은 메뉴 자리
export function ComingSoon() {
  return (
    <div className="bg-white border border-[#DEDDD7] rounded px-6 py-16 text-center text-sm text-[#83827D]">
      준비 중입니다.
    </div>
  );
}
