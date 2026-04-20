import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import InvoiceTable from '../components/InvoiceTable';

const Invoices = () => {
    const [invoices, setInvoices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchInvoices = async () => {
        try {
            const res = await api.get(API_ENDPOINTS.INVOICES);
            // sort descending by date or ID
            const sorted = [...res].reverse();
            setInvoices(sorted);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    const filteredInvoices = invoices.filter(inv => 
        inv.invoiceID.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Invoices</h1>
                <input 
                    type="text" 
                    placeholder="Search by ID or Name..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded-lg w-64 outline-none focus:ring-purple-500"
                />
            </div>
            <InvoiceTable invoices={filteredInvoices} onRefresh={fetchInvoices} />
        </div>
    );
};

export default Invoices;
