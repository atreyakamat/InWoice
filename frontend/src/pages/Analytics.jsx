import { api, API_ENDPOINTS } from '../apiConfig';

const Analytics = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [aiInsights, setAiInsights] = useState([]);
    const [aiLoading, setAiLoading] = useState(false);

    const fetchAiInsights = async (summary, trends) => {
        setAiLoading(true);
        try {
            const res = await api.post(API_ENDPOINTS.AI_INSIGHTS, { summary, trends });
            setAiInsights(res.insights || []);
        } catch (err) {
            console.error(err);
        } finally {
            setAiLoading(false);
        }
    };

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await api.get(API_ENDPOINTS.ANALYTICS);
                setData(res);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, []);

    if (loading) return <div className="p-8 text-center text-gray-500">Loading Intelligence...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Failed to load analytics.</div>;

    const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];
    const { summary, trends, distributions, settings } = data;
    const currency = settings.defaultCurrency || '$';

    return (
        <div className="p-8 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter italic">Business Intelligence</h1>
                    <p className="text-gray-500 text-sm">Real-time data from {summary.totalInvoices} invoices</p>
                </div>
                <div className="text-right">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Revenue</div>
                    <div className="text-3xl font-black text-purple-600 tracking-tighter">{currency}{summary.totalRevenue.toLocaleString()}</div>
                </div>
            </div>

            {/* Top Row Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Growth (MoM)</p>
                    <h3 className={`text-2xl font-black ${summary.momGrowth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {summary.momGrowth >= 0 ? '+' : ''}{summary.momGrowth.toFixed(1)}%
                    </h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Avg Order Value</p>
                    <h3 className="text-2xl font-black text-gray-800">{currency}{summary.avgOrderValue.toFixed(0)}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Items Sold</p>
                    <h3 className="text-2xl font-black text-blue-500">{summary.totalItemsSold}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">This Month</p>
                    <h3 className="text-2xl font-black text-purple-600">{currency}{summary.revenueThisMonth.toLocaleString()}</h3>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Daily Revenue Trend */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Revenue Trend (Last 30 Days)</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={trends.daily}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Area type="monotone" dataKey="revenue" fill="#8b5cf6" fillOpacity={0.1} stroke="none" />
                                <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
                                <Line type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} dot={{r: 3, fill: '#8b5cf6', strokeWidth: 0}} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Monthly Revenue */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Monthly Growth</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trends.monthly}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Top Products */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Top Products (By Revenue)</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={distributions.products} 
                                    innerRadius={70} 
                                    outerRadius={100} 
                                    paddingAngle={5} 
                                    dataKey="revenue"
                                    nameKey="name"
                                    label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {distributions.products.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `${currency}${value}`} />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 4. Top Spenders */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Top Customers (Total Spend)</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={distributions.customers} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} width={100} />
                                <Tooltip cursor={{fill: '#f8fafc'}} formatter={(value) => `${currency}${value}`} />
                                <Bar dataKey="spent" fill="#10b981" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* AI Insights Section */}
            <div className="mt-8 bg-gradient-to-br from-purple-600 to-indigo-700 p-8 rounded-2xl shadow-lg text-white">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-bold flex items-center">
                            <span className="mr-2">✨</span> AI Business Analyst Insights
                        </h2>
                        <p className="text-purple-100 text-sm">Smart recommendations based on your business data</p>
                    </div>
                    <button 
                        onClick={() => fetchAiInsights(summary, trends)}
                        disabled={aiLoading}
                        className="px-4 py-2 bg-white text-purple-600 rounded-lg font-bold hover:bg-purple-50 transition disabled:opacity-50"
                    >
                        {aiLoading ? 'Analyzing...' : 'Generate New Insights'}
                    </button>
                </div>

                {aiInsights.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {aiInsights.map((insight, i) => (
                            <div key={i} className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
                                <p className="text-sm leading-relaxed">{insight}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 bg-black/10 rounded-xl border border-white/5">
                        <p className="text-purple-100 italic">Click the button above to have AI analyze your business performance.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Analytics;
