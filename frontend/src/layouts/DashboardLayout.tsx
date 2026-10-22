import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Banknote,
  Boxes,
  History,
  ListChecks,
  type LucideIcon,
  FileSignature,
  Repeat,
  CalendarDays,
  Landmark,
  ReceiptText,
  Wallet,
  Factory,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageOpen,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlatformInfo } from '../lib/platformInfo';
import { date } from '../lib/format';
import type { Area, Role } from '../lib/types';
import { Spinner } from '../components/ui';
import { cn } from '../lib/utils';

interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
  end?: boolean;
  /** Area the user needs read access to (see lib/permissions on the server). */
  area?: Area;
  /** Only these roles see it. */
  roles?: Role[];
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Sales',
    items: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard, end: true, area: 'insights' },
      { name: 'Quotes', path: '/quotes', icon: FileSignature, area: 'sales' },
      { name: 'Invoices', path: '/invoices', icon: FileText, area: 'sales' },
      { name: 'Recurring', path: '/recurring', icon: Repeat, area: 'sales' },
      { name: 'Customers', path: '/customers', icon: Users, area: 'sales' },
      { name: 'Actions', path: '/actions', icon: ListChecks, roles: ['ADMIN'] },
      { name: 'Insights & AI', path: '/executive', icon: Sparkles, area: 'insights' },
    ],
  },
  {
    section: 'Purchases',
    items: [
      { name: 'Bills', path: '/bills', icon: ReceiptText, area: 'payables' },
      { name: 'Expenses', path: '/expenses', icon: Wallet, area: 'payables' },
      { name: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCart, area: 'procurement' },
      { name: 'Suppliers', path: '/suppliers', icon: Boxes, area: 'procurement' },
    ],
  },
  {
    section: 'Accounts',
    items: [
      { name: 'Profit & Cash', path: '/accounts', icon: Landmark, area: 'accounts' },
      { name: 'Bank', path: '/bank', icon: Banknote, area: 'payables' },
      { name: 'GST Reports', path: '/reports', icon: FileSpreadsheet, area: 'accounts' },
      { name: 'Activity log', path: '/activity', icon: History, roles: ['ADMIN', 'ACCOUNTANT'] },
    ],
  },
  {
    section: 'Catalog',
    items: [
      { name: 'Products', path: '/products', icon: Package, area: 'catalog' },
      { name: 'Packs', path: '/packs', icon: PackageOpen, area: 'catalog' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { name: 'Fulfillment', path: '/fulfillment', icon: Truck, area: 'inventory' },
      { name: 'Inventory', path: '/inventory', icon: Warehouse, area: 'inventory' },
      { name: 'Production', path: '/production', icon: Factory, area: 'inventory' },
      { name: 'Events', path: '/events', icon: CalendarDays, area: 'inventory' },
    ],
  },
];

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', STAFF: 'Staff', SALES: 'Sales', STORES: 'Stores', ACCOUNTANT: 'Accountant' };

export default function DashboardLayout() {
  const { user, settings, logout, can } = useAuth();
  const visible = NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.area || can(i.area)) && (!i.roles || (user && i.roles.includes(user.role)))) })).filter(
    (g) => g.items.length,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">In</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">{settings?.businessName ?? 'InWoice'}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">InWoice</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {visible.map((group) => (
          <div key={group.section}>
            <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.section}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
              >
                <item.icon size={17} />
                {item.name}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')
          }
        >
          <Settings size={17} /> Settings
        </NavLink>
        <div className="mt-2 flex items-center justify-between px-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-800">{user?.name}</div>
            <div className="truncate text-xs text-slate-500">{user ? ROLE_LABEL[user.role] : ''}</div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button className="absolute right-2 top-3 rounded p-1 text-slate-500" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span className="font-semibold">{settings?.businessName ?? 'InWoice'}</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <AccountBanner />
            <Suspense fallback={<Spinner />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Multi-business mode: read-only, suspended or trial-ending notice for this business. */
function AccountBanner() {
  const info = usePlatformInfo();
  const [now] = useState(() => Date.now());
  const t = info?.tenant;
  if (!t) return null;
  if (t.state !== 'ok') {
    return <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{t.message}</div>;
  }
  const daysLeft = t.plan === 'TRIAL' && t.trialEndsAt ? Math.ceil((new Date(t.trialEndsAt).getTime() - now) / 86_400_000) : null;
  if (daysLeft === null || daysLeft > 7) return null;
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Your free trial ends on {date(t.trialEndsAt)} ({daysLeft} day{daysLeft === 1 ? '' : 's'} left).{' '}
      {info?.supportEmail ? (
        <>
          To keep using {info.platformName}, write to <a className="underline" href={`mailto:${info.supportEmail}`}>{info.supportEmail}</a>.
        </>
      ) : (
        'Choose a plan to keep using it.'
      )}
    </div>
  );
}
