const express = require('express');
const router = express.Router();
const { getCustomers, getInvoices } = require('../services/googleSheetsService');

/**
 * Get detailed customer information
 * GET /api/customers/:email
 */
router.get('/:email', async (req, res) => {
    try {
        const customerEmail = decodeURIComponent(req.params.email);
        const customers = await getCustomers();
        const invoices = await getInvoices();
        
        const customer = customers.find(c => c.email === customerEmail);
        
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Get all invoices for this customer
        const customerInvoices = invoices.filter(inv => inv.customerEmail === customerEmail);
        
        // Calculate advanced metrics
        const paidInvoices = customerInvoices.filter(inv => inv.paymentStatus === 'Paid');
        const pendingInvoices = customerInvoices.filter(inv => inv.paymentStatus === 'Pending');
        
        const avgOrderValue = customerInvoices.length > 0 
            ? customerInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0) / customerInvoices.length 
            : 0;
        
        const totalRevenue = paidInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
        const pendingRevenue = pendingInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
        
        // Calculate days since last purchase
        const lastPurchase = customerInvoices.length > 0 
            ? new Date(Math.max(...customerInvoices.map(inv => new Date(inv.date))))
            : null;
        
        const daysSinceLastPurchase = lastPurchase 
            ? Math.floor((new Date() - lastPurchase) / (1000 * 60 * 60 * 24))
            : null;
        
        // Determine customer segment
        let segment = 'Regular';
        if (customerInvoices.length === 1) segment = 'New';
        else if (totalRevenue > 5000) segment = 'VIP';
        else if (daysSinceLastPurchase > 90) segment = 'At Risk';
        else if (customerInvoices.length > 10) segment = 'Loyal';
        
        // Sort invoices by date (newest first)
        customerInvoices.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({
            customer: {
                ...customer,
                segment,
                metrics: {
                    totalOrders: customerInvoices.length,
                    paidOrders: paidInvoices.length,
                    pendingOrders: pendingInvoices.length,
                    avgOrderValue,
                    totalRevenue,
                    pendingRevenue,
                    firstPurchase: customerInvoices.length > 0 ? customerInvoices[customerInvoices.length - 1].date : null,
                    lastPurchase: lastPurchase ? lastPurchase.toISOString().split('T')[0] : null,
                    daysSinceLastPurchase
                }
            },
            invoices: customerInvoices
        });
    } catch (error) {
        console.error('Customer Detail Error:', error);
        res.status(500).json({ error: 'Failed to fetch customer details' });
    }
});

/**
 * Get advanced analytics
 * GET /api/customers/analytics/summary
 */
router.get('/analytics/summary', async (req, res) => {
    try {
        const customers = await getCustomers();
        const invoices = await getInvoices();
        
        // Calculate advanced metrics
        const totalCustomers = customers.length;
        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.paymentStatus === 'Paid' ? inv.grandTotal : 0), 0);
        const avgCustomerValue = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
        
        // Customer segments
        const segments = {
            new: 0,
            regular: 0,
            vip: 0,
            atRisk: 0,
            loyal: 0
        };
        
        customers.forEach(customer => {
            const customerInvoices = invoices.filter(inv => inv.customerEmail === customer.email);
            const paidInvoices = customerInvoices.filter(inv => inv.paymentStatus === 'Paid');
            const totalSpent = paidInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
            
            const lastPurchase = customerInvoices.length > 0 
                ? new Date(Math.max(...customerInvoices.map(inv => new Date(inv.date))))
                : null;
            
            const daysSince = lastPurchase 
                ? Math.floor((new Date() - lastPurchase) / (1000 * 60 * 60 * 24))
                : 9999;
            
            if (customerInvoices.length === 1) segments.new++;
            else if (totalSpent > 5000) segments.vip++;
            else if (daysSince > 90) segments.atRisk++;
            else if (customerInvoices.length > 10) segments.loyal++;
            else segments.regular++;
        });
        
        // Retention rate (customers who made repeat purchases)
        const repeatCustomers = customers.filter(customer => {
            const customerInvoices = invoices.filter(inv => inv.customerEmail === customer.email);
            return customerInvoices.length > 1;
        }).length;
        
        const retentionRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
        
        // Conversion rate (paid vs total invoices)
        const paidInvoices = invoices.filter(inv => inv.paymentStatus === 'Paid').length;
        const conversionRate = invoices.length > 0 ? (paidInvoices / invoices.length) * 100 : 0;
        
        // Average days to pay
        const paidInvoicesWithDates = invoices.filter(inv => inv.paymentStatus === 'Paid' && inv.date);
        const avgDaysToPay = paidInvoicesWithDates.length > 0
            ? paidInvoicesWithDates.reduce((sum, inv) => {
                // Assume payment date is close to date for now (we don't track actual payment date)
                // This is a placeholder - in production you'd track actual payment dates
                return sum + 7; // Assume average 7 days
            }, 0) / paidInvoicesWithDates.length
            : 0;
        
        res.json({
            totalCustomers,
            totalRevenue,
            avgCustomerValue,
            retentionRate,
            conversionRate,
            avgDaysToPay,
            segments
        });
    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

module.exports = router;
