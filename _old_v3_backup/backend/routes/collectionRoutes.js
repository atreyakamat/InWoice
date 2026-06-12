const express = require('express');
const router = express.Router();
const db = require('../services/sqliteService');

// Get all collections
router.get('/', (req, res) => {
    try {
        const collections = db.getCollections();
        res.json({ success: true, data: collections });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single collection
router.get('/:id', (req, res) => {
    try {
        const collection = db.getCollection(req.params.id);
        if (!collection) {
            return res.status(404).json({ success: false, error: 'Collection not found' });
        }
        res.json({ success: true, data: collection });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create collection
router.post('/', (req, res) => {
    try {
        const collection = db.addCollection(req.body);
        res.status(201).json({ success: true, data: collection });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update collection
router.put('/:id', (req, res) => {
    try {
        const updated = db.updateCollection(req.params.id, req.body);
        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete collection
router.delete('/:id', (req, res) => {
    try {
        db.deleteCollection(req.params.id);
        res.json({ success: true, message: 'Collection deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
