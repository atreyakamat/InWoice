import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  reorderLevel: number;
  costPerUnit: number;
  supplier?: { name: string };
}

interface DashboardSummary {
  totalValue: number;
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  mostConsumed: any[];
}

const Inventory = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const { token } = useAuth();

  const api = axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: { Authorization: `Bearer ${token}` }
  });

  useEffect(() => {
    fetchInventory();
    fetchDashboard();
  }, [categoryFilter, showLowStock, searchTerm, token]);

  const fetchInventory = async () => {
    try {
      const params: any = {};
      if (categoryFilter) params.category = categoryFilter;
      if (showLowStock) params.lowStock = 'true';
      if (searchTerm) params.search = searchTerm;
      const res = await api.get('/inventory', { params });
      setItems(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/inventory/dashboard');
      setDashboard(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdjustStock = async (delta: number, notes: string) => {
    if (!selectedItem) return;
    try {
      await api.patch(`/inventory/${selectedItem.id}/adjust`, { delta, notes });
      setIsAdjustModalOpen(false);
      fetchInventory();
      fetchDashboard();
    } catch (err) {
      console.error(err);
      alert('Failed to adjust stock');
    }
  };

  const categories = ['RAW_MATERIAL', 'FINISHED_PRODUCT', 'PACKAGING_MATERIAL', 'CONSUMABLE', 'PROMOTIONAL_MATERIAL', 'EVENT_STOCK'];

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Inventory Management</h1>
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700">Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
            </DialogHeader>
            <AddInventoryForm
              onSubmit={async (data) => {
                try {
                  await api.post('/inventory', data);
                  setIsAddModalOpen(false);
                  fetchInventory();
                  fetchDashboard();
                } catch (err) {
                  alert('Failed to add item');
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Dashboard Cards */}
      {dashboard && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Total Value</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">₹{dashboard.totalValue.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Total Items</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{dashboard.totalItems}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Low Stock</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-orange-600">{dashboard.lowStockCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Out of Stock</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{dashboard.outOfStockCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Search by name or SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border rounded-md px-3 py-2"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <Button
          variant={showLowStock ? 'default' : 'outline'}
          onClick={() => setShowLowStock(!showLowStock)}
        >
          Low Stock Only
        </Button>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Min Stock</TableHead>
              <TableHead>Cost/Unit</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.sku}</TableCell>
                <TableCell><Badge variant="outline">{item.category.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell>
                  <span className={item.currentStock <= item.minimumStock ? 'text-red-600 font-bold' : ''}>
                    {item.currentStock} {item.unit}
                  </span>
                </TableCell>
                <TableCell>{item.minimumStock}</TableCell>
                <TableCell>₹{item.costPerUnit}</TableCell>
                <TableCell>{item.supplier?.name || 'N/A'}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedItem(item);
                      setIsAdjustModalOpen(true);
                    }}
                  >
                    Adjust
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">No inventory items found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Stock Adjustment Modal */}
      <Dialog open={isAdjustModalOpen} onOpenChange={setIsAdjustModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock - {selectedItem?.name}</DialogTitle>
          </DialogHeader>
          <StockAdjustmentForm
            item={selectedItem}
            onSubmit={handleAdjustStock}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Add Inventory Form Component
const AddInventoryForm = ({ onSubmit }: { onSubmit: (data: any) => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'RAW_MATERIAL',
    unit: 'pcs',
    currentStock: 0,
    minimumStock: 10,
    reorderLevel: 20,
    costPerUnit: 0,
    location: '',
    notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input placeholder="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
      <Input placeholder="SKU" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} required />
      <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full border rounded-md px-3 py-2">
        <option value="RAW_MATERIAL">Raw Material</option>
        <option value="FINISHED_PRODUCT">Finished Product</option>
        <option value="PACKAGING_MATERIAL">Packaging Material</option>
        <option value="CONSUMABLE">Consumable</option>
        <option value="PROMOTIONAL_MATERIAL">Promotional Material</option>
        <option value="EVENT_STOCK">Event Stock</option>
      </select>
      <Input type="number" placeholder="Unit" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} required />
      <Input type="number" placeholder="Current Stock" value={formData.currentStock} onChange={(e) => setFormData({ ...formData, currentStock: Number(e.target.value) })} />
      <Input type="number" placeholder="Minimum Stock" value={formData.minimumStock} onChange={(e) => setFormData({ ...formData, minimumStock: Number(e.target.value) })} />
      <Input type="number" placeholder="Reorder Level" value={formData.reorderLevel} onChange={(e) => setFormData({ ...formData, reorderLevel: Number(e.target.value) })} />
      <Input type="number" placeholder="Cost per Unit" value={formData.costPerUnit} onChange={(e) => setFormData({ ...formData, costPerUnit: Number(e.target.value) })} />
      <Input placeholder="Location" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
      <Input placeholder="Notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
      <Button type="submit" className="w-full">Create Item</Button>
    </form>
  );
};

// Stock Adjustment Form Component
const StockAdjustmentForm = ({ item, onSubmit }: { item: InventoryItem | null; onSubmit: (delta: number, notes: string) => void }) => {
  const [delta, setDelta] = useState(0);
  const [notes, setNotes] = useState('');

  if (!item) return null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(delta, notes); }} className="space-y-4">
      <div className="p-4 bg-gray-50 rounded-md">
        <p><strong>Current Stock:</strong> {item.currentStock} {item.unit}</p>
        <p><strong>New Stock:</strong> {item.currentStock + delta} {item.unit}</p>
      </div>
      <Input type="number" placeholder="Adjustment (+/-)" value={delta} onChange={(e) => setDelta(Number(e.target.value))} required />
      <Input placeholder="Notes (reason for adjustment)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" className="w-full">{delta >= 0 ? 'Add Stock' : 'Remove Stock'}</Button>
    </form>
  );
};

export default Inventory;
