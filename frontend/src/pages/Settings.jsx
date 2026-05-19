import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS, API_BASE_URL } from '../apiConfig';
import { Plus, Trash2 } from 'lucide-react';

const Settings = () => {
    const [isTestingSmtp, setIsTestingSmtp] = useState(false);
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
        smtpPass: '',
        imapAccounts: []
    });

    const smtpConfigured = !!(settings.smtpHost && settings.smtpUser && settings.smtpPass);
    const imapConfigured = Array.isArray(settings.imapAccounts) && settings.imapAccounts.length > 0;

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await api.get(API_ENDPOINTS.DATA_SETTINGS);
                if (res) {
                    setSettings(prev => ({ ...prev, ...res, imapAccounts: res.imapAccounts || [] }));
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

    const handleImapChange = (index, field, value) => {
        const updatedAccounts = [...settings.imapAccounts];
        updatedAccounts[index][field] = value;
        setSettings(prev => ({ ...prev, imapAccounts: updatedAccounts }));
    };

    const addImapAccount = () => {
        setSettings(prev => ({
            ...prev,
            imapAccounts: [...prev.imapAccounts, { host: 'imap.gmail.com', port: '993', user: '', password: '', tls: true }]
        }));
    };

    const removeImapAccount = (index) => {
        const updatedAccounts = settings.imapAccounts.filter((_, i) => i !== index);
        setSettings(prev => ({ ...prev, imapAccounts: updatedAccounts }));
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
                setSettings(prev => ({ ...prev, logo: res.imageUrl }));
            } catch (err) {
                console.error('Upload failed:', err);
                alert('Failed to upload image.');
            }
        }
    };

    const handleSave = async () => {
        try {
            await api.post(API_ENDPOINTS.DATA_SETTINGS, settings);
            alert('Settings saved successfully!');
        } catch (error) {
            console.error(error);
            alert('Failed to save settings.');
        }
    };

    const handleTestSmtp = async () => {
        setIsTestingSmtp(true);
        try {
            const res = await api.post(API_ENDPOINTS.EMAIL_TEST, settings);
            alert(res.message || 'SMTP Connection Successful!');
        } catch (error) {
            console.error(error);
            alert(error.message || 'SMTP Test Failed.');
        } finally {
            setIsTestingSmtp(false);
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
                            <img src={settings.logo.startsWith('http') || settings.logo.startsWith('data:') ? settings.logo : `${API_BASE_URL}${settings.logo}`} alt="Business Logo" className="h-12 w-12 object-contain border rounded p-1" />
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

            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 mb-8">
                <div className="flex justify-between items-center border-b pb-2 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Outgoing Mail (SMTP)</h2>
                        <p className="text-sm text-gray-500">Configure SMTP settings to send invoices directly to customers.</p>
                        <p className={`text-xs font-semibold mt-2 ${smtpConfigured ? 'text-green-600' : 'text-red-500'}`}>
                            Status: {smtpConfigured ? 'Configured' : 'Not Configured'}
                        </p>
                    </div>
                    <button 
                        onClick={handleTestSmtp} 
                        disabled={!smtpConfigured || isTestingSmtp}
                        className={`flex items-center space-x-1 text-sm px-3 py-1.5 rounded-lg transition ${
                            (!smtpConfigured || isTestingSmtp) 
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                    >
                        <span>{isTestingSmtp ? 'Testing...' : 'Test Connection'}</span>
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                        <input type="text" name="smtpHost" value={settings.smtpHost} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                        <input type="text" name="smtpPort" value={settings.smtpPort} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username (Email)</label>
                        <input type="text" name="smtpUser" value={settings.smtpUser} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password (App Password)</label>
                        <input type="password" name="smtpPass" value={settings.smtpPass} onChange={handleChange} className="w-full p-2 border rounded-lg outline-none focus:border-purple-500" />
                    </div>
                </div>
            </div>
            
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center border-b pb-2 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Incoming Mail (IMAP)</h2>
                        <p className="text-sm text-gray-500">Configure IMAP to view multiple email accounts in the Inbox.</p>
                        <p className={`text-xs font-semibold mt-2 ${imapConfigured ? 'text-green-600' : 'text-red-500'}`}>
                            Status: {imapConfigured ? 'Configured' : 'Not Configured'}
                        </p>
                    </div>
                    <button onClick={addImapAccount} className="flex items-center space-x-1 text-sm bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-200 transition">
                        <Plus size={16} /> <span>Add Account</span>
                    </button>
                </div>
                
                {settings.imapAccounts.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No IMAP accounts configured.</p>
                ) : (
                    <div className="space-y-6">
                        {settings.imapAccounts.map((account, index) => (
                            <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50 relative group">
                                <button 
                                    onClick={() => removeImapAccount(index)}
                                    className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
                                >
                                    <Trash2 size={18} />
                                </button>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-8">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">IMAP Host (e.g. imap.gmail.com)</label>
                                        <input type="text" value={account.host} onChange={(e) => handleImapChange(index, 'host', e.target.value)} className="w-full p-2 text-sm border rounded outline-none focus:border-purple-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
                                        <input type="text" value={account.port} onChange={(e) => handleImapChange(index, 'port', e.target.value)} className="w-full p-2 text-sm border rounded outline-none focus:border-purple-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
                                        <input type="email" value={account.user} onChange={(e) => handleImapChange(index, 'user', e.target.value)} className="w-full p-2 text-sm border rounded outline-none focus:border-purple-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">App Password</label>
                                        <input type="password" value={account.password} onChange={(e) => handleImapChange(index, 'password', e.target.value)} className="w-full p-2 text-sm border rounded outline-none focus:border-purple-500" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Settings;
