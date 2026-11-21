import {
  BookOpen,
  ClipboardCheck,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Package,
  QrCode,
  Send,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { UserPublic } from '../shared/types';

export type NavTab =
  | 'overview'
  | 'catalog'
  | 'qr-lookup'
  | 'issued-kits'
  | 'submit-return'
  | 'maintenance'
  | 'reports'
  | 'users'
  | 'report-specs';

interface SidebarProps {
  user: UserPublic;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onLogout: () => void;
  pendingCount?: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  user,
  activeTab,
  onSelectTab,
  onLogout,
  pendingCount = 0,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const isAdmin = user.role === 'ADMIN';

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: typeof LayoutDashboard;
    visible: boolean;
    badge?: number;
  }> = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: 'catalog',
      label: 'Equipment Catalog',
      icon: Package,
      visible: isAdmin || user.permissions.canViewInventory,
    },
    {
      id: 'qr-lookup',
      label: 'QR & Asset Lookup',
      icon: QrCode,
      visible: isAdmin || user.permissions.canViewInventory,
    },
    {
      id: 'issued-kits',
      label: 'Issued Kits & Verify',
      icon: ClipboardCheck,
      visible: isAdmin,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      id: 'submit-return',
      label: 'Submit Kit Return',
      icon: Send,
      visible: !isAdmin && user.permissions.canSubmitKitReturn,
    },
    {
      id: 'maintenance',
      label: 'Maintenance & Cal.',
      icon: Wrench,
      visible: isAdmin || user.permissions.canViewMaintenance || user.permissions.canReportFault,
    },
    {
      id: 'reports',
      label: 'Reports & Alerts',
      icon: FileBarChart2,
      visible: isAdmin || user.permissions.canViewReports,
    },
    {
      id: 'users',
      label: 'User & Permissions',
      icon: Users,
      visible: isAdmin,
    },
    {
      id: 'report-specs',
      label: 'Report & SE Specs',
      icon: BookOpen,
      visible: true,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 font-display truncate whitespace-nowrap">
            LET · UEM Kolkata
          </p>
          <p className="text-xs text-slate-500 truncate">Dept. of CSE (IoT)</p>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation drawer"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-blue-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span
                    className={`font-mono tabular-nums text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                      active ? 'bg-blue-800 text-white' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
          <p className="text-xs text-slate-600 mt-0.5 truncate">
            {isAdmin ? 'Administrator' : 'Student (View-Only)'} ·{' '}
            <span className="font-mono">{user.username}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{sidebarContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 h-full">{sidebarContent}</aside>
        </div>
      )}
    </>
  );
}
