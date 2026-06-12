import React, { useState, useEffect } from 'react';
import { Mail, RefreshCcw, Inbox, Send, Search, Trash2, Link2, Sparkles } from 'lucide-react';
import { toast } from 'react-toastify';
import { api, API_ENDPOINTS } from '../apiConfig';
import { useNavigate } from 'react-router-dom';

const MailClient = () => {
    const [emails, setEmails] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [replyText, setReplyText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [linkedCustomer, setLinkedCustomer] = useState("");
    const [linkedInvoice, setLinkedInvoice] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        fetchEmails();
    }, []);

    const fetchEmails = async () => {
        setIsLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.MAIL.INBOX);
            setEmails(data || []);
        } catch (error) {
            console.error("Failed to load emails:", error);
            toast.error("Failed to load inbox.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const response = await api.post(API_ENDPOINTS.MAIL.SYNC);
            toast.success(response.message || "Sync complete");
            fetchEmails();
        } catch (error) {
            console.error(error);
            toast.error(error.message || "Failed to sync emails. Ensure IMAP accounts are set in Settings.");
        } finally {
            setIsSyncing(false);
        }
    };

    const selectEmail = async (email) => {
        setSelectedEmail(email);
        setReplyText('');
        setLinkedCustomer(email.linked_customer || '');
        setLinkedInvoice(email.linked_invoice || '');
        if (!email.is_read) {
            try {
                await api.patch(API_ENDPOINTS.MAIL.UPDATE(email.id), {
                    is_read: 1,
                    linked_customer: email.linked_customer || null,
                    linked_invoice: email.linked_invoice || null
                });
                setEmails(prev => prev.map(item => item.id === email.id ? { ...item, is_read: 1 } : item));
            } catch (error) {
                console.error(error);
            }
        }
    };

    const handleLinkSave = async () => {
        if (!selectedEmail) return;
        try {
            const updated = await api.patch(API_ENDPOINTS.MAIL.UPDATE(selectedEmail.id), {
                is_read: selectedEmail.is_read ? 1 : 0,
                linked_customer: linkedCustomer || null,
                linked_invoice: linkedInvoice || null
            });
            setSelectedEmail(updated);
            setEmails(prev => prev.map(item => item.id === updated.id ? updated : item));
            toast.success('Links saved.');
        } catch (error) {
            console.error(error);
            toast.error('Failed to save links.');
        }
    };

    const handleReply = async () => {
        if (!selectedEmail || !replyText.trim()) return;
        setIsSending(true);
        try {
            await api.post(API_ENDPOINTS.MAIL.REPLY, {
                to: selectedEmail.sender,
                subject: `Re: ${selectedEmail.subject || ''}`.trim(),
                body: replyText,
                inReplyTo: selectedEmail.message_id
            });
            toast.success('Reply sent.');
            setReplyText('');
        } catch (error) {
            console.error(error);
            toast.error(error.message || 'Failed to send reply.');
        } finally {
            setIsSending(false);
        }
    };

    const handleExtractInvoice = async () => {
        if (!selectedEmail) return;
        try {
            const data = await api.post(API_ENDPOINTS.AI_PARSE, {
                text: `${selectedEmail.subject || ''}\n${selectedEmail.body || ''}`
            });

            const formData = {
                date: new Date().toISOString().split('T')[0],
                dueDate: '',
                paymentStatus: 'Pending',
                paymentMethod: 'UPI',
                customerName: data.customerName || '',
                customerEmail: data.customerEmail || '',
                customerPhone: data.customerPhone || '',
                shippingAddress: '',
                instagramHandle: '',
                paymentInfo: '',
                notes: 'Imported from email',
                discount: 0,
                shipping: 0,
                tax: 0,
                cgst: 0,
                sgst: 0,
                igst: 0,
                tds: 0,
                hsn_sac: ''
            };
            const items = Array.isArray(data.items) && data.items.length > 0
                ? data.items.map((item, index) => ({
                    id: Date.now() + index,
                    name: item.name || '',
                    description: '',
                    variant: '',
                    quantity: item.quantity || 1,
                    price: item.price || 0,
                    total: (item.quantity || 1) * (item.price || 0)
                }))
                : [{ id: Date.now(), name: '', description: '', variant: '', quantity: 1, price: 0, total: 0 }];

            localStorage.setItem('invoice_draft', JSON.stringify({ formData, items }));
            toast.success('Invoice draft created from email.');
            navigate('/create-invoice');
        } catch (error) {
            console.error(error);
            toast.error('Failed to extract invoice from email.');
        }
    };

    const filteredEmails = emails.filter(email => 
        (email.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (email.sender || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex h-[calc(100vh-2rem)] m-4 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Sidebar / List */}
            <div className="w-1/3 border-r border-gray-200 flex flex-col bg-gray-50">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center"><Inbox className="mr-2" size={20} /> Inbox</h2>
                    <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
                        title="Sync IMAP Accounts"
                    >
                        <RefreshCcw size={18} className={isSyncing ? "animate-spin" : ""} />
                    </button>
                </div>
                <div className="p-3 border-b border-gray-200 bg-white">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search emails..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="p-8 text-center text-gray-500">Loading emails...</div>
                    ) : filteredEmails.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                            <Mail className="mb-2 text-gray-300" size={32} />
                            <p>No emails found.</p>
                            <p className="text-xs mt-2">Make sure you have added IMAP accounts in Settings.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {filteredEmails.map(email => (
                                <div 
                                    key={email.id} 
                                    onClick={() => selectEmail(email)}
                                    className={`p-4 cursor-pointer hover:bg-purple-50 transition-colors ${selectedEmail?.id === email.id ? 'bg-purple-100 border-l-4 border-purple-500' : 'bg-white'}`}
                                >
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="font-semibold text-gray-800 truncate pr-2 text-sm">{email.sender.split('<')[0]}</span>
                                        <span className="text-xs text-gray-500 whitespace-nowrap">
                                            {new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                    <h4 className="text-sm font-medium text-gray-700 truncate">{email.subject}</h4>
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{email.body.substring(0, 100)}...</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Email View */}
            <div className="w-2/3 flex flex-col bg-white">
                {selectedEmail ? (
                    <>
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">{selectedEmail.subject}</h2>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold">
                                        {selectedEmail.sender.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-800 text-sm">{selectedEmail.sender}</p>
                                        <p className="text-xs text-gray-500">To: {selectedEmail.recipient}</p>
                                    </div>
                                </div>
                                <div className="text-sm text-gray-500 flex items-center space-x-4">
                                    <span>{new Date(selectedEmail.date).toLocaleString()}</span>
                                    <button className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <input
                                    type="text"
                                    value={linkedCustomer}
                                    onChange={(e) => setLinkedCustomer(e.target.value)}
                                    placeholder="Link customer email"
                                    className="p-2 text-xs border rounded-lg"
                                />
                                <input
                                    type="text"
                                    value={linkedInvoice}
                                    onChange={(e) => setLinkedInvoice(e.target.value)}
                                    placeholder="Link invoice ID"
                                    className="p-2 text-xs border rounded-lg"
                                />
                                <button
                                    onClick={handleLinkSave}
                                    className="flex items-center justify-center space-x-2 px-3 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg"
                                >
                                    <Link2 size={14} />
                                    <span>Save Links</span>
                                </button>
                            </div>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto">
                            <div className="prose max-w-none text-sm text-gray-700 whitespace-pre-wrap font-sans">
                                {selectedEmail.body}
                            </div>
                            <div className="mt-6">
                                <button
                                    onClick={handleExtractInvoice}
                                    className="flex items-center space-x-2 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg"
                                >
                                    <Sparkles size={14} />
                                    <span>Extract Invoice from Email</span>
                                </button>
                            </div>
                        </div>
                        {/* Reply Box (Placeholder) */}
                        <div className="p-4 border-t border-gray-200 bg-gray-50">
                            <div className="border border-gray-300 rounded-lg bg-white p-3 flex flex-col">
                                <textarea 
                                    className="w-full focus:outline-none text-sm resize-none" 
                                    rows="3" 
                                    placeholder="Click here to reply..."
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                ></textarea>
                                <div className="flex justify-end mt-2">
                                    <button
                                        onClick={handleReply}
                                        disabled={isSending}
                                        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors flex items-center disabled:opacity-50"
                                    >
                                        <Send size={16} className="mr-2" /> {isSending ? 'Sending...' : 'Send Reply'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center flex-col text-gray-400">
                        <Mail size={48} className="mb-4 text-gray-300" />
                        <p className="text-lg">Select an email to read</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MailClient;
