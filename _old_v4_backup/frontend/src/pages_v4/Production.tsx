import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

interface ProductionBatch {
  id: string;
  batchNumber: string;
  status: string;
  createdAt: string;
}

const Production = () => {
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/production', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBatches(res.data.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchBatches();
  }, [token]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Production Batches</h1>
        <button className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">New Batch</button>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Created</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{b.batchNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{b.status}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(b.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">No production batches found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Production;
