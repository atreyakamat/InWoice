import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import {
  MessageSquare,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Trash2,
  FileText,
  Sparkles,
  User,
  Phone,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WhatsAppOrders = () => {
    const [chats, setChats] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(null);
    const [expandedChatId, setExpandedChatId] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchChats();
    }, []);

    const fetchChats = async () => {
        setIsLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.ORDERS.LIST);
            setChats(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch chats', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getConversationText = (chat) => {
        const messages = Array.isArray(chat?.messages) ? chat.messages : [];
        if (messages.length > 0) {
            return messages
                .map((message) => message.body || '')
                .filter(Boolean)
                .join('\n');
        }

        return chat?.last_message || chat?.order_text || '';
    };

    const parseItems = (chat) => {
        try {
            const items = typeof chat.items_json === 'string' ? JSON.parse(chat.items_json) : chat.items_json;
            return Array.isArray(items) ? items : [];
        } catch (error) {
            return [];
        }
    };

    const handleExtractAI = async (chatId, chat) => {
        setIsProcessing(chatId);
        try {
            const extracted = await api.post(API_ENDPOINTS.ORDERS.EXTRACT_AI, {
                text: getConversationText(chat)
            });

            if (extracted) {
                alert(`AI Extracted: ${extracted.customerName}\nItems: ${extracted.items.length}\nTotal: ${extracted.total}`);
                fetchChats();
            }
        } catch (error) {
            console.error('AI Extraction failed', error);
            alert('AI Extraction failed. Please check AI settings.');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleUpdateClassification = async (id, classification) => {
        try {
            await api.patch(API_ENDPOINTS.ORDERS.UPDATE_CLASSIFICATION(id), { classification });
            fetchChats();
        } catch (error) {
            console.error('Failed to update classification', error);
        }
    };

    const handleDeleteChat = async (id) => {
        if (!window.confirm('Delete this chat and its saved conversation?')) return;
        try {
            await api.delete(API_ENDPOINTS.ORDERS.DELETE(id));
            fetchChats();
        } catch (error) {
            console.error('Failed to delete chat', error);
        }
    };

    const handleConvertToInvoice = (chat) => {
        const items = parseItems(chat);
        navigate('/create-invoice', {
            state: {
                prefill: {
                    customerName: chat.contact_name || 'Guest Customer',
                    customerPhone: chat.contact_phone || chat.contact_id || '',
                    items,
                    notes: `Converted from WhatsApp conversation: ${getConversationText(chat).slice(0, 120)}`
                }
            }
        });
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">WhatsApp Chats</h1>
                    <p className="text-gray-500 mt-1">Review OpenWA conversations and mark them as order or not order.</p>
                </div>
                <button
                    onClick={fetchChats}
                    className="p-2 text-gray-500 hover:text-blue-600 transition"
                    title="Refresh Chats"
                >
                    <RefreshCcw size={20} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Saved Conversations</h2>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                        {chats.length} Total
                    </span>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
                        <p className="text-gray-500">Fetching your conversations...</p>
                    </div>
                ) : chats.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No WhatsApp chats found yet.</p>
                        <p className="text-sm mt-2">Connect OpenWA to the backend webhook to start saving conversations automatically.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {chats.map((chat) => {
                            const classification = chat.classification || 'pending';
                            const messages = Array.isArray(chat.messages) ? chat.messages : [];
                            const expanded = expandedChatId === chat.chat_id;
                            const items = parseItems(chat);
                            const lastMessage = chat.last_message || chat.order_text || getConversationText(chat).split('\n').filter(Boolean).slice(-1)[0] || '';

                            return (
                                <div key={chat.chat_id} className="p-6 hover:bg-gray-50 transition group">
                                    <div className="flex flex-col gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedChatId(expanded ? null : chat.chat_id)}
                                            className="w-full text-left"
                                        >
                                            <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                                                <div className="flex-1 space-y-3">
                                                    <div className="flex items-center space-x-3">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                            classification === 'order' ? 'bg-green-100 text-green-700' :
                                                            classification === 'not_order' ? 'bg-red-100 text-red-700' :
                                                            'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {classification === 'order' ? 'Order' : classification === 'not_order' ? 'Not Order' : 'Pending'}
                                                        </span>
                                                        <span className="text-xs text-gray-400">
                                                            Updated {new Date(chat.updatedAt || chat.last_message_at || chat.createdAt).toLocaleString()}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-wrap gap-4 text-sm">
                                                        <div className="flex items-center space-x-2 text-gray-700 font-medium">
                                                            <User size={16} className="text-gray-400" />
                                                            <span>{chat.contact_name || 'Guest Customer'}</span>
                                                        </div>
                                                        <div className="flex items-center space-x-2 text-gray-700">
                                                            <Phone size={16} className="text-gray-400" />
                                                            <span>{chat.contact_phone || chat.contact_id || 'Unknown contact'}</span>
                                                        </div>
                                                        <div className="flex items-center space-x-2 text-gray-500">
                                                            <MessageSquare size={16} className="text-gray-400" />
                                                            <span>{messages.length || chat.message_count || 0} messages</span>
                                                        </div>
                                                    </div>

                                                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm text-gray-600 italic">
                                                        "{lastMessage || 'No message text available.'}"
                                                    </div>

                                                    {Array.isArray(items) && items.length > 0 && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {items.map((item, index) => (
                                                                <span key={index} className="bg-white border border-gray-200 rounded px-2 py-1 text-xs">
                                                                    {item.quantity}x {item.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 text-gray-400 self-start">
                                                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                </div>
                                            </div>
                                        </button>

                                        {expanded && (
                                            <div className="border border-gray-100 rounded-xl bg-white p-4">
                                                <div className="space-y-3">
                                                    {messages.length > 0 ? messages.map((message) => (
                                                        <div key={message.message_id} className="rounded-lg border border-gray-100 p-3">
                                                            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                                                                <span>{message.direction || 'inbound'}</span>
                                                                <span>{new Date(message.timestamp || message.createdAt).toLocaleString()}</span>
                                                            </div>
                                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.body}</p>
                                                        </div>
                                                    )) : (
                                                        <p className="text-sm text-gray-500">No saved messages for this chat yet.</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-4">
                                        <button
                                            onClick={() => handleUpdateClassification(chat.chat_id, 'order')}
                                            className="flex items-center space-x-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition text-sm font-medium border border-green-100"
                                        >
                                            <CheckCircle2 size={14} />
                                            <span>Mark Order</span>
                                        </button>

                                        <button
                                            onClick={() => handleUpdateClassification(chat.chat_id, 'not_order')}
                                            className="flex items-center space-x-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition text-sm font-medium border border-red-100"
                                        >
                                            <XCircle size={14} />
                                            <span>Mark Not Order</span>
                                        </button>

                                        <button
                                            onClick={() => handleExtractAI(chat.chat_id, chat)}
                                            disabled={isProcessing === chat.chat_id}
                                            className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-sm font-medium border border-indigo-100"
                                        >
                                            <Sparkles size={14} className={isProcessing === chat.chat_id ? 'animate-pulse' : ''} />
                                            <span>{isProcessing === chat.chat_id ? 'Extracting...' : 'AI Extract'}</span>
                                        </button>

                                        <button
                                            onClick={() => handleConvertToInvoice(chat)}
                                            className="flex items-center space-x-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition text-sm font-medium border border-blue-100"
                                        >
                                            <FileText size={14} />
                                            <span>Convert to Invoice</span>
                                        </button>

                                        <button
                                            onClick={() => handleDeleteChat(chat.chat_id)}
                                            className="flex items-center space-x-1 px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition text-sm font-medium border border-gray-100"
                                        >
                                            <Trash2 size={14} />
                                            <span>Delete</span>
                                        </button>
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
                    <span>OpenWA Integration Guide</span>
                </h3>
                <p className="text-blue-700 text-sm mt-2">
                    Point your OpenWA webhook at the backend endpoint below. The Docker setup wires this automatically.
                </p>
                <code className="block bg-white p-3 rounded-lg border border-blue-200 mt-2 text-xs text-blue-900 overflow-x-auto">
                    {window.location.origin}/api/orders/openwa/webhook
                </code>
                <p className="text-blue-600 text-xs mt-4">
                    Conversations are stored in SQLite and can be tagged as Order or Not Order from this screen.
                </p>
            </div>
        </div>
    );
};

export default WhatsAppOrders;
