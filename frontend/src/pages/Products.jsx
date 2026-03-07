import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2 } from 'lucide-react';

const Products = () => {
    const [products, setProducts] = useState([]);
    const [newProduct, setNewProduct] = useState({ name: '', category: '', price: 0 });

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/products');
            setProducts(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAdd = async () => {
        if (!newProduct.name || newProduct.price <= 0) {
            alert('Please enter a valid name and price.');
            return;
        }
        try {
            await axios.post('http://localhost:5000/api/products', newProduct);
            setNewProduct({ name: '', category: '', price: 0 });
            fetchProducts();
        } catch (error) {
            console.error(error);
            alert('Failed to add product');
        }
    };

    const handleDelete = async (id) => {
        try {
            await axios.delete(`http://localhost:5000/api/products/${id}`);
            fetchProducts();
        } catch (error) {
            console.error(error);
            alert('Failed to delete product');
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Product Library</h1>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
                <h2 className="text-lg font-bold mb-4 text-purple-700">Add New Product</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input type="text" placeholder="e.g., Holographic Sticker" value={newProduct.name} onChange={(e) => setNewProduct({...newProduct, name: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500 bg-gray-50 focus:bg-white" />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <input type="text" placeholder="e.g., Packs" value={newProduct.category} onChange={(e) => setNewProduct({...newProduct, category: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500 bg-gray-50 focus:bg-white" />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Default Price</label>
                        <input type="number" min="0" value={newProduct.price} onChange={(e) => setNewProduct({...newProduct, price: parseFloat(e.target.value)})} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500 bg-gray-50 focus:bg-white" />
                    </div>
                    <div className="md:col-span-1">
                        <button onClick={handleAdd} className="w-full flex justify-center items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold transition-colors">
                            <Plus size={18} className="mr-2" /> Add
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Product Name</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Category</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Price</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {products.map((product) => (
                            <tr key={product.id} className="hover:bg-gray-50 transition">
                                <td className="px-6 py-4 text-sm font-medium text-gray-800">{product.name}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{product.category || '-'}</td>
                                <td className="px-6 py-4 text-sm font-medium text-gray-800">${product.price.toFixed(2)}</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => handleDelete(product.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition">
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {products.length === 0 && (
                            <tr>
                                <td colSpan="4" className="px-6 py-8 text-center text-gray-500">No products found. Create some above!</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Products;