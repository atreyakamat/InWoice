import React, { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { PlusIcon, TrashIcon, PrinterIcon } from '@heroicons/react/24/solid';

const Invoice = () => {
  const [items, setItems] = useState([
    { id: 1, description: '', quantity: 1, price: 0 },
  ]);
  const [company, setCompany] = useState({
    name: '',
    address: '',
    email: '',
    phone: '',
  });
  const [client, setClient] = useState({
    name: '',
    address: '',
    email: '',
    phone: '',
  });

  const invoiceRef = useRef();
  const handlePrint = useReactToPrint({
    content: () => invoiceRef.current,
  });

  const addItem = () => {
    setItems([
      ...items,
      { id: items.length + 1, description: '', quantity: 1, price: 0 },
    ]);
  };

  const removeItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-5xl mx-auto bg-white p-8 rounded-lg shadow-lg" ref={invoiceRef}>
        {/* Header */}
        <div className="flex justify-between mb-8">
          <div>
            <input
              className="text-2xl font-bold mb-2 border-b-2"
              placeholder="Your Company"
              value={company.name}
              onChange={(e) => setCompany({ ...company, name: e.target.value })}
            />
            <textarea
              className="block w-64 text-gray-700"
              placeholder="Company Address"
              value={company.address}
              onChange={(e) => setCompany({ ...company, address: e.target.value })}
            />
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-bold text-gray-700 mb-4">INVOICE</h1>
            <p className="text-gray-500">Date: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Client Info */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Bill To:</h2>
          <input
            className="text-xl mb-2 border-b-2"
            placeholder="Client Name"
            value={client.name}
            onChange={(e) => setClient({ ...client, name: e.target.value })}
          />
          <textarea
            className="block w-64 text-gray-700"
            placeholder="Client Address"
            value={client.address}
            onChange={(e) => setClient({ ...client, address: e.target.value })}
          />
        </div>

        {/* Items */}
        <table className="w-full mb-8">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-2">Description</th>
              <th className="text-right p-2">Quantity</th>
              <th className="text-right p-2">Price</th>
              <th className="text-right p-2">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="p-2">
                  <input
                    className="w-full"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    className="w-20 text-right"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value))}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    className="w-24 text-right"
                    value={item.price}
                    onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value))}
                  />
                </td>
                <td className="p-2 text-right">
                  ${(item.quantity * item.price).toFixed(2)}
                </td>
                <td className="p-2">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div className="flex justify-end mb-8">
          <div className="text-right">
            <h3 className="text-lg font-semibold">Total: ${calculateTotal().toFixed(2)}</h3>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <button
            onClick={addItem}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Item
          </button>
          <button
            onClick={handlePrint}
            className="bg-green-500 text-white px-4 py-2 rounded-lg flex items-center"
          >
            <PrinterIcon className="h-5 w-5 mr-2" />
            Print Invoice
          </button>
        </div>
      </div>
    </div>
  );
};

export default Invoice;