import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import InvoiceForm from '../components/InvoiceForm';
import InvoicePreview from '../components/InvoicePreview';

const CreateInvoice = () => {
    // ... rest of state unchanged
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        dueDate: '',
        paymentStatus: 'Pending',
        paymentMethod: 'UPI',
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        shippingAddress: '',
        instagramHandle: '',
        paymentInfo: '',
        notes: 'Thank you for supporting Stix N Vibes!',
        discount: 0,
        shipping: 0,
        tax: 0
    });

    const [items, setItems] = useState([
        { id: 1, name: '', description: '', variant: '', quantity: 1, price: 0, total: 0 }
    ]);

    const [settings, setSettings] = useState({});

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await api.get(API_ENDPOINTS.DATA_SETTINGS);
                setSettings(res);
            } catch (err) {
                console.error(err);
            }
        };
        fetchSettings();

        // Load draft from local storage
        const savedDraft = localStorage.getItem('invoice_draft');
        if (savedDraft) {
            const parsed = JSON.parse(savedDraft);
            setFormData(parsed.formData);
            setItems(parsed.items);
        }
    }, []);

    // Auto-save draft
    useEffect(() => {
        const draft = { formData, items };
        localStorage.setItem('invoice_draft', JSON.stringify(draft));
    }, [formData, items]);

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const grandTotal = subtotal - Number(formData.discount) + Number(formData.shipping) + Number(formData.tax);

    return (
        <div className="flex h-full">
            {/* Form Section (Left) - Higher Density */}
            <div className="w-[450px] min-w-[450px] border-r border-gray-100 bg-white h-full overflow-y-auto custom-scrollbar p-6">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter italic">Create Invoice</h1>
                    <span className="text-[10px] font-bold px-2 py-1 bg-purple-50 text-purple-600 rounded">DRAFT AUTO-SAVED</span>
                </div>
                
                <InvoiceForm 
                    formData={formData} 
                    setFormData={setFormData}
                    items={items}
                    setItems={setItems}
                    subtotal={subtotal}
                    grandTotal={grandTotal}
                    settings={settings}
                />
            </div>

            {/* Preview Section (Right) - Live WYSIWYG */}
            <div className="flex-1 bg-gray-50 h-full overflow-y-auto p-12">
                <div className="max-w-[800px] mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Live Preview</h2>
                        <div className="text-[10px] text-gray-400">
                            Press <kbd className="bg-white border px-1 rounded shadow-sm">Ctrl + Enter</kbd> to save & send
                        </div>
                    </div>
                    <InvoicePreview 
                        formData={formData}
                        items={items}
                        subtotal={subtotal}
                        grandTotal={grandTotal}
                        settings={settings}
                    />
                </div>
            </div>
        </div>
    );
};

export default CreateInvoice;
