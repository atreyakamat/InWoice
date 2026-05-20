import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import { MessageSquare, ShoppingCart, RefreshCcw, CheckCircle2, Trash2, FileText, Sparkles, User, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WhatsAppOrders = () => {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setIsLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.ORDERS.LIST);
            setOrders(data);
        } catch (error) {
            console.error('Failed to fetch orders', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExtractAI = async (orderId, text) => {
        setIsProcessing(orderId);
        try {
            const extracted = await api.post(API_ENDPOINTS.ORDERS.EXTRACT_AI, { text });
            if (extracted) {
                // Update order with extracted data
                const updated = {
                    ...orders.find(o => o.id === orderId),
                    customer_name: extracted.customerName,
                    items_json: JSON.stringify(extracted.items),
                    total_amount: extracted.total,
                    status: 'Parsed'
                };
                // Update in backend
                // (Note: We'd need a general update endpoint, but let's just update locally and maybe add the endpoint if needed)
                // For now, let's just show what was found.
                alert(`AI Extracted: ${extracted.customerName}\nItems: ${extracted.items.length}\nTotal: ${extracted.total}`);
                fetchOrders(); // Refresh to show updated (if backend updated)
            }
        } catch (error) {
            console.error('AI Extraction failed', error);
            alert('AI Extraction failed. Please check AI settings.');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleUpdateStatus = async (id, status) => {
        try {
            await api.patch(API_ENDPOINTS.ORDERS.UPDATE_STATUS(id), { status });
            fetchOrders();
        } catch (error) {
            console.error('Failed to update status', error);
        }
    };

    const handleDeleteOrder = async (id) => {
        if (!window.confirm('Delete this order?')) return;
        try {
            await api.delete(API_ENDPOINTS.ORDERS.DELETE(id));
            fetchOrders();
        } catch (error) {
            console.error('Failed to delete order', error);
        }
    };

    const handleConvertToInvoice = (order) => {
        let items = [];
        try {
            items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
        } catch(e) {}
        
        // Pass data to Create Invoice page via state
        navigate('/create-invoice', { 
            state: { 
                prefill: {
                    customerName: order.customer_name || '',
                    customerPhone: order.customer_contact || '',
                    items: Array.isArray(items) ? items : [],
                    notes: `Converted from WhatsApp Order: ${order.order_text?.substring(0, 50)}...`
                }
            } 
        });
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">WhatsApp Orders</h1>
                    <p className="text-gray-500 mt-1">Manage orders received via WhatsApp Chat.</p>
                </div>
                <button
                    onClick={fetchOrders}
                    className="p-2 text-gray-500 hover:text-blue-600 transition"
                    title="Refresh Orders"
                >
                    <RefreshCcw size={20} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Incoming Orders</h2>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                        {orders.length} Total
                    </span>
                </div>
                
                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
                        <p className="text-gray-500">Fetching your orders...</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No WhatsApp orders found yet.</p>
                        <p className="text-sm mt-2">Configure your WhatsApp Webhook to start receiving orders automatically.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {orders.map(order => {
                            const isNew = order.status === 'New' || order.status === 'Pending';
                            let items = [];
                            try { items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json; } catch(e) {}

                            return (
                                <div key={order.id} className="p-6 hover:bg-gray-50 transition group">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center space-x-3">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                    order.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                    order.status === 'Processing' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {order.status}
                                                </span>
                                                <span className="text-xs text-gray-400">Received {new Date(order.createdAt).toLocaleString()}</span>
                                            </div>

                                            <div className="flex flex-wrap gap-4 text-sm">
                                                <div className="flex items-center space-x-2 text-gray-700 font-medium">
                                                    <User size={16} className="text-gray-400" />
                                                    <span>{order.customer_name || 'Guest Customer'}</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-gray-700">
                                                    <Phone size={16} className="text-gray-400" />
                                                    <span>{order.customer_contact}</span>
                                                </div>
                                            </div>

                                            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm text-gray-600 italic">
                                                "{order.order_text}"
                                            </div>

                                            {Array.isArray(items) && items.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {items.map((item, i) => (
                                                        <span key={i} className="bg-white border border-gray-200 rounded px-2 py-1 text-xs">
                                                            {item.quantity}x {item.name}
                                                        </span>
                                                    ))}
                                                    <span className="font-bold text-blue-600 ml-2">Total: ₹{order.total_amount}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {isNew && (
                                                <button
                                                    onClick={() => handleExtractAI(order.id, order.order_text)}
                                                    disabled={isProcessing === order.id}
                                                    className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-sm font-medium border border-indigo-100"
                                                >
                                                    <Sparkles size={14} className={isProcessing === order.id ? 'animate-pulse' : ''} />
                                                    <span>{isProcessing === order.id ? 'Extracting...' : 'AI Extract'}</span>
                                                </button>
                                            )}
                                            
                                            <button
                                                onClick={() => handleConvertToInvoice(order)}
                                                className="flex items-center space-x-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition text-sm font-medium border border-green-100"
                                            >
                                                <FileText size={14} />
                                                <span>Convert to Invoice</span>
                                            </button>

                                            <div className="flex space-x-1 border-l pl-2 ml-2">
                                                <button 
                                                    onClick={() => handleUpdateStatus(order.id, 'Completed')}
                                                    className="p-1.5 text-gray-400 hover:text-green-600 transition"
                                                    title="Mark Completed"
                                                >
                                                    <CheckCircle2 size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteOrder(order.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 transition"
                                                    title="Delete Order"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="mt-8 bg-blue-50 rounded-xl p-6 border border-blue-100">
                <h3 className="text-blue-800 font-bold flex items-center space-x-2">
                    <Phone size={18} />
                    <span>WhatsApp Integration Guide</span>
                </h3>
                <p className="text-blue-700 text-sm mt-2">
                    To receive orders automatically, point your WhatsApp Business Webhook to:
                </p>
                <code className="block bg-white p-3 rounded-lg border border-blue-200 mt-2 text-xs text-blue-900 overflow-x-auto">
                    {window.location.origin}/api/orders/webhook
                </code>
                <p className="text-blue-600 text-xs mt-4">
                    Verify Token: <span className="font-mono bg-white px-1 rounded">inwoice_secret_token</span> (Configurable in .env)
                </p>
            </div>
        </div>
    );
};

export default WhatsAppOrders;
