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
    discount: z.coerce.number().nonnegative().default(0),
    shipping: z.coerce.number().nonnegative().default(0),
    tax: z.coerce.number().nonnegative().default(0),
    cgst: z.coerce.number().nonnegative().default(0),
    sgst: z.coerce.number().nonnegative().default(0),
    igst: z.coerce.number().nonnegative().default(0),
    tds: z.coerce.number().nonnegative().default(0),
    hsn_sac: z.string().optional().or(z.literal('')),
    itemsJSON: z.string(), // We validate it's parseable JSON containing items
    subtotal: z.coerce.number().nonnegative(),
    grandTotal: z.coerce.number().nonnegative()
});

const productSchema = z.object({
    name: z.string().min(1),
    category: z.string().optional(),
    price: z.number().positive(),
    image: z.string().optional()
});

/**
 * Middleware to validate request body against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 */
const validate = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body);
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: error.errors.map(e => ({
                    path: e.path.join('.'),
                    message: e.message
                }))
            });
        }
        next(error);
    }
};

module.exports = {
    invoiceSchema,
    productSchema,
    itemSchema,
    validate
};
