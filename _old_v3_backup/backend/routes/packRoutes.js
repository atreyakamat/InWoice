const express = require('express');
const router = express.Router();
const db = require('../services/sqliteService');

// Get all packs
router.get('/', (req, res) => {
    try {
        const packs = db.getPacks();
        res.json({ success: true, data: packs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single pack
router.get('/:id', (req, res) => {
    try {
        const pack = db.getPack(req.params.id);
        if (!pack) {
            return res.status(404).json({ success: false, error: 'Pack not found' });
        }
        res.json({ success: true, data: pack });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create pack
router.post('/', (req, res) => {
    try {
        const pack = db.addPack(req.body);
        res.status(201).json({ success: true, data: pack });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update pack
router.put('/:id', (req, res) => {
    try {
        const updated = db.updatePack(req.params.id, req.body);
        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete pack
router.delete('/:id', (req, res) => {
    try {
        db.deletePack(req.params.id);
        res.json({ success: true, message: 'Pack deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clone pack
router.post('/:id/clone', (req, res) => {
    try {
        const pack = db.getPack(req.params.id);
        if (!pack) {
            return res.status(404).json({ success: false, error: 'Pack not found' });
        }
        const clonedPack = {
            ...pack,
            id: undefined, // Let db generate a new ID
            name: `${pack.name} (Copy)`
        };
        const newPack = db.addPack(clonedPack);
        res.status(201).json({ success: true, data: newPack });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
