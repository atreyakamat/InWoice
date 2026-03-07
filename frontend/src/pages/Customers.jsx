import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Customers = () => {
    const [customers, setCustomers] = useState([]);

    useEffect(() => {
        const fetchCustomers = async () => {
            try {
                const res = await axios.get('http://localhost:5000/api/data/customers');
                setCustomers(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchCustomers();
    }, []);

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Customers</h1>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Name</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Email</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Phone</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Instagram</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Total Spent</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Last Purchase</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {customers.map((cust, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{cust.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{cust.email}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{cust.phone || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-purple-600">{cust.instagram ? `@${cust.instagram}` : '-'}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-800">${cust.totalPurchases.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{cust.lastPurchaseDate}</td>
                                </tr>
                            ))}
                            {customers.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">No customers found. Create an invoice to add one.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Customers;
