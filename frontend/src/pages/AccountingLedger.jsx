import React, { useState, useEffect } from 'react';
import { BookOpen, DollarSign, FileText, TrendingUp, Download } from 'lucide-react';
import { toast } from 'react-toastify';
import { api, API_ENDPOINTS, default as apiClient } from '../apiConfig';

const AccountingLedger = () => {
    const [accounts, setAccounts] = useState([]);
    const [journalEntries, setJournalEntries] = useState([]);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const accountsData = await api.get(`${API_ENDPOINTS.API_BASE_URL || 'http://localhost:5000'}/api/accounting/accounts`);
            const journalData = await api.get(`${API_ENDPOINTS.API_BASE_URL || 'http://localhost:5000'}/api/accounting/journal`);
            setAccounts(accountsData || []);
            setJournalEntries(journalData || []);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load accounting data.");
        } finally {
            setIsLoading(false);
        }
    };

    const normalizedBalance = (account) => {
        if (!account) return 0;
        const raw = Number(account.balance) || 0;
        if (account.type === 'Asset' || account.type === 'Expense') return raw;
        return raw * -1;
    };

    const downloadReport = async (url, filename) => {
        try {
            const res = await apiClient.get(url, { responseType: 'blob' });
            const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error(error);
            toast.error('Failed to download report.');
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Accounting Ledger</h1>
                    <p className="text-sm text-gray-500 mt-1">Double-entry bookkeeping and tax compliance</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => downloadReport(API_ENDPOINTS.ACCOUNTING_REPORTS.GSTR1, `gstr1-${Date.now()}.csv`)} className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                        <Download size={16} />
                        <span>Export GSTR-1</span>
                    </button>
                    <button onClick={() => downloadReport(API_ENDPOINTS.ACCOUNTING_REPORTS.GSTR2, `gstr2-${Date.now()}.csv`)} className="flex items-center space-x-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium">
                        <Download size={16} />
                        <span>Export GSTR-2</span>
                    </button>
                    <button onClick={() => downloadReport(API_ENDPOINTS.ACCOUNTING_REPORTS.GSTR3B, `gstr3b-${Date.now()}.csv`)} className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium">
                        <Download size={16} />
                        <span>Export GSTR-3B</span>
                    </button>
                    <button onClick={() => downloadReport(API_ENDPOINTS.ACCOUNTING_REPORTS.TRIAL_BALANCE, `trial-balance-${Date.now()}.csv`)} className="flex items-center space-x-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-black transition-colors text-sm font-medium">
                        <Download size={16} />
                        <span>Trial Balance</span>
                    </button>
                    <button onClick={() => downloadReport(API_ENDPOINTS.ACCOUNTING_REPORTS.PROFIT_LOSS, `profit-loss-${Date.now()}.csv`)} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                        <Download size={16} />
                        <span>P&amp;L</span>
                    </button>
                    <button onClick={() => downloadReport(API_ENDPOINTS.ACCOUNTING_REPORTS.BALANCE_SHEET, `balance-sheet-${Date.now()}.csv`)} className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium">
                        <Download size={16} />
                        <span>Balance Sheet</span>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex space-x-1 mb-6 bg-gray-200 p-1 rounded-lg w-max">
                <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'dashboard' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Overview</button>
                <button onClick={() => setActiveTab('accounts')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'accounts' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Chart of Accounts</button>
                <button onClick={() => setActiveTab('journal')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'journal' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Journal Entries</button>
            </div>

            {isLoading ? (
                <div className="text-center p-12 text-gray-500">Loading accounting data...</div>
            ) : (
                <>
                    {activeTab === 'dashboard' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Summary Cards */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-gray-700">Total Assets</h3>
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><DollarSign size={20} /></div>
                                </div>
                                <p className="text-2xl font-bold text-gray-800">
                                    ${accounts.filter(a => a.type === 'Asset').reduce((sum, a) => sum + normalizedBalance(a), 0).toFixed(2)}
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-gray-700">Total Liabilities</h3>
                                    <div className="p-2 bg-red-50 text-red-600 rounded-lg"><TrendingUp size={20} /></div>
                                </div>
                                <p className="text-2xl font-bold text-gray-800">
                                    ${accounts.filter(a => a.type === 'Liability').reduce((sum, a) => sum + normalizedBalance(a), 0).toFixed(2)}
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-gray-700">Equity</h3>
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><BookOpen size={20} /></div>
                                </div>
                                <p className="text-2xl font-bold text-gray-800">
                                    ${accounts.filter(a => a.type === 'Equity').reduce((sum, a) => sum + normalizedBalance(a), 0).toFixed(2)}
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'accounts' && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                                        <th className="p-4 font-medium">Account Name</th>
                                        <th className="p-4 font-medium">Type</th>
                                        <th className="p-4 font-medium text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {accounts.length === 0 ? (
                                        <tr><td colSpan="3" className="p-8 text-center text-gray-500">No accounts configured.</td></tr>
                                    ) : accounts.map((acc) => (
                                        <tr key={acc.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-medium text-gray-800">{acc.name}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium
                                                    ${acc.type === 'Asset' ? 'bg-blue-100 text-blue-700' : ''}
                                                    ${acc.type === 'Liability' ? 'bg-red-100 text-red-700' : ''}
                                                    ${acc.type === 'Equity' ? 'bg-purple-100 text-purple-700' : ''}
                                                    ${acc.type === 'Revenue' ? 'bg-green-100 text-green-700' : ''}
                                                    ${acc.type === 'Expense' ? 'bg-orange-100 text-orange-700' : ''}
                                                `}>
                                                    {acc.type}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-mono font-medium">${normalizedBalance(acc).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'journal' && (
                        <div className="space-y-6">
                            {journalEntries.length === 0 ? (
                                <div className="bg-white p-8 rounded-xl text-center text-gray-500 border border-gray-200">
                                    <FileText className="mx-auto mb-2 text-gray-300" size={32} />
                                    <p>No journal entries found.</p>
                                </div>
                            ) : journalEntries.map((entry) => (
                                <div key={entry.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center text-sm">
                                        <div>
                                            <span className="font-semibold text-gray-700 mr-4">{new Date(entry.date).toLocaleDateString()}</span>
                                            <span className="text-gray-500">{entry.description}</span>
                                        </div>
                                        <span className="text-xs text-gray-400">Ref: {entry.reference_id || 'N/A'}</span>
                                    </div>
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 text-gray-500 text-xs">
                                                <th className="p-3 font-medium">Account</th>
                                                <th className="p-3 font-medium text-right">Debit</th>
                                                <th className="p-3 font-medium text-right">Credit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {entry.lines && entry.lines.map((line) => {
                                                const acc = accounts.find(a => a.id === line.account_id);
                                                return (
                                                    <tr key={line.id}>
                                                        <td className="p-3">{acc ? acc.name : line.account_id}</td>
                                                        <td className="p-3 text-right font-mono text-gray-700">{line.debit > 0 ? `$${line.debit.toFixed(2)}` : '-'}</td>
                                                        <td className="p-3 text-right font-mono text-gray-700">{line.credit > 0 ? `$${line.credit.toFixed(2)}` : '-'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AccountingLedger;
