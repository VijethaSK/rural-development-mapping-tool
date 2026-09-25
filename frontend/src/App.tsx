import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Landing from './pages/Landing';
import MapPage from './pages/MapPage';
import SchoolsPage from './pages/SchoolsPage';
import RoadsPage from './pages/RoadsPage';
import ReportIssuePage from './pages/ReportIssuePage';
import PriorityDashboardPage from './pages/PriorityDashboardPage';
import RouteOptimizationPage from './pages/RouteOptimizationPage';
import GapAnalysisPage from './pages/GapAnalysisPage';
import ComplaintHeatmapPage from './pages/ComplaintHeatmapPage';
import BudgetRecommendationPage from './pages/BudgetRecommendationPage';
import LoginPage from './pages/admin/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import IssuesPage from './pages/admin/IssuesPage';
import SchoolManagePage from './pages/admin/SchoolManagePage';
import RoadManagePage from './pages/admin/RoadManagePage';
import PdoDashboardPage from './pages/pdo/PdoDashboardPage';
import CitizenPortalPage from './pages/citizen/CitizenPortalPage';
import ReportsPage from './pages/admin/ReportsPage';
import { AuthProvider, useAuth } from './store/auth';
import { apiAuth } from './api/client';

function Nav({ theme, onToggle }: { theme: 'light'|'dark'; onToggle: () => void }) {
  const { token, user, logout } = useAuth();
  return (
    <div className="app-header sticky top-0 z-20 bg-white/80 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto flex items-center justify-between p-4">
        <div className="flex gap-4 items-center flex-wrap">
          <NavLink to="/" className={({ isActive }) => (isActive ? "font-semibold text-blue-600" : "font-semibold")}>RDMT</NavLink>
          <NavLink to="/map" className={({ isActive }) => (isActive ? "text-blue-600" : "")}>Map</NavLink>
          <NavLink to="/priorities" className={({ isActive }) => (isActive ? "text-blue-600 font-semibold" : "")}>Priorities</NavLink>
          <NavLink to="/routes" className={({ isActive }) => (isActive ? "text-blue-600 font-semibold" : "")}>Route Optimizer</NavLink>
          <NavLink to="/gaps" className={({ isActive }) => (isActive ? "text-blue-600 font-semibold" : "")}>Gap Analysis</NavLink>
          <NavLink to="/heatmap" className={({ isActive }) => (isActive ? "text-blue-600 font-semibold" : "")}>Heatmap</NavLink>
          <NavLink to="/budget" className={({ isActive }) => (isActive ? "text-blue-600 font-semibold" : "")}>Budget</NavLink>
          <NavLink to="/pdo/work" className={({ isActive }) => (isActive ? "text-blue-600 font-bold" : "text-slate-700 font-medium")}>My Work</NavLink>
          <NavLink to="/complaints" className={({ isActive }) => (isActive ? "text-blue-600 font-bold" : "text-slate-700 font-medium")}>Grievances</NavLink>
          <NavLink to="/schools" className={({ isActive }) => (isActive ? "text-blue-600" : "")}>Schools</NavLink>
          <NavLink to="/roads" className={({ isActive }) => (isActive ? "text-blue-600" : "")}>Roads</NavLink>
          <NavLink to="/report" className={({ isActive }) => (isActive ? "text-blue-600" : "")}>Report Issue</NavLink>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={onToggle} className="btn px-2 py-1 border rounded">{theme === 'dark' ? 'Light' : 'Dark'}</button>
          {token ? (
            <>
            {user?.role === 'admin' && <NavLink to="/admin/reports" className={({ isActive }) => (isActive ? "text-blue-600 font-semibold" : "")}>Reports</NavLink>}
            {user?.role === 'pdo' ? (
              <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-800 rounded-md font-semibold">
                PDO: {user.name}
              </span>
            ) : user?.role === 'citizen' ? (
              <span className="text-xs px-2 py-1 bg-sky-100 text-sky-800 rounded-md font-semibold">
                👤 {user.name}
              </span>
            ) : (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "text-blue-600" : "")}>Dashboard</NavLink>
            )}
            {user?.role !== 'citizen' && (
              <NavLink to="/admin/issues" className={({ isActive }) => (isActive ? "text-blue-600" : "")}>Issues</NavLink>
            )}
            <button onClick={logout} className="text-red-600">Logout</button>
            </>
          ) : (
          <NavLink to="/login" className={({ isActive }) => (isActive ? "text-blue-600" : "")}>Sign In</NavLink>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (!token) { setIsAdmin(false); return; }
    apiAuth<{ user: { role: string } }>('/auth/me', token)
      .then(({ user }) => { if (active) setIsAdmin(user.role === 'admin'); })
      .catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [token]);
  if (!token) return <Navigate to="/login" />;
  if (isAdmin === null) return <div className="p-8 text-center">Checking administrator access…</div>;
  return isAdmin ? children : <Navigate to="/" />;
}

function AdminOnlyRoute({ children }: { children: JSX.Element }) {
  return <AdminRoute>{children}</AdminRoute>;
}

export default function App() {
  const [theme, setTheme] = useState<'light'|'dark'>(() => (localStorage.getItem('theme') as 'light'|'dark') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  return (
    <AuthProvider>
      <Nav theme={theme} onToggle={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} />
      <div className="p-4">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/priorities" element={<PriorityDashboardPage />} />
          <Route path="/routes" element={<RouteOptimizationPage />} />
          <Route path="/gaps" element={<GapAnalysisPage />} />
          <Route path="/heatmap" element={<ComplaintHeatmapPage />} />
          <Route path="/budget" element={<BudgetRecommendationPage />} />
          <Route path="/schools" element={<SchoolsPage />} />
          <Route path="/roads" element={<RoadsPage />} />
          <Route path="/complaints" element={<CitizenPortalPage />} />
          <Route path="/report" element={<CitizenPortalPage />} />
          <Route path="/citizen" element={<Navigate to="/complaints" />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pdo/work" element={<PdoDashboardPage />} />
          <Route path="/work" element={<Navigate to="/pdo/work" />} />
          <Route path="/admin" element={<AdminRoute><DashboardPage /></AdminRoute>} />
          <Route path="/admin/issues" element={<AdminRoute><IssuesPage /></AdminRoute>} />
          <Route path="/admin/schools" element={<AdminRoute><SchoolManagePage /></AdminRoute>} />
          <Route path="/admin/roads" element={<AdminRoute><RoadManagePage /></AdminRoute>} />
          <Route path="/admin/reports" element={<AdminOnlyRoute><ReportsPage /></AdminOnlyRoute>} />
        </Routes>
      </div>
      <div className="app-footer border-t">
        <footer className="max-w-6xl mx-auto p-4 text-sm text-slate-600">
          <div className="flex justify-between items-center">
            <div>© {new Date().getFullYear()} RDMT</div>
            <div className="flex gap-4 flex-wrap">
              <a href="/map">Map</a>
              <a href="/priorities">Priorities</a>
              <a href="/routes">Route Optimizer</a>
              <a href="/gaps">Gap Analysis</a>
              <a href="/heatmap">Heatmap</a>
              <a href="/budget">Budget</a>
              <a href="/pdo/work">My Work</a>
              <a href="/complaints">Grievances</a>
              <a href="/schools">Schools</a>
              <a href="/roads">Roads</a>
              <a href="/report">Report Issue</a>
            </div>
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
}
