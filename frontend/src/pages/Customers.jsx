import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Mail, Instagram, Phone, DollarSign, Download } from 'lucide-react';
import API_ENDPOINTS, { api } from '../apiConfig';
import { toast } from 'react-toastify';

const Customers = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('spent'); // 'spent' or 'name' or 'date'
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const res = await api.get(API_ENDPOINTS.DATA_CUSTOMERS);
            setCustomers(res || []);
        } catch (err) {
            console.error('Error fetching customers:', err);
            toast.error('Failed to load customers');
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        try {
            toast.info('Preparing CSV export...');
            const response = await fetch(API_ENDPOINTS.EXPORT.CUSTOMERS, {
                headers: {
                    'Authorization': localStorage.getItem('token')
                }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `customers-${Date.now()}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast.success('Customers exported successfully!');
            } else {
                toast.error('Failed to export customers');
            }
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Export failed');
        }
    };

    const filteredCustomers = customers
        .filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.instagram && c.instagram.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .sort((a, b) => {
            if (sortBy === 'spent') return b.totalPurchases - a.totalPurchases;
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'date') return new Date(b.lastPurchaseDate) - new Date(a.lastPurchaseDate);
            return 0;
        });

    return (
        <div className="p-8 bg-gray-50 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter italic">Customer CRM</h1>
                    <p className="text-sm text-gray-500 font-medium">Manage relationships and track customer value</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search customers..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 transition-all font-medium"
                        />
                    </div>
                    <select 
                        value={sortBy} 
                        onChange={(e) => setSortBy(e.target.value)}
                        className="bg-white border border-gray-200 rounded-xl px-4 py-2 outline-none font-bold text-xs uppercase tracking-widest text-gray-500"
                    >
                        <option value="spent">Top Spenders</option>
                        <option value="name">Alphabetical</option>
                        <option value="date">Recent Activity</option>
                    </select>
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl hover:bg-purple-700 transition-colors font-semibold"
                    >
                        <Download size={18} />
                        Export CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                </div>
            ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-gray-600">No customers found</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredCustomers.map((cust, idx) => (
                        <div 
                            key={idx} 
                            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row items-start lg:items-center justify-between hover:shadow-md transition-shadow group cursor-pointer"
                            onClick={() => navigate(`/customers/${encodeURIComponent(cust.email)}`)}
                        >
                            <div className="flex items-center mb-4 lg:mb-0">
                                <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 mr-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                    <User size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800">{cust.name}</h3>
                                    <div className="flex items-center text-sm text-gray-500 mt-1">
                                        <Mail size={14} className="mr-1" /> {cust.email}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 w-full lg:w-auto">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Spent</span>
                                    <span className="text-sm font-black text-purple-600 flex items-center">
                                        <DollarSign size={14} /> {cust.totalPurchases.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Social</span>
                                    <span className="text-sm font-bold text-gray-700 flex items-center">
                                        <Instagram size={14} className="mr-1 text-pink-500" /> {cust.instagram ? `@${cust.instagram}` : 'N/A'}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Contact</span>
                                    <span className="text-sm font-bold text-gray-700 flex items-center">
                                        <Phone size={14} className="mr-1 text-blue-500" /> {cust.phone || 'N/A'}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Last Order</span>
                                    <span className="text-sm font-bold text-gray-700">{cust.lastPurchaseDate}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Last Order</span>
                                <span className="text-sm font-bold text-gray-700">{cust.lastPurchaseDate}</span>
                            </div>
                        </div>
                    </div>
                ))}

                {filteredCustomers.length === 0 && (
                    <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-200 text-center">
                        <p className="text-gray-400 font-medium">No customers found matching your search.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Customers;
