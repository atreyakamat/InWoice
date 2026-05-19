import React, { useState, useEffect } from 'react';
import StatsCards from '../components/StatsCards';
import OCRScanner from '../components/OCRScanner';
import { 
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar 
} from 'recharts';
import { Users, TrendingUp, ShoppingBag } from 'lucide-react';
import { api, API_ENDPOINTS } from '../apiConfig';

const Dashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const handleOCRScan = () => {
        // Placeholder for future OCR scan handling.
    };

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const res = await api.get(API_ENDPOINTS.ANALYTICS);
                setData(res);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, []);

    if (loading) return <div className="p-8 text-center text-gray-500">Loading Dashboard...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Failed to load dashboard.</div>;

    const { summary, trends, distributions, settings } = data;
    const currency = settings.defaultCurrency || '$';

    const stats = {
        revenue: summary.totalRevenue,
        invoices: summary.totalInvoices,
        orders: summary.totalInvoices,
        pending: distributions.paymentStatuses.Pending || 0,
        avgOrderValue: summary.avgOrderValue,
        totalCustomers: distributions.customers.length,
        newCustomersThisMonth: 0 // Could be added to backend later
    };

    const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];
    const methodData = Object.keys(distributions.paymentMethods).map((k, i) => ({
        name: k,
        value: distributions.paymentMethods[k],
        color: COLORS[i % COLORS.length]
    }));

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
                        <span className="text-sm font-bold">{currency}{stats.avgOrderValue.toFixed(0)} AOV</span>
                    </div>
                </div>
            </div>

            <StatsCards stats={stats} />
            
            <div className="mt-8">
                <OCRScanner onScanComplete={handleOCRScan} />
            </div>
            
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
                            <AreaChart data={trends.monthly}>
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
                                <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Performance */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Top Products</h2>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={distributions.products} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} width={80} />
                                <Tooltip cursor={{fill: 'transparent'}} />
                                <Bar dataKey="revenue" fill="#ec4899" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Payment Methods */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-3">
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
                                    <span className="text-sm font-black text-gray-800">{entry.value} Invoices</span>
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
