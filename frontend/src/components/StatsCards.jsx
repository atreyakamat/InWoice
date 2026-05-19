import React from 'react';
import { DollarSign, FileText, Clock, TrendingUp, Users } from 'lucide-react';

const StatsCards = ({ stats }) => {
    const cards = [
        { title: 'Total Revenue', value: `$${stats.revenue.toFixed(2)}`, icon: DollarSign, color: 'bg-purple-100 text-purple-600' },
        { title: 'Invoices Created', value: stats.invoices, icon: FileText, color: 'bg-blue-100 text-blue-600' },
        { title: 'Avg Order Value', value: `$${(stats.avgOrderValue || 0).toFixed(2)}`, icon: TrendingUp, color: 'bg-green-100 text-green-600' },
        { title: 'Pending Payments', value: stats.pending, icon: Clock, color: 'bg-yellow-100 text-yellow-600' },
        { title: 'Total Customers', value: stats.totalCustomers || 0, icon: Users, color: 'bg-pink-100 text-pink-600' },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {cards.map((card, i) => {
                const Icon = card.icon;
                return (
                    <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center hover:scale-[1.02] transition-transform cursor-default">
                        <div className={`p-4 rounded-full ${card.color} mr-4`}>
                            <Icon size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">{card.title}</p>
                            <h3 className="text-xl font-black text-gray-800">{card.value}</h3>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default StatsCards;
