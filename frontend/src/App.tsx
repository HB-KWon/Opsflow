import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';

// 대시보드 자리: 이번 작업에서는 로그인 여부만 확인하는 빈 화면
function Home() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'out') return <Navigate to="/login" replace />;
  return <div className="p-8 text-sm">로그인됨</div>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
