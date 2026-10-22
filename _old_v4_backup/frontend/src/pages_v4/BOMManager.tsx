import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
}

interface BOMItem {
  inventoryItemId: string;
  quantityRequired: number;
}

const BOMManager = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  
  const [product, setProduct] = useState<any>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [bomItems, setBomItems] = useState<BOMItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [prodRes, invRes, bomRes] = await Promise.all([
          axios.get(`http://localhost:5000/api/products/${productId}`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`http://localhost:5000/api/inventory`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`http://localhost:5000/api/bom/${productId}`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        setProduct(prodRes.data.data);
        setInventory(invRes.data.data);
        if (bomRes.data.data) {
          setBomItems(bomRes.data.data.items.map((i: any) => ({
            inventoryItemId: i.inventoryItemId,
            quantityRequired: i.quantityRequired
          })));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [productId, token]);

  const addItem = () => {
    setBomItems([...bomItems, { inventoryItemId: '', quantityRequired: 1 }]);
  };

  const removeItem = (index: number) => {
    setBomItems(bomItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof BOMItem, value: any) => {
    const newItems = [...bomItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setBomItems(newItems);
  };

  const handleSave = async () => {
    try {
      await axios.put(`http://localhost:5000/api/bom/${productId}`, { items: bomItems }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('BOM updated successfully!');
      navigate('/products');
    } catch (err) {
      alert('Failed to update BOM');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading BOM...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button onClick={() => navigate('/products')} className="flex items-center text-gray-600 hover:text-purple-600 mb-6">
        <ArrowLeft size={20} className="mr-2" /> Back to Products
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Bill of Materials: {product?.name}</h1>
        <p className="text-gray-500 mb-8 text-sm uppercase tracking-wider font-semibold">Define material consumption per unit</p>

        <div className="space-y-4">
          {bomItems.map((item, index) => (
            <div key={index} className="flex items-end space-x-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Inventory Item</label>
                <select 
                  className="w-full p-2 border rounded-lg outline-none focus:border-purple-500"
                  value={item.inventoryItemId}
                  onChange={(e) => updateItem(index, 'inventoryItemId', e.target.value)}
                >
                  <option value="">Select Material</option>
                  {inventory.map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Qty Required</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="w-full p-2 border rounded-lg outline-none focus:border-purple-500"
                  value={item.quantityRequired}
                  onChange={(e) => updateItem(index, 'quantityRequired', parseFloat(e.target.value))}
                />
              </div>
              <button onClick={() => removeItem(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                <Trash2 size={20} />
              </button>
            </div>
          ))}

          {bomItems.length === 0 && (
            <p className="text-center text-gray-400 py-8 italic border border-dashed rounded-lg">No materials assigned. Click 'Add Item' to start.</p>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t">
            <button 
              onClick={addItem}
              className="flex items-center space-x-2 text-purple-600 font-bold hover:text-purple-700"
            >
              <Plus size={20} /> <span>Add Item</span>
            </button>
            <button 
              onClick={handleSave}
              className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 shadow-md transition"
            >
              <Save size={20} /> <span>Save BOM</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BOMManager;
