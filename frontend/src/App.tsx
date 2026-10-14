import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout, { ComingSoon, NAV } from './components/AppLayout';
import { AuthProvider } from './lib/auth';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import RequestDetail from './pages/RequestDetail';
import RequestList from './pages/RequestList';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/requests" element={<RequestList />} />
            <Route path="/requests/new" element={<ComingSoon />} />
            <Route path="/requests/:id" element={<RequestDetail />} />
            {NAV.filter((n) => n.to !== '/' && n.to !== '/requests').map((n) => (
              <Route key={n.to} path={n.to} element={<ComingSoon />} />
            ))}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
