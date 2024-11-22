import React, { useState } from 'react';
import axios from 'axios';

const InvoiceForm = () => {
    const [formData, setFormData] = useState({
        CustomerName: '',
        Product: '',
        Quantity: 1,
        PricePerUnit: 10,
        Date: new Date().toLocaleDateString(),
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3000/generate-invoice', formData);
            alert('Invoice logged successfully.');
        } catch (error) {
            alert('Error logging invoice.');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-gray-100">
            <input
                type="text"
                name="CustomerName"
                placeholder="Customer Name"
                value={formData.CustomerName}
                onChange={handleChange}
                className="border p-2 w-full mb-4"
            />
            <input
                type="text"
                name="Product"
                placeholder="Product"
                value={formData.Product}
                onChange={handleChange}
                className="border p-2 w-full mb-4"
            />
            <input
                type="number"
                name="Quantity"
                placeholder="Quantity"
                value={formData.Quantity}
                onChange={handleChange}
                className="border p-2 w-full mb-4"
            />
            <input
                type="number"
                name="PricePerUnit"
                placeholder="Price Per Unit"
                value={formData.PricePerUnit}
                onChange={handleChange}
                className="border p-2 w-full mb-4"
            />
            <button type="submit" className="bg-blue-500 text-white px-4 py-2">
                Generate Invoice
            </button>
        </form>
    );
};

export default InvoiceForm;
