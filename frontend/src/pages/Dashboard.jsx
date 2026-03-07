import React, { useState, useEffect } from 'react';
import axios from 'axios';
import StatsCards from '../components/StatsCards';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const Dashboard = () => {
    const [stats, setStats] = useState({ revenue: 0, invoices: 0, orders: 0, pending: 0 });
    const [salesData, setSalesData] = useState([]);
    const [pieData, setPieData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await axios.get('http://localhost:5000/api/invoices');
                const invoices = res.data;
                
                let revenue = 0;
                let pending = 0;
                const monthlySales = {};
                const methods = {};

                invoices.forEach(inv => {
                    revenue += inv.grandTotal;
                    if (inv.paymentStatus === 'Pending') pending++;

                    // For line chart
                    const month = new Date(inv.date).toLocaleString('default', { month: 'short' });
                    monthlySales[month] = (monthlySales[month] || 0) + inv.grandTotal;

                    // For pie chart
                    methods[inv.paymentMethod] = (methods[inv.paymentMethod] || 0) + 1;
                });

                setStats({
                    revenue,
                    invoices: invoices.length,
                    orders: invoices.length,
                    pending
                });

                setSalesData(Object.keys(monthlySales).map(k => ({ name: k, total: monthlySales[k] })));
                
                const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981'];
                setPieData(Object.keys(methods).map((k, i) => ({ name: k, value: methods[k], color: COLORS[i % COLORS.length] })));

            } catch (err) {
                console.error(err);
            }
        };
        fetchData();
    }, []);

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Overview</h1>
            <StatsCards stats={stats} />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold mb-6">Sales Over Time</h2>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip />
                                <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold mb-6">Payment Methods</h2>
                    <div className="h-64 flex justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-col justify-center ml-4 space-y-2">
                            {pieData.map((entry, index) => (
                                <div key={index} className="flex items-center text-sm">
                                    <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: entry.color }}></span>
                                    {entry.name} ({entry.value})
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
