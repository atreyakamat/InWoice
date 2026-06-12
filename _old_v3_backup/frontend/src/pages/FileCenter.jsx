import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import { File, Search, Download, Trash2, Clock } from 'lucide-react';
import { toast } from 'react-toastify';

const FileCenter = () => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchFiles();
    }, []);

    const fetchFiles = async () => {
        try {
            const res = await api.get(API_ENDPOINTS.FILES.LIST);
            setFiles(res.data || []);
        } catch (error) {
            toast.error('Failed to load files');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this file?')) return;
        try {
            await api.delete(API_ENDPOINTS.FILES.BY_ID(id));
            toast.success('File deleted');
            fetchFiles();
        } catch (error) {
            toast.error('Failed to delete file');
        }
    };

    const filteredFiles = files.filter(f => 
        f.original_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.reference_type?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatBytes = (bytes) => {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">File Center</h1>
                    <p className="text-gray-500 mt-1">Centralized repository for invoices, exports, and documents.</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search files..." 
                        className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-purple-500 w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading files...</div>
                ) : filteredFiles.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">No files found.</div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
                                <th className="p-4 font-medium">Filename</th>
                                <th className="p-4 font-medium">Type</th>
                                <th className="p-4 font-medium">Size</th>
                                <th className="p-4 font-medium">Date</th>
                                <th className="p-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredFiles.map(file => (
                                <tr key={file.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                                    <td className="p-4 flex items-center space-x-3">
                                        <File className="text-purple-500" size={20} />
                                        <span className="font-medium text-gray-800">{file.original_name}</span>
                                    </td>
                                    <td className="p-4 text-sm text-gray-600 capitalize">{file.reference_type || 'Document'}</td>
                                    <td className="p-4 text-sm text-gray-600">{formatBytes(file.size)}</td>
                                    <td className="p-4 text-sm text-gray-600">
                                        <div className="flex items-center space-x-1">
                                            <Clock size={14} className="text-gray-400" />
                                            <span>{new Date(file.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right space-x-3">
                                        <a href={`http://localhost:5000/${file.path}`} download className="text-gray-400 hover:text-blue-500 inline-block" title="Download">
                                            <Download size={18} />
                                        </a>
                                        <button onClick={() => handleDelete(file.id)} className="text-gray-400 hover:text-red-500" title="Delete">
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default FileCenter;
