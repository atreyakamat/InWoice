import React, { useState, useEffect } from 'react';
import axios from 'axios';
import StatsCards from '../components/StatsCards';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar 
} from 'recharts';
import { Users, TrendingUp, ShoppingBag, CreditCard } from 'lucide-react';

const Dashboard = () => {
    const [stats, setStats] = useState({ 
        revenue: 0, 
        invoices: 0, 
        orders: 0, 
        pending: 0,
        avgOrderValue: 0,
        totalCustomers: 0,
        newCustomersThisMonth: 0
    });
    const [salesData, setSalesData] = useState([]);
    const [categoryData, setCategoryData] = useState([]);
    const [methodData, setMethodData] = useState([]);
    const [customerGrowthData, setCustomerGrowthData] = useState([]);

    const authHeader = { headers: { Authorization: localStorage.getItem('token') } };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [invRes, custRes] = await Promise.all([
                    axios.get('http://localhost:5000/api/invoices', authHeader),
                    axios.get('http://localhost:5000/api/data/customers', authHeader)
                ]);
                
                const invoices = invRes.data;
                const customers = custRes.data;
                
                let revenue = 0;
                let pending = 0;
                const monthlySales = {};
                const methods = {};
                const categories = {};
                const customerGrowth = {};

                invoices.forEach(inv => {
                    revenue += inv.grandTotal;
                    if (inv.paymentStatus === 'Pending') pending++;

                    // Monthly Sales
                    const date = new Date(inv.date);
                    const month = date.toLocaleString('default', { month: 'short' });
                    monthlySales[month] = (monthlySales[month] || 0) + inv.grandTotal;

                    // Payment Methods
                    methods[inv.paymentMethod] = (methods[inv.paymentMethod] || 0) + 1;

                    // Category Performance (from itemsJSON)
                    try {
                        const items = typeof inv.itemsJSON === 'string' ? JSON.parse(inv.itemsJSON) : inv.itemsJSON;
                        items.forEach(item => {
                            const cat = item.variant || 'General';
                            categories[cat] = (categories[cat] || 0) + item.total;
                        });
                    } catch(e) {}
                });

                // Customer Growth
                customers.forEach(cust => {
                    const date = new Date(cust.lastPurchaseDate); // Simplified for this example
                    const month = date.toLocaleString('default', { month: 'short' });
                    customerGrowth[month] = (customerGrowth[month] || 0) + 1;
                });

                setStats({
                    revenue,
                    invoices: invoices.length,
                    orders: invoices.length,
                    pending,
                    avgOrderValue: invoices.length ? (revenue / invoices.length) : 0,
                    totalCustomers: customers.length,
                    newCustomersThisMonth: customers.filter(c => {
                        const d = new Date(c.lastPurchaseDate);
                        return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
                    }).length
                });

                setSalesData(Object.keys(monthlySales).map(k => ({ name: k, total: monthlySales[k] })));
                setCategoryData(Object.keys(categories).map(k => ({ name: k, value: categories[k] })));
                setCustomerGrowthData(Object.keys(customerGrowth).map(k => ({ name: k, count: customerGrowth[k] })));
                
                const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];
                setMethodData(Object.keys(methods).map((k, i) => ({ name: k, value: methods[k], color: COLORS[i % COLORS.length] })));

            } catch (err) {
                console.error(err);
            }
        };
        fetchData();
    }, []);

    const extendedStats = [
        ...StatsCards({ stats }).props.children.props.children, // Reusing logic but adding more
    ];

    return (
        <div className="p-8 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter italic">CRM Dashboard</h1>
                    <p className="text-sm text-gray-500 font-medium">Real-time business insights & customer analytics</p>
                </div>
                <div className="flex space-x-3">
                    <div className="bg-white px-4 py-2 rounded-lg border border-gray-100 shadow-sm flex items-center">
                        <Users className="text-purple-500 mr-2" size={18} />
                        <span className="text-sm font-bold">{stats.totalCustomers} Customers</span>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-lg border border-gray-100 shadow-sm flex items-center">
                        <TrendingUp className="text-green-500 mr-2" size={18} />
                        <span className="text-sm font-bold">${stats.avgOrderValue.toFixed(2)} AOV</span>
                    </div>
                </div>
            </div>

            <StatsCards stats={stats} />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                {/* Main Sales Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center">
                            <ShoppingBag className="mr-2 text-purple-600" size={20} /> Sales Trend
                        </h2>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Revenue by Month</span>
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={salesData}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Performance */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Product Categories</h2>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categoryData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} width={80} />
                                <Tooltip cursor={{fill: 'transparent'}} />
                                <Bar dataKey="value" fill="#ec4899" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Customer Growth */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Customer Acquisition</h2>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={customerGrowthData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                                <Tooltip />
                                <Line type="stepAfter" dataKey="count" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981', strokeWidth: 0}} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Payment Methods */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Payment Distribution</h2>
                    <div className="h-64 flex">
                        <ResponsiveContainer width="60%" height="100%">
                            <PieChart>
                                <Pie data={methodData} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                                    {methodData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="w-[40%] flex flex-col justify-center space-y-3">
                            {methodData.map((entry, index) => (
                                <div key={index} className="flex items-center justify-between group">
                                    <div className="flex items-center">
                                        <div className="w-2 h-2 rounded-full mr-3" style={{ backgroundColor: entry.color }}></div>
                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{entry.name}</span>
                                    </div>
                                    <span className="text-sm font-black text-gray-800">{entry.value}</span>
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
