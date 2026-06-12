import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import { Plus, Edit2, Trash2, Copy } from 'lucide-react';
import { toast } from 'react-toastify';

const Packs = () => {
    const [packs, setPacks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPacks();
    }, []);

    const fetchPacks = async () => {
        try {
            const res = await api.get(API_ENDPOINTS.PACKS.LIST);
            setPacks(res.data || []);
        } catch (error) {
            toast.error('Failed to load packs');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this pack?')) return;
        try {
            await api.delete(API_ENDPOINTS.PACKS.BY_ID(id));
            toast.success('Pack deleted');
            fetchPacks();
        } catch (error) {
            toast.error('Failed to delete pack');
        }
    };

    const handleClone = async (id) => {
        try {
            await api.post(API_ENDPOINTS.PACKS.CLONE(id));
            toast.success('Pack cloned successfully');
            fetchPacks();
        } catch (error) {
            toast.error('Failed to clone pack');
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading packs...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Packs & Bundles</h1>
                    <p className="text-gray-500 mt-1">Manage commercial product bundles.</p>
                </div>
                <button className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
                    <Plus size={18} />
                    <span>Create Pack</span>
                </button>
            </div>

            {packs.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-xl border border-gray-200">
                    <p className="text-gray-500 mb-4">No packs found.</p>
                    <button className="text-purple-600 font-medium hover:underline">Create your first pack</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {packs.map(pack => (
                        <div key={pack.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
                            <div className="p-5 border-b border-gray-50">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-lg text-gray-800">{pack.name}</h3>
                                    <span className="text-lg font-bold text-purple-600">₹{pack.price}</span>
                                </div>
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{pack.description || 'No description'}</p>
                            </div>
                            <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                                <span className={`text-xs font-medium px-2 py-1 rounded ${pack.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                                    {pack.status}
                                </span>
                                <div className="flex space-x-2">
                                    <button onClick={() => handleClone(pack.id)} className="text-gray-400 hover:text-green-500" title="Clone"><Copy size={16} /></button>
                                    <button className="text-gray-400 hover:text-blue-500" title="Edit"><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(pack.id)} className="text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Packs;
