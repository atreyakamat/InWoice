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
    const [aiUsage, setAiUsage] = useState(null);
    const [aiInsight, setAiInsight] = useState('');

    const handleOCRScan = () => {
        // Placeholder for future OCR scan handling.
    };

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const res = await api.get(API_ENDPOINTS.ANALYTICS);
                setData(res);

                // Fetch AI Usage Stats
                api.get(API_ENDPOINTS.AI_USAGE_STATS)
                    .then(r => setAiUsage(r.data))
                    .catch(e => console.error(e));

                // Fetch a quick dashboard insight
                api.post(API_ENDPOINTS.AI_INSIGHTS, { type: 'Weekly Performance', data: res.summary })
                    .then(r => setAiInsight(r.data))
                    .catch(e => console.error(e));

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
                            <ShoppingBag className="mr-2 text-purple-600" size={20} /> Revenue Trend
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

                {/* AI Insights & Business Health */}
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-2xl shadow-sm text-white">
                    <h2 className="text-lg font-bold mb-6 flex items-center">
                        <TrendingUp className="mr-2" size={20} /> AI Insights & Health
                    </h2>
                    <div className="space-y-4">
                        <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20">
                            <div className="text-xs font-semibold uppercase tracking-wider text-purple-200 mb-1">Business Health</div>
                            <div className="text-2xl font-black">92 / 100</div>
                            <div className="text-xs text-purple-100 mt-1">+5 pts from last month</div>
                        </div>
                        <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20 text-sm">
                            <ul className="space-y-2">
                                <li className="flex items-start"><span className="mr-2">💡</span> Packs are driving 30% more revenue than single products.</li>
                                <li className="flex items-start"><span className="mr-2">💡</span> 'Anime Collection' is trending up. Consider new packs.</li>
                                <li className="flex items-start"><span className="mr-2">⚠️</span> 5 customers haven't purchased in 60 days.</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Category Performance */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Top Products</h2>
                    <div className="h-64">
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

                {/* Pack Performance Placeholder */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Top Packs & Collections</h2>
                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p className="text-gray-400 text-sm">Insufficient data to display packs</p>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Recent Activity</h2>
                    <div className="space-y-4">
                        <div className="flex items-center text-sm">
                            <div className="w-2 h-2 rounded-full bg-green-500 mr-3"></div>
                            <span className="text-gray-600 flex-1">Invoice #1042 Paid by Rahul</span>
                            <span className="text-gray-400 text-xs">2h ago</span>
                        </div>
                        <div className="flex items-center text-sm">
                            <div className="w-2 h-2 rounded-full bg-blue-500 mr-3"></div>
                            <span className="text-gray-600 flex-1">New Collection 'Gaming' created</span>
                            <span className="text-gray-400 text-xs">5h ago</span>
                        </div>
                        <div className="flex items-center text-sm">
                            <div className="w-2 h-2 rounded-full bg-purple-500 mr-3"></div>
                            <span className="text-gray-600 flex-1">AI Generated Marketing Post</span>
                            <span className="text-gray-400 text-xs">1d ago</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
