import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';

const Collections = () => {
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCollections();
    }, []);

    const fetchCollections = async () => {
        try {
            const res = await api.get(API_ENDPOINTS.COLLECTIONS.LIST);
            setCollections(res.data || []);
        } catch (error) {
            toast.error('Failed to load collections');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this collection?')) return;
        try {
            await api.delete(API_ENDPOINTS.COLLECTIONS.BY_ID(id));
            toast.success('Collection deleted');
            fetchCollections();
        } catch (error) {
            toast.error('Failed to delete collection');
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading collections...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Collections</h1>
                    <p className="text-gray-500 mt-1">Manage product groupings and categories.</p>
                </div>
                <button className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
                    <Plus size={18} />
                    <span>Create Collection</span>
                </button>
            </div>

            {collections.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-xl border border-gray-200">
                    <p className="text-gray-500 mb-4">No collections found.</p>
                    <button className="text-purple-600 font-medium hover:underline">Create your first collection</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {collections.map(col => (
                        <div key={col.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
                            {col.image_url ? (
                                <img src={col.image_url} alt={col.name} className="w-full h-40 object-cover" />
                            ) : (
                                <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-gray-400">No Image</div>
                            )}
                            <div className="p-5">
                                <h3 className="font-bold text-lg text-gray-800">{col.name}</h3>
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{col.description || 'No description'}</p>
                                <div className="mt-4 flex items-center justify-between">
                                    <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-1 rounded">
                                        {col.status}
                                    </span>
                                    <div className="flex space-x-2">
                                        <button className="text-gray-400 hover:text-blue-500"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDelete(col.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Collections;
