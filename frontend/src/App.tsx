import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import Production from './pages/Production';
import BOMManager from './pages/BOMManager';
import ExecutiveDashboard from './pages/ExecutiveDashboard';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ExecutiveDashboard />} />
        {/* We will add Customers, Products, Packs, and Settings routes here */}
        <Route path="customers" element={<Customers />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:productId/bom" element={<BOMManager />} />
        <Route path="packs" element={<div className="p-8">Packs Page Pending</div>} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="production" element={<Production />} />
        <Route path="settings" element={<div className="p-8">Settings Page Pending</div>} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
t App;
