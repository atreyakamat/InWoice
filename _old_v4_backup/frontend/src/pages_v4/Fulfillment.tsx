import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Truck, Package, Check } from 'lucide-react';

interface Fulfillment {
  id: string;
  invoice: { invoiceNumber: string, customer: { name: string } };
  status: string;
  courier: string;
  trackingNumber: string;
}

const Fulfillment = () => {
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    const fetchFulfillments = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/fulfillments', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFulfillments(res.data.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchFulfillments();
  }, [token]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center">
          <Truck className="mr-2" /> Fulfillment Dashboard
        </h1>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Courier</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {fulfillments.map((f) => (
              <tr key={f.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{f.invoice.invoiceNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{f.invoice.customer.name}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${f.status === 'SHIPPED' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                    {f.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{f.courier || 'Pending'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button className="text-blue-600 hover:text-blue-900 inline-flex items-center">
                    <Package size={16} className="mr-1" /> Pack
                  </button>
                  <button className="text-green-600 hover:text-green-900 inline-flex items-center">
                    <Check size={16} className="mr-1" /> Ship
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

export default Fulfillment;
