const express = require('express');
const router = express.Router();
const { getProducts, addProduct, deleteProduct } = require('../services/googleSheetsService');
const { productSchema } = require('../utils/validation');

router.get('/', async (req, res) => {
    try {
        const products = await getProducts();
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

router.post('/', async (req, res) => {
    try {
        const validation = productSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Validation failed', details: validation.error.format() });
        }
        const product = await addProduct(validation.data);
        res.status(201).json({ message: 'Product added', product });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add product' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await deleteProduct(req.params.id);
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

module.exports = router;