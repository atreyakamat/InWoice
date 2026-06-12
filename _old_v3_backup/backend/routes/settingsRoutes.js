const express = require('express');
const router = express.Router();
const db = require('../services/sqliteService');

// Get Business Settings
router.get('/', (req, res) => {
    try {
        const settings = db.getBusinessSettings();
        const settingsObj = settings.reduce((acc, curr) => {
            acc[curr.id] = curr;
            return acc;
        }, {});
        // Since it's a single business setting row usually, we can just return the first or default
        res.json({ success: true, data: settings[0] || {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Business Settings
router.put('/', (req, res) => {
    try {
        const id = req.body.id || 'default';
        const updated = db.updateBusinessSettings(id, req.body);
        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
