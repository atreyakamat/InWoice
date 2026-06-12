import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Download, CheckCircle, Clock } from 'lucide-react';
import InvoicePreview from '../components/InvoicePreview';
import { api, API_ENDPOINTS } from '../apiConfig';

const WebInvoiceView = () => {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInvoice = async () => {
            try {
                const res = await api.get(API_ENDPOINTS.WEB_INVOICE_BY_ID(id));
                setData(res);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchInvoice();
    }, [id]);

    const handleDownload = async () => {
        try {
            const pdfRes = await api.post(API_ENDPOINTS.INVOICE_PDF(id), {}, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([pdfRes]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${id}.pdf`);
            document.body.appendChild(link);
            link.click();
        } catch (e) {
            alert('Failed to download PDF');
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50 text-purple-600 font-bold italic animate-pulse">Loading Invoice...</div>;
    if (!data) return <div className="h-screen flex items-center justify-center bg-gray-50 text-red-500 font-bold">Invoice Not Found</div>;

    const { invoice, settings } = data;

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4">
            <div className="max-w-[900px] mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div className="flex items-center space-x-3">
                        {invoice.paymentStatus === 'Paid' ? (
                            <span className="flex items-center space-x-1 bg-green-100 text-green-700 px-4 py-2 rounded-full font-bold text-xs">
                                <CheckCircle size={16} /> <span>Payment Received</span>
                            </span>
                        ) : (
                            <span className="flex items-center space-x-1 bg-yellow-100 text-yellow-700 px-4 py-2 rounded-full font-bold text-xs italic">
                                <Clock size={16} /> <span>Waiting for Payment</span>
                            </span>
                        )}
                    </div>
                    <button onClick={handleDownload} className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-100">
                        <Download size={20} /> <span>Download PDF</span>
                    </button>
                </div>

                <InvoicePreview 
                    formData={invoice}
                    items={JSON.parse(invoice.itemsJSON)}
                    subtotal={invoice.subtotal}
                    grandTotal={invoice.grandTotal}
                    settings={settings}
                />

                <div className="mt-12 text-center text-gray-400 text-xs">
                    <p>Powered by Stix N Vibes Dashboard</p>
                </div>
            </div>
        </div>
    );
};

export default WebInvoiceView;
