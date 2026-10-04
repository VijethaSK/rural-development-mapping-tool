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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = [
    { to: '/map', label: 'Map' },
    { to: '/priorities', label: 'Priorities' },
    { to: '/routes', label: 'Route Optimizer' },
    { to: '/gaps', label: 'Gap Analysis' },
    { to: '/heatmap', label: 'Heatmap' },
    { to: '/budget', label: 'Budget' },
    { to: '/pdo/work', label: 'My Work' },
    { to: '/complaints', label: 'Grievances' },
    { to: '/schools', label: 'Schools' },
    { to: '/roads', label: 'Roads' },
    { to: '/report', label: 'Report Issue' },
    ...(token && user?.role === 'admin' ? [{ to: '/admin/reports', label: 'Reports' }] : []),
    ...(token && user?.role !== 'pdo' && user?.role !== 'citizen' ? [{ to: '/admin', label: 'Dashboard' }] : []),
    ...(token && user?.role !== 'citizen' ? [{ to: '/admin/issues', label: 'Issues' }] : [])
  ];

  const renderLinks = (mobile = false) => navItems.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={mobile ? () => setMobileMenuOpen(false) : undefined}
      className={({ isActive }) => `app-nav-link ${mobile
        ? 'block rounded-lg px-3 py-2.5 text-sm font-medium'
        : 'rounded-md px-1 py-2 text-[13px] font-medium'}${isActive ? ' app-nav-link-active' : ''}`}
    >
      {item.label}
    </NavLink>
  ));

  return (
    <header className="app-header sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <div className="flex min-h-16 items-center gap-4">
          <NavLink to="/" className="app-brand shrink-0 rounded-md text-lg font-bold tracking-tight" aria-label="RDMT home">
            RDMT
          </NavLink>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-x-2 whitespace-nowrap xl:flex 2xl:gap-x-3" aria-label="Main navigation">
            {renderLinks()}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {token && (user?.role === 'pdo' || user?.role === 'citizen') && (
              <span className={`hidden 2xl:inline-flex rounded-lg px-2.5 py-1.5 text-xs font-semibold ${user.role === 'pdo' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
                {user.role === 'pdo' ? 'PDO' : 'Citizen'}: {user.name}
              </span>
            )}
            <button
              type="button"
              onClick={onToggle}
              className="app-header-action rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-sm"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            {token ? (
              <button type="button" onClick={logout} className="app-logout rounded-lg px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:px-3 sm:text-sm">
                Logout
              </button>
            ) : (
              <NavLink to="/login" className="app-signin rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-4 sm:text-sm">
                Sign In
              </NavLink>
            )}
            <button
              type="button"
              className="app-header-action rounded-lg border px-3 py-2 text-sm font-semibold xl:hidden"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-main-navigation"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav id="mobile-main-navigation" className="app-mobile-menu border-t py-3 xl:hidden" aria-label="Main navigation">
            {token && user && (
              <p className="landing-muted px-3 pb-2 text-xs font-medium">
                Signed in as {user.name} · {user.role}
              </p>
            )}
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {renderLinks(true)}
            </div>
          </nav>
        )}
      </div>
    </header>
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
