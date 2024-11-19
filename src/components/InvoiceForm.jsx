import React, { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';

const InvoiceForm = () => {
  // State for invoice details
  const [invoiceInfo, setInvoiceInfo] = useState({
    invoiceNumber: `INV-${new Date().getFullYear()}-001`,
    date: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    companyName: '',
    companyAddress: '',
    companyEmail: '',
    companyPhone: '',
    clientName: '',
    clientAddress: '',
    clientEmail: '',
    clientPhone: '',
    notes: '',
    terms: 'Net 30',
    currency: 'USD'
  });

  // State for invoice items
  const [items, setItems] = useState([
    {
      id: 1,
      description: '',
      quantity: 1,
      price: 0,
      tax: 0
    }
  ]);

  const invoiceRef = useRef();

  // Handle printing
  const handlePrint = useReactToPrint({
    content: () => invoiceRef.current,
    documentTitle: `Invoice_${invoiceInfo.invoiceNumber}`,
  });

  // Handle input changes for invoice info
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle item changes
  const handleItemChange = (id, field, value) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  // Add new item
  const addItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: prev.length + 1,
        description: '',
        quantity: 1,
        price: 0,
        tax: 0
      }
    ]);
  };

  // Remove item
  const removeItem = (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // Calculate subtotal
  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  // Calculate tax
  const calculateTax = () => {
    return items.reduce((sum, item) => {
      const itemTotal = item.quantity * item.price;
      return sum + (itemTotal * (item.tax / 100));
    }, 0);
  };

  // Calculate total
  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Top Buttons */}
        <div className="flex justify-end mb-5">
          <button
            onClick={handlePrint}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Print/Download Invoice
          </button>
        </div>

        {/* Invoice Card */}
        <div className="bg-white p-8 rounded-lg shadow-lg" ref={invoiceRef}>
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div className="w-1/2">
              <h1 className="text-3xl font-bold text-gray-800 mb-4">INVOICE</h1>
              <div className="space-y-2">
                <input
                  type="text"
                  name="companyName"
                  placeholder="Your Company Name"
                  value={invoiceInfo.companyName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded"
                />
                <textarea
                  name="companyAddress"
                  placeholder="Company Address"
                  value={invoiceInfo.companyAddress}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded"
                  rows="2"
                />
                <input
                  type="email"
                  name="companyEmail"
                  placeholder="Company Email"
                  value={invoiceInfo.companyEmail}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded"
                />
                <input
                  type="tel"
                  name="companyPhone"
                  placeholder="Company Phone"
                  value={invoiceInfo.companyPhone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>
            <div className="w-1/3">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice Number:</span>
                  <input
                    type="text"
                    name="invoiceNumber"
                    value={invoiceInfo.invoiceNumber}
                    onChange={handleInputChange}
                    className="w-32 px-2 py-1 border rounded text-right"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Date:</span>
                  <input
                    type="date"
                    name="date"
                    value={invoiceInfo.date}
                    onChange={handleInputChange}
                    className="w-32 px-2 py-1 border rounded"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Due Date:</span>
                  <input
                    type="date"
                    name="dueDate"
                    value={invoiceInfo.dueDate}
                    onChange={handleInputChange}
                    className="w-32 px-2 py-1 border rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bill To */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Bill To:</h2>
            <div className="space-y-2">
              <input
                type="text"
                name="clientName"
                placeholder="Client Name"
                value={invoiceInfo.clientName}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded"
              />
              <textarea
                name="clientAddress"
                placeholder="Client Address"
                value={invoiceInfo.clientAddress}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded"
                rows="2"
              />
              <input
                type="email"
                name="clientEmail"
                placeholder="Client Email"
                value={invoiceInfo.clientEmail}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                type="tel"
                name="clientPhone"
                placeholder="Client Phone"
                value={invoiceInfo.clientPhone}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>

          // ... previous code remains the same ...

          {/* Items */}
          <div className="mb-8">
            <table className="w-full mb-4">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left">Item Description</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Tax (%)</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        className="w-full px-2 py-1 border rounded"
                        placeholder="Item description"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border rounded text-right"
                        min="0"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={item.price}
                        onChange={(e) => handleItemChange(item.id, 'price', parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1 border rounded text-right"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={item.tax}
                        onChange={(e) => handleItemChange(item.id, 'tax', parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border rounded text-right"
                        min="0"
                        max="100"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {(item.quantity * item.price * (1 + item.tax / 100)).toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              onClick={addItem}
              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
            >
              Add Item
            </button>
          </div>

          {/* Summary */}
          <div className="flex justify-end mb-8">
            <div className="w-80">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">
                  {invoiceInfo.currency} {calculateSubtotal().toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Tax:</span>
                <span className="font-medium">
                  {invoiceInfo.currency} {calculateTax().toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-600 font-semibold">Total:</span>
                <span className="font-bold">
                  {invoiceInfo.currency} {calculateTotal().toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes and Terms */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-gray-600 font-semibold mb-2">Notes</h3>
              <textarea
                name="notes"
                value={invoiceInfo.notes}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded"
                rows="3"
                placeholder="Any additional notes..."
              />
            </div>
            <div>
              <h3 className="text-gray-600 font-semibold mb-2">Terms & Conditions</h3>
              <textarea
                name="terms"
                value={invoiceInfo.terms}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded"
                rows="3"
                placeholder="Terms and conditions..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="border-t pt-8">
            <div className="text-center text-gray-500">
              <p className="mb-2">Thank you for your business!</p>
              <p className="text-sm">
                Please process this payment within the specified payment terms.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Buttons */}
        <div className="flex justify-between mt-5">
          <button
            onClick={() => {
              // Reset form logic here
              window.location.reload();
            }}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Reset Form
          </button>
          <button
            onClick={handlePrint}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Print/Download Invoice
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceForm;