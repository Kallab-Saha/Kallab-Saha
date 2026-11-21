import { useCallback, useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { EquipmentCatalogView } from './components/EquipmentCatalogView';
import { IssuedKitsView } from './components/IssuedKitsView';
import { LoginView } from './components/LoginView';
import { MaintenanceView } from './components/MaintenanceView';
import { OverviewView } from './components/OverviewView';
import { QrLookupView } from './components/QrLookupView';
import { ReportSpecsView } from './components/ReportSpecsView';
import { ReportsView } from './components/ReportsView';
import { Sidebar, type NavTab } from './components/Sidebar';
import { SubmitReturnView } from './components/SubmitReturnView';
import { UserManagementView } from './components/UserManagementView';
import { apiRequest, setAuthToken } from './lib/api';
import type { OverviewStats, UserPublic } from './shared/types';

const TAB_TITLES: Record<NavTab, string> = {
  overview: 'Overview',
  catalog: 'Equipment Catalog',
  'qr-lookup': 'QR & Asset Lookup',
  'issued-kits': 'Issued Kits & Admin Verification',
  'submit-return': 'Submit Kit Return',
  maintenance: 'Maintenance & Calibration',
  reports: 'Reports & Alerts',
  users: 'User & Permission Management',
  'report-specs': 'Project Report & SE Models',
};

export default function App() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const hydrateSession = useCallback(async () => {
    setCheckingSession(true);
    try {
      const res = await apiRequest<{ user: UserPublic | null }>('/api/auth/session');
      setUser(res.user);
      if (res.user && res.user.role === 'ADMIN') {
        const ov = await apiRequest<OverviewStats>('/api/overview');
        setPendingCount(ov.pendingVerificationsCount ?? 0);
      }
    } catch {
      setUser(null);
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // clear locally regardless
    }
    setAuthToken(null);
    setUser(null);
    setActiveTab('overview');
    setPendingCount(0);
  }

  function handleLoginSuccess(loggedInUser: UserPublic) {
    setUser(loggedInUser);
    setActiveTab('overview');
    if (loggedInUser.role === 'ADMIN') {
      apiRequest<OverviewStats>('/api/overview')
        .then((ov) => setPendingCount(ov.pendingVerificationsCount ?? 0))
        .catch(() => {});
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-xs font-medium text-slate-600">Loading Laboratory Equipment Tracker...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginView onSuccess={handleLoginSuccess} />;
  }

  const isAdmin = user.role === 'ADMIN';

  // Enforce route-level RBAC even if activeTab state changes
  const effectiveTab: NavTab = (() => {
    if (activeTab === 'issued-kits' && !isAdmin) return 'overview';
    if (activeTab === 'users' && !isAdmin) return 'overview';
    if (activeTab === 'submit-return' && (isAdmin || !user.permissions.canSubmitKitReturn)) {
      return 'overview';
    }
    if ((activeTab === 'catalog' || activeTab === 'qr-lookup') && !isAdmin && !user.permissions.canViewInventory) {
      return 'overview';
    }
    if (
      activeTab === 'maintenance' &&
      !isAdmin &&
      !user.permissions.canViewMaintenance &&
      !user.permissions.canReportFault
    ) {
      return 'overview';
    }
    if (activeTab === 'reports' && !isAdmin && !user.permissions.canViewReports) {
      return 'overview';
    }
    return activeTab;
  })();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        user={user}
        activeTab={effectiveTab}
        onSelectTab={setActiveTab}
        onLogout={handleLogout}
        pendingCount={pendingCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-slate-700 hover:bg-slate-100 rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
              <span className="hidden sm:inline whitespace-nowrap">UEM CSE (IoT)</span>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="text-sm font-semibold text-slate-900 truncate">
                {TAB_TITLES[effectiveTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isAdmin && effectiveTab !== 'issued-kits' && (
              <button
                type="button"
                onClick={() => setActiveTab('issued-kits')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                Verify Submissions ({pendingCount})
              </button>
            )}
            {!isAdmin && user.permissions.canSubmitKitReturn && effectiveTab !== 'submit-return' && (
              <button
                type="button"
                onClick={() => setActiveTab('submit-return')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                Submit Kit Return
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {effectiveTab === 'overview' && (
            <OverviewView user={user} onNavigate={setActiveTab} />
          )}
          {effectiveTab === 'catalog' && <EquipmentCatalogView user={user} />}
          {effectiveTab === 'qr-lookup' && <QrLookupView user={user} />}
          {effectiveTab === 'issued-kits' && isAdmin && (
            <IssuedKitsView onPendingCountChange={setPendingCount} />
          )}
          {effectiveTab === 'submit-return' && !isAdmin && <SubmitReturnView />}
          {effectiveTab === 'maintenance' && <MaintenanceView user={user} />}
          {effectiveTab === 'reports' && <ReportsView user={user} />}
          {effectiveTab === 'users' && isAdmin && <UserManagementView />}
          {effectiveTab === 'report-specs' && <ReportSpecsView />}
        </main>
      </div>
    </div>
  );
}
