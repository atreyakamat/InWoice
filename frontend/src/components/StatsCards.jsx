import React from 'react';
import { DollarSign, FileText, ShoppingCart, Clock } from 'lucide-react';

const StatsCards = ({ stats }) => {
    const cards = [
        { title: 'Total Revenue', value: `$${stats.revenue.toFixed(2)}`, icon: DollarSign, color: 'bg-purple-100 text-purple-600' },
        { title: 'Invoices Created', value: stats.invoices, icon: FileText, color: 'bg-blue-100 text-blue-600' },
        { title: 'Orders This Month', value: stats.orders, icon: ShoppingCart, color: 'bg-pink-100 text-pink-600' },
        { title: 'Pending Payments', value: stats.pending, icon: Clock, color: 'bg-yellow-100 text-yellow-600' },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, i) => {
                const Icon = card.icon;
                return (
                    <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
                        <div className={`p-4 rounded-full ${card.color} mr-4`}>
                            <Icon size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">{card.title}</p>
                            <h3 className="text-2xl font-bold text-gray-800">{card.value}</h3>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default StatsCards;
