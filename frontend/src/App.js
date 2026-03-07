import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CreateInvoice from './pages/CreateInvoice';
import Invoices from './pages/Invoices';
import Customers from './pages/Customers';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Products from './pages/Products';
import WebInvoiceView from './pages/WebInvoiceView';

const Layout = ({ children }) => {
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/view-invoice');

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans">
      {!isPublic && <Sidebar />}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create-invoice" element={<CreateInvoice />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/products" element={<Products />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/view-invoice/:id" element={<WebInvoiceView />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
