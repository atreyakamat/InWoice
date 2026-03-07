const { z } = require('zod');

const itemSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    variant: z.string().optional(),
    quantity: z.number().positive(),
    price: z.number().nonnegative(),
    total: z.number().nonnegative()
});

const invoiceSchema = z.object({
    date: z.string(),
    dueDate: z.string().optional().or(z.literal('')),
    paymentStatus: z.enum(['Paid', 'Pending']),
    paymentMethod: z.enum(['UPI', 'Bank Transfer', 'Cash', 'Card']),
    customerName: z.string().min(1),
    customerEmail: z.string().email().or(z.literal('')),
    customerPhone: z.string().optional(),
    shippingAddress: z.string().optional(),
    instagramHandle: z.string().optional(),
    notes: z.string().optional(),
    discount: z.number().nonnegative().default(0),
    shipping: z.number().nonnegative().default(0),
    tax: z.number().nonnegative().default(0),
    itemsJSON: z.string(), // We validate it's parseable JSON containing items
    subtotal: z.number().nonnegative(),
    grandTotal: z.number().nonnegative()
});

const productSchema = z.object({
    name: z.string().min(1),
    category: z.string().optional(),
    price: z.number().positive()
});

module.exports = {
    invoiceSchema,
    productSchema,
    itemSchema
};
