import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS, API_BASE_URL } from '../apiConfig';
import { Plus, Trash2, Image as ImageIcon } from 'lucide-react';

const Products = () => {
    const [products, setProducts] = useState([]);
    const [newProduct, setNewProduct] = useState({ name: '', category: '', price: 0, image: '' });

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            const res = await api.get(API_ENDPOINTS.PRODUCTS);
            setProducts(res);
        } catch (err) {
            console.error(err);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('image', file);
            
            try {
                const res = await api.post(API_ENDPOINTS.UPLOAD, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });
                setNewProduct(prev => ({ ...prev, image: res.imageUrl }));
            } catch (err) {
                console.error('Upload failed:', err);
                alert('Failed to upload image.');
            }
        }
    };

    const handleAdd = async () => {
        if (!newProduct.name || newProduct.price <= 0) {
            alert('Please enter a valid name and price.');
            return;
        }
        try {
            await api.post(API_ENDPOINTS.PRODUCTS, newProduct);
            setNewProduct({ name: '', category: '', price: 0, image: '' });
            fetchProducts();
        } catch (error) {
            console.error(error);
            alert('Failed to add product');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            await api.delete(API_ENDPOINTS.PRODUCT_BY_ID(id));
            fetchProducts();
        } catch (error) {
            console.error(error);
            alert('Failed to delete product');
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Product Library</h1>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
                <h2 className="text-lg font-bold mb-4 text-purple-700">Add New Product</h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                        <div className="flex items-center space-x-2">
                            {newProduct.image ? (
                                <img src={`${API_BASE_URL}${newProduct.image}`} alt="Preview" className="h-10 w-10 object-cover rounded border" />
                            ) : (
                                <div className="h-10 w-10 bg-gray-100 rounded border flex items-center justify-center text-gray-400">
                                    <ImageIcon size={20} />
                                </div>
                            )}
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="product-image-upload" />
                            <label htmlFor="product-image-upload" className="px-2 py-1 bg-gray-100 text-xs rounded border cursor-pointer hover:bg-gray-200">
                                Upload
                            </label>
                        </div>
                    </div>
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
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600 w-16">Image</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Product Name</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Category</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Price</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {products.map((product) => (
                            <tr key={product.id} className="hover:bg-gray-50 transition">
                                <td className="px-6 py-4">
                                    {product.image ? (
                                        <img src={`${API_BASE_URL}${product.image}`} alt={product.name} className="h-10 w-10 object-cover rounded border" />
                                    ) : (
                                        <div className="h-10 w-10 bg-gray-50 rounded border flex items-center justify-center text-gray-300">
                                            <ImageIcon size={16} />
                                        </div>
                                    )}
                                </td>
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
                                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No products found. Create some above!</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Products;