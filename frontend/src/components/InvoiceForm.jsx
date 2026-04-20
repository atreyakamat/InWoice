import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Mic, Bot, Loader2, Send, Download, Share2 } from 'lucide-react';
import { api, API_ENDPOINTS, default as apiClient } from '../apiConfig';

const InvoiceForm = ({ formData, setFormData, items, setItems, subtotal, grandTotal, settings }) => {
    const [availableProducts, setAvailableProducts] = useState([]);
    const [availableCustomers, setAvailableCustomers] = useState([]);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [products, customers] = await Promise.all([
                    api.get(API_ENDPOINTS.PRODUCTS),
                    api.get(API_ENDPOINTS.DATA_CUSTOMERS)
                ]);
                setAvailableProducts(products || []);
                setAvailableCustomers(customers || []);
            } catch (err) {
                console.error('Error fetching form data:', err);
            }
        };
        fetchData();
    }, []);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit('email');
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                handleSubmit('save');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [formData, items]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'customerName') setShowCustomerDropdown(true);
    };

    const selectCustomer = (cust) => {
        setFormData(prev => ({
            ...prev,
            customerName: cust.name,
            customerEmail: cust.email,
            customerPhone: cust.phone,
            instagramHandle: cust.instagram
        }));
        setShowCustomerDropdown(false);
    };

    const handleItemChange = (id, field, value) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, [field]: value };
                if (field === 'name') {
                    const matched = availableProducts.find(p => p.name === value);
                    if (matched) {
                        updatedItem.price = matched.price;
                        updatedItem.variant = matched.category || '';
                    }
                }
                if (field === 'quantity' || field === 'price' || field === 'name') {
                    updatedItem.total = Number(updatedItem.quantity) * Number(updatedItem.price);
                }
                return updatedItem;
            }
            return item;
        }));
    };

    const addItem = () => setItems(prev => [...prev, { id: Date.now(), name: '', description: '', variant: '', quantity: 1, price: 0, total: 0 }]);
    const removeItem = (id) => setItems(prev => prev.filter(item => item.id !== id));

    const handleSubmit = async (action) => {
        const payload = { ...formData, itemsJSON: JSON.stringify(items), subtotal, grandTotal };
        
        // --- Offline Check ---
        if (!navigator.onLine) {
            const outbox = JSON.parse(localStorage.getItem('offline_outbox') || '[]');
            outbox.push({ ...payload, action, id: Date.now() });
            localStorage.setItem('offline_outbox', JSON.stringify(outbox));
            alert('Offline! Invoice saved to outbox and will sync when online.');
            return;
        }

        try {
            const res = await api.post(API_ENDPOINTS.INVOICES, payload);
            const invoice = res.invoice;

            if (action === 'pdf') {
                const pdfRes = await apiClient.post(API_ENDPOINTS.INVOICE_PDF(invoice.invoiceID), {}, { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([pdfRes.data]));
                const link = document.createElement('a'); link.href = url; link.setAttribute('download', `${invoice.invoiceID}.pdf`); document.body.appendChild(link); link.click();
            } else if (action === 'email') {
                await api.post(API_ENDPOINTS.EMAIL_SEND + '/' + invoice.invoiceID);
                alert('Sent to ' + formData.customerEmail);
            } else if (action === 'whatsapp') {
                const invoiceUrl = `${window.location.origin}/view-invoice/${invoice.invoiceID}`;
                const text = `Hi ${formData.customerName}! Here is your invoice from Stix N Vibes: ${invoiceUrl}`;
                window.open(`https://wa.me/${formData.customerPhone.replace(/\D/g,'')}?text=${encodeURIComponent(text)}`, '_blank');
            } else {
                alert('Saved!');
            }
            localStorage.removeItem('invoice_draft');
        } catch (error) {
            console.error('Submit error:', error);
            alert('Error processing request: ' + (error.message || 'Unknown error'));
        }
    };

    // Background Sync
    useEffect(() => {
        const syncOutbox = async () => {
            if (navigator.onLine) {
                const outbox = JSON.parse(localStorage.getItem('offline_outbox') || '[]');
                if (outbox.length > 0) {
                    console.log('Syncing offline outbox...');
                    for (const item of outbox) {
                        try { await api.post(API_ENDPOINTS.INVOICES, item); } catch(e) {}
                    }
                    localStorage.setItem('offline_outbox', '[]');
                    alert('Back Online! All offline invoices have been synced.');
                }
            }
        };
        window.addEventListener('online', syncOutbox);
        return () => window.removeEventListener('online', syncOutbox);
    }, []);

    const startVoice = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return alert('Use Chrome for Voice');
        const rec = new SpeechRecognition();
        rec.onstart = () => setIsListening(true);
        rec.onresult = async (e) => {
            const transcript = e.results[0][0].transcript;
            setIsListening(false);
            setIsAiProcessing(true);
            try {
                const data = await api.post(API_ENDPOINTS.AI_PARSE, { text: transcript });
                setFormData(prev => ({ ...prev, customerName: data.customerName || prev.customerName, customerEmail: data.customerEmail || prev.customerEmail }));
                if (data.items) setItems(data.items.map((it, i) => ({ id: Date.now()+i, name: it.name, quantity: it.quantity, price: it.price, total: it.quantity*it.price })));
            } catch(e) {} finally { setIsAiProcessing(false); }
        };
        rec.start();
    };

    return (
        <div className="space-y-6 text-sm">
            {/* Quick Voice Bar */}
            <button onClick={startVoice} className={`w-full flex items-center justify-center space-x-2 p-3 rounded-xl border-2 border-dashed transition-all ${isListening ? 'border-red-400 bg-red-50 text-red-600 animate-pulse' : 'border-purple-200 text-purple-400 hover:border-purple-400 hover:bg-purple-50'}`}>
                {isAiProcessing ? <Loader2 className="animate-spin" /> : <Mic size={18} />}
                <span className="font-bold uppercase tracking-widest text-[10px]">{isListening ? 'Listening...' : 'Voice Command'}</span>
            </button>

            {/* Customer Section */}
            <div className="relative">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Customer</label>
                <input type="text" name="customerName" value={formData.customerName} onChange={handleInputChange} placeholder="Name" className="w-full p-3 bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-purple-100 border-none font-medium" autoComplete="off" />
                {showCustomerDropdown && formData.customerName && (
                    <div className="absolute z-10 w-full bg-white shadow-xl rounded-lg mt-1 border border-gray-100 overflow-hidden">
                        {availableCustomers.filter(c => c.name.toLowerCase().includes(formData.customerName.toLowerCase())).map(c => (
                            <button key={c.email} onClick={() => selectCustomer(c)} className="w-full text-left p-3 hover:bg-purple-50 flex flex-col border-b border-gray-50 last:border-0">
                                <span className="font-bold text-gray-800">{c.name}</span>
                                <span className="text-[10px] text-gray-400">{c.email}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <input type="email" name="customerEmail" value={formData.customerEmail} onChange={handleInputChange} placeholder="Email" className="p-3 bg-gray-50 rounded-lg outline-none border-none" />
                <input type="text" name="customerPhone" value={formData.customerPhone} onChange={handleInputChange} placeholder="WhatsApp Number" className="p-3 bg-gray-50 rounded-lg outline-none border-none" />
            </div>

            {/* Items Section */}
            <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-widest border-b pb-1">Items</label>
                <div className="space-y-3">
                    {items.map((item) => (
                        <div key={item.id} className="group relative bg-gray-50 p-3 rounded-xl border border-transparent hover:border-purple-100 transition-all">
                            <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-7">
                                    <input list="prods" type="text" value={item.name} onChange={(e) => handleItemChange(item.id, 'name', e.target.value)} placeholder="Product" className="w-full bg-transparent font-bold outline-none" />
                                    <datalist id="prods">{availableProducts.map(p => <option key={p.id} value={p.name} />)}</datalist>
                                </div>
                                <div className="col-span-2 text-center">
                                    <input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} className="w-full bg-transparent text-center outline-none" />
                                </div>
                                <div className="col-span-3 text-right font-bold text-purple-600">
                                    ${item.total.toFixed(2)}
                                </div>
                            </div>
                            <button onClick={() => removeItem(item.id)} className="absolute -right-2 -top-2 bg-white text-red-400 p-1 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                        </div>
                    ))}
                </div>
                <button onClick={addItem} className="mt-4 text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center hover:text-purple-600"><Plus size={14} className="mr-1" /> Add Line Item</button>
            </div>

            {/* Totals & Notes */}
            <div className="bg-purple-50 p-4 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-purple-400 uppercase">Discount</span>
                    <input type="number" name="discount" value={formData.discount} onChange={handleInputChange} className="w-16 bg-transparent text-right font-bold outline-none" />
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-purple-400 uppercase">Shipping</span>
                    <input type="number" name="shipping" value={formData.shipping} onChange={handleInputChange} className="w-16 bg-transparent text-right font-bold outline-none" />
                </div>
                <div className="flex justify-between border-t border-purple-100 pt-2 mt-2">
                    <span className="font-black uppercase tracking-tighter italic text-purple-800">Total Amount</span>
                    <span className="font-black text-purple-800">${grandTotal.toFixed(2)}</span>
                </div>
            </div>

            {/* Final Actions */}
            <div className="grid grid-cols-2 gap-3 pt-4">
                <button onClick={() => handleSubmit('email')} className="flex items-center justify-center space-x-2 bg-purple-600 text-white p-4 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-100">
                    <Send size={18} /> <span>Email Invoice</span>
                </button>
                <button onClick={() => handleSubmit('whatsapp')} className="flex items-center justify-center space-x-2 bg-green-500 text-white p-4 rounded-xl font-bold hover:bg-green-600 transition-all shadow-lg shadow-green-100">
                    <Share2 size={18} /> <span>WhatsApp</span>
                </button>
                <button onClick={() => handleSubmit('pdf')} className="col-span-2 flex items-center justify-center space-x-2 bg-gray-800 text-white p-3 rounded-xl font-bold hover:bg-black transition-all">
                    <Download size={18} /> <span>Download PDF</span>
                </button>
            </div>
        </div>
    );
};

export default InvoiceForm;
