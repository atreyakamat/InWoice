import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    ComposedChart, Line, Area, Cell, Legend 
} from 'recharts';
import { PieChart, Pie } from 'recharts';

const Analytics = () => {
    const [topCustomers, setTopCustomers] = useState([]);
    const [revenueByMonth, setRevenueByMonth] = useState([]);
    const [dailyRevenue, setDailyRevenue] = useState([]);
    const [topProducts, setTopProducts] = useState([]);

    const authHeader = { headers: { Authorization: localStorage.getItem('token') } };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await axios.get('http://localhost:5000/api/invoices', authHeader);
                const invoices = res.data;

                const monthly = {};
                const daily = {};
                const customers = {};
                const products = {};

                invoices.forEach(inv => {
                    const date = new Date(inv.date);
                    
                    // Monthly
                    const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    monthly[monthKey] = (monthly[monthKey] || 0) + inv.grandTotal;

                    // Daily (Last 14 days)
                    const dayKey = date.toISOString().split('T')[0];
                    daily[dayKey] = (daily[dayKey] || 0) + inv.grandTotal;

                    // Top customers
                    customers[inv.customerName] = (customers[inv.customerName] || 0) + inv.grandTotal;

                    // Top products
                    try {
                        const items = typeof inv.itemsJSON === 'string' ? JSON.parse(inv.itemsJSON) : inv.itemsJSON;
                        items.forEach(item => {
                            products[item.name] = (products[item.name] || 0) + item.quantity;
                        });
                    } catch(e) {}
                });

                setRevenueByMonth(Object.keys(monthly).map(k => ({ name: k, Revenue: monthly[k] })));
                
                // Sort daily and take last 14
                const sortedDaily = Object.keys(daily)
                    .sort()
                    .slice(-14)
                    .map(k => ({ name: k.split('-').slice(1).join('/'), Revenue: daily[k] }));
                setDailyRevenue(sortedDaily);

                const sortedCustomers = Object.keys(customers)
                    .map(k => ({ name: k, Spent: customers[k] }))
                    .sort((a, b) => b.Spent - a.Spent)
                    .slice(0, 5);
                setTopCustomers(sortedCustomers);

                const sortedProducts = Object.keys(products)
                    .map(k => ({ name: k, Sold: products[k] }))
                    .sort((a, b) => b.Sold - a.Sold)
                    .slice(0, 5);
                setTopProducts(sortedProducts);

            } catch (err) {
                console.error(err);
            }
        };
        fetchData();
    }, []);

    const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];

    return (
        <div className="p-8 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter italic mb-8">Business Intelligence</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Daily Revenue Trend */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Daily Performance (Last 14 Days)</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={dailyRevenue}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Area type="monotone" dataKey="Revenue" fill="#8b5cf6" fillOpacity={0.1} stroke="none" />
                                <Bar dataKey="Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
                                <Line type="monotone" dataKey="Revenue" stroke="#8b5cf6" strokeWidth={2} dot={{r: 3, fill: '#8b5cf6', strokeWidth: 0}} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Monthly Revenue */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Monthly Growth</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueByMonth}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Bar dataKey="Revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Top Products */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Best Selling Products (Quantity)</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={topProducts} 
                                    innerRadius={70} 
                                    outerRadius={100} 
                                    paddingAngle={5} 
                                    dataKey="Sold"
                                    label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {topProducts.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 4. Top Spenders */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Whale Customers (By Spend)</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topCustomers} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} width={100} />
                                <Tooltip cursor={{fill: '#f8fafc'}} />
                                <Bar dataKey="Spent" fill="#10b981" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
