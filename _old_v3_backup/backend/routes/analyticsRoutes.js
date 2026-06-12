const express = require('express');
const router = express.Router();
const { getInvoices, getCustomers, getSettings } = require('../services/dbService');

router.get('/', async (req, res) => {
    try {
        const invoices = await getInvoices();
        const settings = await getSettings();

        // Sort invoices by date
        invoices.sort((a, b) => new Date(a.date) - new Date(b.date));

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        let totalRevenue = 0;
        let revenueThisMonth = 0;
        let revenueLastMonth = 0;
        let totalItemsSold = 0;
        const customers = {};
        const products = {};
        const dailyRevenue = {};
        const monthlyRevenue = {};
        const paymentMethods = {};
        const paymentStatuses = {};

        invoices.forEach(inv => {
            const date = new Date(inv.date);
            const amount = parseFloat(inv.grandTotal) || 0;
            totalRevenue += amount;

            if (date >= startOfMonth) revenueThisMonth += amount;
            else if (date >= startOfLastMonth && date < startOfMonth) revenueLastMonth += amount;

            // Daily Revenue
            const dayKey = date.toISOString().split('T')[0];
            dailyRevenue[dayKey] = (dailyRevenue[dayKey] || 0) + amount;

            // Monthly Revenue
            const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });
            monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + amount;

            // Customers
            const customerKey = inv.customerName || 'Unknown';
            if (!customers[customerKey]) customers[customerKey] = { name: customerKey, spent: 0, count: 0 };
            customers[customerKey].spent += amount;
            customers[customerKey].count += 1;

            // Payment Analysis
            paymentMethods[inv.paymentMethod] = (paymentMethods[inv.paymentMethod] || 0) + 1;
            paymentStatuses[inv.paymentStatus] = (paymentStatuses[inv.paymentStatus] || 0) + 1;

            // Products Analysis
            try {
                const items = typeof inv.itemsJSON === 'string' ? JSON.parse(inv.itemsJSON) : inv.itemsJSON;
                if (Array.isArray(items)) {
                    items.forEach(item => {
                        const qty = parseInt(item.quantity) || 0;
                        const itemTotal = parseFloat(item.total) || 0;
                        totalItemsSold += qty;
                        if (!products[item.name]) products[item.name] = { name: item.name, sold: 0, revenue: 0 };
                        products[item.name].sold += qty;
                        products[item.name].revenue += itemTotal;
                    });
                }
            } catch(e) {}
        });

        // Advanced Metrics
        const momGrowth = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : 0;
        const avgOrderValue = invoices.length > 0 ? totalRevenue / invoices.length : 0;

        // Top 5 Customers
        const topCustomers = Object.values(customers)
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 5);

        // Top 5 Products
        const topProducts = Object.values(products)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        // Daily Revenue - Last 30 Days
        const last30Days = Object.keys(dailyRevenue)
            .sort()
            .slice(-30)
            .map(k => ({ date: k, revenue: dailyRevenue[k] }));

        res.json({
            summary: {
                totalRevenue,
                revenueThisMonth,
                revenueLastMonth,
                momGrowth,
                avgOrderValue,
                totalItemsSold,
                totalInvoices: invoices.length
            },
            trends: {
                daily: last30Days,
                monthly: Object.keys(monthlyRevenue).map(k => ({ name: k, revenue: monthlyRevenue[k] }))
            },
            distributions: {
                customers: topCustomers,
                products: topProducts,
                paymentMethods,
                paymentStatuses
            },
            settings
        });
    } catch (err) {
        console.error('Analytics Error:', err);
        res.status(500).json({ error: 'Failed to generate analytics' });
    }
});

module.exports = router;
