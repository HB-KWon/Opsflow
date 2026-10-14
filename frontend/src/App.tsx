import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout, { ComingSoon } from './components/AppLayout';
import { AuthProvider } from './lib/auth';
import AuditLogs from './pages/AuditLogs';
import Dashboard from './pages/Dashboard';
import IncidentDetail from './pages/IncidentDetail';
import IncidentList from './pages/IncidentList';
import Login from './pages/Login';
import Members from './pages/Members';
import RequestDetail from './pages/RequestDetail';
import RequestList from './pages/RequestList';
import Settings from './pages/Settings';

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
            <Route path="/incidents" element={<IncidentList />} />
            <Route path="/incidents/new" element={<ComingSoon />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/members" element={<Members />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
