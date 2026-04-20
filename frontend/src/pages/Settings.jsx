import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Settings = () => {
    const [settings, setSettings] = useState({
        businessName: '',
        email: '',
        phone: '',
        address: '',
        website: '',
        upiId: '',
        logo: '',
        defaultCurrency: '$',
        taxPercent: 0,
        smtpHost: '',
        smtpPort: '587',
        smtpUser: '',
        smtpPass: ''
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get('http://localhost:5000/api/data/settings', {
                    headers: { Authorization: localStorage.getItem('token') }
                });
                if (res.data) {
                    setSettings(prev => ({ ...prev, ...res.data }));
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSettings(prev => ({ ...prev, logo: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        try {
            await axios.post('http://localhost:5000/api/data/settings', settings, {
                headers: { Authorization: localStorage.getItem('token') }
            });
            alert('Settings saved successfully!');
        } catch (error) {
            console.error(error);
            alert('Failed to save settings.');
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Settings</h1>
                <button onClick={handleSave} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition">
                    Save Changes
                </button>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 mb-8">
                <div className="flex justify-between items-center border-b pb-2 mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Business Details</h2>
                    <div className="flex items-center space-x-4">
                        {settings.logo && (
                            <img src={settings.logo} alt="Business Logo" className="h-12 w-12 object-contain border rounded p-1" />
                        )}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Business Logo</label>
                            <input type="file" accept="image/*" onChange={handleFileChange} className="text-xs" />
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                        <input type="text" name="businessName" value={settings.businessName} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" name="email" value={settings.email} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input type="text" name="phone" value={settings.phone} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Website / Instagram</label>
                        <input type="text" name="website" value={settings.website} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID (For Payment QR Code)</label>
                        <input type="text" name="upiId" placeholder="e.g., yourname@bank" value={settings.upiId} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea name="address" value={settings.address} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" rows="2"></textarea>
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 mb-8">
                <h2 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">Invoice Defaults</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Default Currency Symbol</label>
                        <input type="text" name="defaultCurrency" value={settings.defaultCurrency} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Default Tax %</label>
                        <input type="number" name="taxPercent" value={settings.taxPercent} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">Email SMTP Configuration</h2>
                <p className="text-sm text-gray-500 mb-6">Configure SMTP settings to send invoices directly to customers via email.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host (e.g., smtp.gmail.com)</label>
                        <input type="text" name="smtpHost" value={settings.smtpHost} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                        <input type="text" name="smtpPort" value={settings.smtpPort} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Username (Email)</label>
                        <input type="text" name="smtpUser" value={settings.smtpUser} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password (App Password)</label>
                        <input type="password" name="smtpPass" value={settings.smtpPass} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
