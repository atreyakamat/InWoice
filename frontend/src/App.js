import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CreateInvoice from './pages/CreateInvoice';
import Invoices from './pages/Invoices';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Products from './pages/Products';
import WebInvoiceView from './pages/WebInvoiceView';
import Login from './pages/Login';
import { isAuthenticated } from './apiConfig';

const ProtectedRoute = ({ children }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return children;
};

const Layout = ({ children }) => {
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/view-invoice');
  const isLogin = location.pathname === '/login';

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans">
      {!isPublic && !isLogin && <Sidebar />}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
      {/* Toast notifications container */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </div>
  );
};

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/view-invoice/:id" element={<WebInvoiceView />} />
          
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/create-invoice" element={<ProtectedRoute><CreateInvoice /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
          <Route path="/customers/:email" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
