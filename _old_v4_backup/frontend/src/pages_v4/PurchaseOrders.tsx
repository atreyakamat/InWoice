import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { FileText, Plus, CheckCircle } from 'lucide-react';

interface PO {
  id: string;
  poNumber: string;
  supplier: { name: string };
  status: string;
  totalAmount: number;
  createdAt: string;
}

const PurchaseOrders = () => {
  const [pos, setPos] = useState<PO[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    const fetchPOs = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/purchase-orders', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPos(res.data.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchPOs();
  }, [token]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center">
          <FileText className="mr-2" /> Purchase Orders
        </h1>
        <button className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center">
          <Plus size={18} className="mr-1" /> New PO
        </button>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pos.map((po) => (
              <tr key={po.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{po.poNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{po.supplier.name}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${po.status === 'RECEIVED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {po.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${po.totalAmount}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-purple-600 hover:text-purple-900 flex items-center justify-end w-full">
                    <CheckCircle size={16} className="mr-1" /> Receive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseOrders;
