import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Instagram, Calendar, DollarSign, Package, TrendingUp, Clock } from 'lucide-react';
import API_ENDPOINTS, { api } from '../apiConfig';

const CustomerDetail = () => {
    const { email } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [customer, setCustomer] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchCustomerDetails();
    }, [email]);

    const fetchCustomerDetails = async () => {
        try {
            setLoading(true);
            const response = await api.get(API_ENDPOINTS.CUSTOMERS.DETAIL(email));
            setCustomer(response.data.customer);
            setInvoices(response.data.invoices);
        } catch (err) {
            console.error('Error fetching customer:', err);
            setError('Failed to load customer details');
        } finally {
            setLoading(false);
        }
    };

    const getSegmentColor = (segment) => {
        const colors = {
            'VIP': 'bg-purple-100 text-purple-700 border-purple-300',
            'Loyal': 'bg-blue-100 text-blue-700 border-blue-300',
            'Regular': 'bg-green-100 text-green-700 border-green-300',
            'New': 'bg-yellow-100 text-yellow-700 border-yellow-300',
            'At Risk': 'bg-red-100 text-red-700 border-red-300'
        };
        return colors[segment] || 'bg-gray-100 text-gray-700 border-gray-300';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading customer details...</p>
                </div>
            </div>
        );
    }

    if (error || !customer) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600">{error || 'Customer not found'}</p>
                    <button
                        onClick={() => navigate('/customers')}
                        className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                        Back to Customers
                    </button>
                </div>
            </div>
        );
    }

    const metrics = customer.metrics || {};

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-4 md:p-8">
            {/* Header */}
            <div className="mb-6">
                <button
                    onClick={() => navigate('/customers')}
                    className="flex items-center text-gray-600 hover:text-purple-600 mb-4"
                >
                    <ArrowLeft size={20} className="mr-2" />
                    Back to Customers
                </button>
                
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                                {customer.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-800">{customer.name}</h1>
                                <div className="flex items-center space-x-4 mt-2 text-gray-600">
                                    {customer.email && (
                                        <div className="flex items-center">
                                            <Mail size={16} className="mr-1" />
                                            {customer.email}
                                        </div>
                                    )}
                                    {customer.phone && (
                                        <div className="flex items-center">
                                            <Phone size={16} className="mr-1" />
                                            {customer.phone}
                                        </div>
                                    )}
                                    {customer.instagram && (
                                        <div className="flex items-center">
                                            <Instagram size={16} className="mr-1" />
                                            @{customer.instagram}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div>
                            <span className={`px-4 py-2 rounded-full text-sm font-semibold border ${getSegmentColor(customer.segment)}`}>
                                {customer.segment}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-600 text-sm">Total Orders</p>
                            <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalOrders || 0}</p>
                        </div>
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                            <Package size={24} className="text-purple-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-600 text-sm">Total Revenue</p>
                            <p className="text-3xl font-bold text-green-600 mt-1">${metrics.totalRevenue?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                            <DollarSign size={24} className="text-green-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-600 text-sm">Avg Order Value</p>
                            <p className="text-3xl font-bold text-blue-600 mt-1">${metrics.avgOrderValue?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <TrendingUp size={24} className="text-blue-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-600 text-sm">Days Since Last Order</p>
                            <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.daysSinceLastPurchase || 0}</p>
                        </div>
                        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                            <Clock size={24} className="text-yellow-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Additional Info */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-600">Paid Orders</span>
                        <span className="text-green-600 font-semibold">{metrics.paidOrders || 0}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-600">Pending Orders</span>
                        <span className="text-yellow-600 font-semibold">{metrics.pendingOrders || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-600">Pending Revenue</span>
                        <span className="text-yellow-600 font-semibold">${metrics.pendingRevenue?.toFixed(2) || '0.00'}</span>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center mb-2">
                        <Calendar size={16} className="mr-2 text-gray-600" />
                        <span className="text-gray-600">First Purchase</span>
                    </div>
                    <p className="text-xl font-semibold text-gray-800">{metrics.firstPurchase || 'N/A'}</p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center mb-2">
                        <Calendar size={16} className="mr-2 text-gray-600" />
                        <span className="text-gray-600">Last Purchase</span>
                    </div>
                    <p className="text-xl font-semibold text-gray-800">{metrics.lastPurchase || 'N/A'}</p>
                </div>
            </div>

            {/* Invoice History */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Invoice History</h2>
                
                {invoices.length === 0 ? (
                    <p className="text-gray-600 text-center py-8">No invoices found for this customer.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Invoice ID</th>
                                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Date</th>
                                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Amount</th>
                                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Status</th>
                                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Payment Method</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((invoice) => (
                                    <tr key={invoice.invoiceID} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="py-3 px-4">
                                            <button
                                                onClick={() => navigate(`/invoices/${invoice.invoiceID}`)}
                                                className="text-purple-600 hover:underline font-medium"
                                            >
                                                {invoice.invoiceID}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4 text-gray-700">{invoice.date}</td>
                                        <td className="py-3 px-4 text-gray-900 font-semibold">${invoice.grandTotal.toFixed(2)}</td>
                                        <td className="py-3 px-4">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                invoice.paymentStatus === 'Paid' 
                                                    ? 'bg-green-100 text-green-700' 
                                                    : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {invoice.paymentStatus}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-gray-700">{invoice.paymentMethod || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomerDetail;
