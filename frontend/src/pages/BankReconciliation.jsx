import React, { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, CheckCircle, RefreshCcw, AlertTriangle, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { api, API_ENDPOINTS } from '../apiConfig';
import axios from 'axios';
import { getToken, API_BASE_URL } from '../apiConfig';

const BankReconciliation = () => {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [savedTransactions, setSavedTransactions] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [expandedIndex, setExpandedIndex] = useState(null);
    const [previewText, setPreviewText] = useState("");
    const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'history'

    useEffect(() => {
        fetchHistory();
        fetchInvoices();
    }, []);


    const fetchHistory = async () => {
        try {
            const data = await api.get(API_ENDPOINTS.BANK_TRANSACTIONS);
            setSavedTransactions(data || []);
        } catch (error) {
            console.error("Failed to load history:", error);
        }
    };

    const fetchInvoices = async () => {
        try {
            const response = await api.get(API_ENDPOINTS.INVOICES);
            const list = response?.invoices || response || [];
            setInvoices(list);
        } catch (error) {
            console.error("Failed to load invoices:", error);
        }
    };

    const suggestCategory = (description) => {
        const text = (description || '').toLowerCase();
        if (text.includes('rent')) return 'Rent';
        if (text.includes('electric') || text.includes('utility') || text.includes('water')) return 'Utilities';
        if (text.includes('salary') || text.includes('payroll')) return 'Payroll';
        if (text.includes('bank') || text.includes('fee') || text.includes('charge')) return 'Bank Charges';
        if (text.includes('gst') || text.includes('tax')) return 'Taxes';
        if (text.includes('amazon') || text.includes('office') || text.includes('supplies')) return 'Supplies';
        if (text.includes('refund')) return 'Refunds';
        return '';
    };

    const suggestInvoice = useCallback((txn) => {
        if (!txn || (txn.type || '').toLowerCase() !== 'credit') return '';
        const amount = Number(txn.amount) || 0;
        const match = invoices.find(inv => Math.abs((Number(inv.grandTotal) || 0) - amount) < 0.01 && inv.paymentStatus !== 'Paid');
        return match ? match.invoiceID : '';
    }, [invoices]);

    useEffect(() => {
        if (invoices.length === 0) return;
        setTransactions(prev => {
            if (prev.length === 0) return prev;
            return prev.map(txn => {
                if (txn.linked_invoice_id) return txn;
                return { ...txn, linked_invoice_id: suggestInvoice(txn) };
            });
        });
    }, [invoices, suggestInvoice]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            toast.error("Please select a PDF file first.");
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            // Using axios directly for form data
            const response = await axios.post(`${API_BASE_URL}/api/ai/ocr-bank-statement`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            if (response.data && response.data.data && response.data.data.transactions) {
                const parsed = response.data.data.transactions.map(t => ({
                    ...t,
                    is_personal: 0,
                    category: '',
                    reconciled: 0,
                    linked_invoice_id: '',
                    linked_customer: '',
                    vendor_name: '',
                    vendor_gstin: '',
                    gst_rate: 0,
                    gst_amount: 0,
                    invoice_number: '',
                    notes: ''
                }));
                const enriched = parsed.map(txn => ({
                    ...txn,
                    category: suggestCategory(txn.description),
                    linked_invoice_id: suggestInvoice(txn)
                }));
                setTransactions(enriched);
                setPreviewText(response.data.text_preview || "");
                toast.success("Statement processed successfully!");
            } else {
                toast.warning("No transactions found in the response.");
            }
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.error || "Failed to process statement.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleTypeToggle = (index) => {
        const newTxns = [...transactions];
        newTxns[index].is_personal = newTxns[index].is_personal === 1 ? 0 : 1;
        setTransactions(newTxns);
    };

    const handleFieldChange = (index, field, value) => {
        const newTxns = [...transactions];
        newTxns[index][field] = value;
        setTransactions(newTxns);
    };

    const handleSave = async () => {
        if (transactions.length === 0) return;
        setIsSaving(true);
        try {
            let count = 0;
            for (const txn of transactions) {
                const payload = {
                    ...txn,
                    reconciled: Number(txn.is_personal) === 1 ? 0 : (Number(txn.reconciled) || 1)
                };
                // Post each transaction (for simplicity, a bulk endpoint would be better in V4)
                await api.post(API_ENDPOINTS.BANK_TRANSACTIONS, payload);
                count++;
            }
            toast.success(`Saved ${count} transactions.`);
            setTransactions([]);
            setFile(null);
            setPreviewText("");
            fetchHistory();
            setActiveTab('history');
        } catch (error) {
            console.error(error);
            toast.error("Failed to save some transactions.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Bank Reconciliation</h1>
                <div className="flex space-x-2">
                    <button 
                        onClick={() => setActiveTab('upload')}
                        className={`px-4 py-2 rounded-lg ${activeTab === 'upload' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                        New Statement
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 rounded-lg ${activeTab === 'history' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                        History
                    </button>
                </div>
            </div>

            {activeTab === 'upload' && (
                <div className="space-y-6">
                    {/* Upload Section */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Upload Bank Statement (PDF)</h2>
                        <div className="flex items-center space-x-4">
                            <input 
                                type="file" 
                                accept="application/pdf"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-gray-500
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-full file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-purple-50 file:text-purple-700
                                    hover:file:bg-purple-100"
                            />
                            <button
                                onClick={handleUpload}
                                disabled={isUploading || !file}
                                className="flex items-center space-x-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                            >
                                {isUploading ? <RefreshCcw className="animate-spin" size={18} /> : <Upload size={18} />}
                                <span>{isUploading ? "Extracting..." : "Process with AI"}</span>
                            </button>
                        </div>
                        {previewText && (
                            <div className="mt-4 p-4 bg-gray-50 rounded-lg text-xs text-gray-500 font-mono overflow-auto max-h-32">
                                <p className="font-semibold mb-1">Extracted Text Preview:</p>
                                {previewText}
                            </div>
                        )}
                    </div>

                    {/* Extracted Transactions List */}
                    {transactions.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                <h3 className="font-semibold text-gray-700">Review Transactions</h3>
                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
                                >
                                    <Save size={16} />
                                    <span>Save & Add to Ledger</span>
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                                            <th className="p-4 font-medium">Date</th>
                                            <th className="p-4 font-medium">Description</th>
                                            <th className="p-4 font-medium">Type</th>
                                            <th className="p-4 font-medium">Amount</th>
                                            <th className="p-4 font-medium">Classification</th>
                                            <th className="p-4 font-medium">Category</th>
                                            <th className="p-4 font-medium">Linked Invoice</th>
                                            <th className="p-4 font-medium">Reconciled</th>
                                            <th className="p-4 font-medium">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {transactions.map((txn, index) => (
                                            <React.Fragment key={index}>
                                            <tr className="hover:bg-gray-50">
                                                <td className="p-4">{txn.date}</td>
                                                <td className="p-4">{txn.description}</td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${txn.type?.toLowerCase() === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {txn.type}
                                                    </span>
                                                </td>
                                                <td className="p-4 font-medium font-mono">${Number(txn.amount).toFixed(2)}</td>
                                                <td className="p-4">
                                                    <button 
                                                        onClick={() => handleTypeToggle(index)}
                                                        className={`px-3 py-1 rounded-full text-xs transition-colors ${txn.is_personal ? 'bg-gray-200 text-gray-600 border border-gray-300' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}
                                                    >
                                                        {txn.is_personal ? 'Personal (Ignore)' : 'Business'}
                                                    </button>
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        value={txn.category || ''}
                                                        onChange={(e) => handleFieldChange(index, 'category', e.target.value)}
                                                        className="w-32 p-2 border rounded-lg text-xs"
                                                        placeholder="Category"
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        value={txn.linked_invoice_id || ''}
                                                        onChange={(e) => handleFieldChange(index, 'linked_invoice_id', e.target.value)}
                                                        className="w-40 p-2 border rounded-lg text-xs"
                                                        placeholder="Invoice ID"
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={Number(txn.reconciled) === 1}
                                                        onChange={(e) => handleFieldChange(index, 'reconciled', e.target.checked ? 1 : 0)}
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <button
                                                        onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                                                        className="text-xs text-purple-600 underline"
                                                    >
                                                        {expandedIndex === index ? 'Hide' : 'Edit'}
                                                    </button>
                                                </td>
                                            </tr>
                                            {expandedIndex === index && (
                                                <tr className="bg-gray-50">
                                                    <td colSpan="9" className="p-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                            <input
                                                                value={txn.vendor_name || ''}
                                                                onChange={(e) => handleFieldChange(index, 'vendor_name', e.target.value)}
                                                                className="p-2 border rounded-lg text-xs"
                                                                placeholder="Vendor name"
                                                            />
                                                            <input
                                                                value={txn.vendor_gstin || ''}
                                                                onChange={(e) => handleFieldChange(index, 'vendor_gstin', e.target.value)}
                                                                className="p-2 border rounded-lg text-xs"
                                                                placeholder="Vendor GSTIN"
                                                            />
                                                            <input
                                                                value={txn.invoice_number || ''}
                                                                onChange={(e) => handleFieldChange(index, 'invoice_number', e.target.value)}
                                                                className="p-2 border rounded-lg text-xs"
                                                                placeholder="Invoice number"
                                                            />
                                                            <input
                                                                type="number"
                                                                value={txn.gst_rate || 0}
                                                                onChange={(e) => handleFieldChange(index, 'gst_rate', e.target.value)}
                                                                className="p-2 border rounded-lg text-xs"
                                                                placeholder="GST rate %"
                                                            />
                                                            <input
                                                                type="number"
                                                                value={txn.gst_amount || 0}
                                                                onChange={(e) => handleFieldChange(index, 'gst_amount', e.target.value)}
                                                                className="p-2 border rounded-lg text-xs"
                                                                placeholder="GST amount"
                                                            />
                                                            <input
                                                                value={txn.notes || ''}
                                                                onChange={(e) => handleFieldChange(index, 'notes', e.target.value)}
                                                                className="p-2 border rounded-lg text-xs"
                                                                placeholder="Notes"
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="font-semibold text-gray-700">Reconciled Transactions</h3>
                    </div>
                    {savedTransactions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                            <p>No transactions saved yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                                        <th className="p-4 font-medium">Date</th>
                                        <th className="p-4 font-medium">Description</th>
                                        <th className="p-4 font-medium">Type</th>
                                        <th className="p-4 font-medium">Amount</th>
                                        <th className="p-4 font-medium">Class</th>
                                        <th className="p-4 font-medium">Category</th>
                                        <th className="p-4 font-medium">Invoice</th>
                                        <th className="p-4 font-medium">Reconciled</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {savedTransactions.map((txn, index) => (
                                        <tr key={index} className="hover:bg-gray-50">
                                            <td className="p-4">{txn.date}</td>
                                            <td className="p-4">{txn.description}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${txn.type?.toLowerCase() === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {txn.type}
                                                </span>
                                            </td>
                                            <td className="p-4 font-medium font-mono">${Number(txn.amount).toFixed(2)}</td>
                                            <td className="p-4">
                                                {txn.is_personal ? 
                                                    <span className="text-gray-500 text-xs flex items-center"><AlertTriangle size={12} className="mr-1"/> Personal</span> 
                                                    : 
                                                    <span className="text-blue-600 text-xs flex items-center"><CheckCircle size={12} className="mr-1"/> Business</span>
                                                }
                                            </td>
                                            <td className="p-4 text-xs text-gray-600">{txn.category || '-'}</td>
                                            <td className="p-4 text-xs text-gray-600">{txn.linked_invoice_id || '-'}</td>
                                            <td className="p-4 text-xs text-gray-600">{Number(txn.reconciled) === 1 ? 'Yes' : 'No'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BankReconciliation;
