import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Analytics = () => {
    const [topCustomers, setTopCustomers] = useState([]);
    const [revenueByMonth, setRevenueByMonth] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await axios.get('http://localhost:5000/api/invoices');
                const invoices = res.data;

                // Revenue by month
                const monthly = {};
                // Top customers
                const customers = {};

                invoices.forEach(inv => {
                    const month = new Date(inv.date).toLocaleString('default', { month: 'short', year: 'numeric' });
                    monthly[month] = (monthly[month] || 0) + inv.grandTotal;

                    customers[inv.customerName] = (customers[inv.customerName] || 0) + inv.grandTotal;
                });

                setRevenueByMonth(Object.keys(monthly).map(k => ({ name: k, Revenue: monthly[k] })));
                
                const sortedCustomers = Object.keys(customers)
                    .map(k => ({ name: k, Spent: customers[k] }))
                    .sort((a, b) => b.Spent - a.Spent)
                    .slice(0, 5);
                setTopCustomers(sortedCustomers);

            } catch (err) {
                console.error(err);
            }
        };
        fetchData();
    }, []);

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Analytics</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold mb-6">Revenue by Month</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueByMonth}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip cursor={{fill: 'transparent'}} />
                                <Bar dataKey="Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold mb-6">Top Customers</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topCustomers} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" axisLine={false} tickLine={false} />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} />
                                <Tooltip cursor={{fill: 'transparent'}} />
                                <Bar dataKey="Spent" fill="#ec4899" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
