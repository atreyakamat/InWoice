import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/toast';
import { Spinner } from './components/ui';
import { get } from './lib/api';
import { useLoad } from './lib/useLoad';
import { PlatformInfoContext, type PlatformInfo } from './lib/platformInfo';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';

// Pages load on demand so the first paint stays small on slow devices.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Executive = lazy(() => import('./pages/Executive'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceEditor = lazy(() => import('./pages/InvoiceEditor'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const Products = lazy(() => import('./pages/Products'));
const BomEditor = lazy(() => import('./pages/BomEditor'));
const Packs = lazy(() => import('./pages/Packs'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const Production = lazy(() => import('./pages/Production'));
const Fulfillment = lazy(() => import('./pages/Fulfillment'));
const Events = lazy(() => import('./pages/Events'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Reports = lazy(() => import('./pages/Reports'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Bills = lazy(() => import('./pages/Bills'));
const BillEditor = lazy(() => import('./pages/BillEditor'));
const BillDetail = lazy(() => import('./pages/BillDetail'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Quotes = lazy(() => import('./pages/Quotes'));
const QuoteEditor = lazy(() => import('./pages/QuoteEditor'));
const QuoteDetail = lazy(() => import('./pages/QuoteDetail'));
const Recurring = lazy(() => import('./pages/Recurring'));
const RecurringEditor = lazy(() => import('./pages/RecurringEditor'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Portal = lazy(() => import('./pages/Portal'));
const Pos = lazy(() => import('./pages/Pos'));
const PosReceipt = lazy(() => import('./pages/PosReceipt'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const Bank = lazy(() => import('./pages/Bank'));
const Actions = lazy(() => import('./pages/Actions'));
const PlatformSite = lazy(() => import('./pages/platform/PlatformSite'));

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Starting InWoice…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Pages reachable without signing in (lazy-loaded, so they need their own Suspense). */
function Public({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<Public><ForgotPassword /></Public>} />
      <Route path="/reset-password" element={<Public><ResetPassword /></Public>} />
      <Route path="/portal/:token" element={<Public><Portal /></Public>} />
      <Route path="/pos/receipt/:id" element={<Protected><PosReceipt /></Protected>} />
      <Route
        path="/"
        element={
          <Protected>
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="executive" element={<Executive />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/new" element={<InvoiceEditor />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="invoices/:id/edit" element={<InvoiceEditor />} />
        <Route path="reports" element={<Reports />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="bills" element={<Bills />} />
        <Route path="bills/new" element={<BillEditor />} />
        <Route path="bills/:id" element={<BillDetail />} />
        <Route path="bills/:id/edit" element={<BillEditor />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="bank" element={<Bank />} />
        <Route path="actions" element={<Actions />} />
        <Route path="pos" element={<Pos />} />
        <Route path="quotes" element={<Quotes />} />
        <Route path="quotes/new" element={<QuoteEditor />} />
        <Route path="quotes/:id" element={<QuoteDetail />} />
        <Route path="quotes/:id/edit" element={<QuoteEditor />} />
        <Route path="recurring" element={<Recurring />} />
        <Route path="recurring/new" element={<RecurringEditor />} />
        <Route path="recurring/:id/edit" element={<RecurringEditor />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:productId/bom" element={<BomEditor />} />
        <Route path="packs" element={<Packs />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="purchase-orders" element={<PurchaseOrders />} />
        <Route path="production" element={<Production />} />
        <Route path="fulfillment" element={<Fulfillment />} />
        <Route path="events" element={<Events />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** Shown on an address that isn't a business (multi-business mode). */
function NoBusiness({ info }: { info: PlatformInfo }) {
  const home = info.baseDomain ? `${window.location.protocol}//${info.baseDomain}${window.location.port ? `:${window.location.port}` : ''}` : '/';
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
        <p className="font-medium text-slate-900">There is no business at this address</p>
        <p className="mt-1">Check the address, or go to {info.platformName} to create one.</p>
        <a href={home} className="mt-3 inline-block font-medium text-brand-600 hover:underline">
          Go to {info.platformName}
        </a>
      </div>
    </div>
  );
}

export default function App() {
  // In multi-business mode the same app serves the platform site and every business.
  const info = useLoad(() => get<PlatformInfo>('/platform/info').catch(() => null));
  if (info.loading && !info.data) return <Spinner label="Starting InWoice…" />;
  const p = info.data;

  if (p?.multiTenant && p.root) {
    return (
      <ToastProvider>
        <BrowserRouter>
          <Public>
            <PlatformSite info={p} />
          </Public>
        </BrowserRouter>
      </ToastProvider>
    );
  }
  if (p?.notFound) return <NoBusiness info={p} />;

  return (
    <PlatformInfoContext.Provider value={p?.multiTenant ? p : null}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </PlatformInfoContext.Provider>
  );
}
