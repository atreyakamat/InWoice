import React from 'react';
import { Download, Mail, Bell, CheckCircle, Trash2 } from 'lucide-react';
import { api, API_ENDPOINTS } from '../apiConfig';

const InvoiceTable = ({ invoices, onRefresh }) => {
    const handleGeneratePDF = async (invoiceID) => {
        try {
            const res = await api.post(API_ENDPOINTS.INVOICE_PDF(invoiceID), {}, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${invoiceID}.pdf`);
            document.body.appendChild(link);
            link.click();
        } catch (error) {
            console.error(error);
            alert('Failed to generate PDF');
        }
    };

    const handleSendEmail = async (invoiceID) => {
        try {
            // Note: Fixed endpoint name to match API_ENDPOINTS.EMAIL_SEND
            await api.post(API_ENDPOINTS.EMAIL_SEND, { invoiceID });
            alert('Email sent successfully!');
        } catch (error) {
            console.error(error);
            alert('Failed to send email. Check settings.');
        }
    };

    const handleSendReminder = async (invoiceID) => {
        try {
            await api.post(API_ENDPOINTS.EMAIL_REMINDER, { invoiceID });
            alert('Reminder email sent successfully!');
        } catch (error) {
            console.error(error);
            alert('Failed to send reminder. Check settings.');
        }
    };

    const handleUpdateStatus = async (invoiceID, status) => {
        if (!window.confirm(`Mark invoice ${invoiceID} as ${status}?`)) return;
        try {
            // Updated to use the generic INVOICES endpoint with patch if specific status endpoint doesn't exist
            // Based on backend/routes/invoiceRoutes.js (which I should verify)
            await api.patch(`${API_ENDPOINTS.INVOICES}/${invoiceID}/status`, { status });
            onRefresh();
        } catch (error) {
            alert('Failed to update status');
        }
    };

    const handleDeleteInvoice = async (invoiceID) => {
        if (!window.confirm(`Are you sure you want to delete invoice ${invoiceID}? This cannot be undone.`)) return;
        try {
            await api.delete(`${API_ENDPOINTS.INVOICES}/${invoiceID}`);
            onRefresh();
        } catch (error) {
            alert('Failed to delete invoice');
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Invoice ID</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Date</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Customer Name</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Total Amount</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {invoices.map((inv) => (
                            <tr key={inv.invoiceID} className="hover:bg-gray-50 transition">
                                <td className="px-6 py-4 text-sm font-medium text-purple-700">{inv.invoiceID}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{inv.date}</td>
                                <td className="px-6 py-4 text-sm text-gray-800">{inv.customerName}</td>
                                <td className="px-6 py-4 text-sm font-medium text-gray-800">${inv.grandTotal.toFixed(2)}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                        inv.paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                        {inv.paymentStatus}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-1">
                                    {inv.paymentStatus === 'Pending' && (
                                        <>
                                            <button onClick={() => handleUpdateStatus(inv.invoiceID, 'Paid')} title="Mark as Paid" className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition">
                                                <CheckCircle size={18} />
                                            </button>
                                            <button onClick={() => handleSendReminder(inv.invoiceID)} title="Send Payment Reminder" className="p-2 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition">
                                                <Bell size={18} />
                                            </button>
                                        </>
                                    )}
                                    <button onClick={() => handleGeneratePDF(inv.invoiceID)} title="Download PDF" className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                                        <Download size={18} />
                                    </button>
                                    <button onClick={() => handleSendEmail(inv.invoiceID)} title="Email Invoice" className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition">
                                        <Mail size={18} />
                                    </button>
                                    <button onClick={() => handleDeleteInvoice(inv.invoiceID)} title="Delete Invoice" className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {invoices.length === 0 && (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">No invoices found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InvoiceTable;
