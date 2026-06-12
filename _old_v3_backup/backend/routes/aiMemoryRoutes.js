const express = require('express');
const router = express.Router();
const db = require('../services/sqliteService');

router.get('/:entityType/:entityId', (req, res) => {
    try {
        const memories = db.getAiMemories(req.params.entityType, req.params.entityId);
        res.json({ success: true, data: memories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', (req, res) => {
    try {
        const memory = db.addAiMemory(req.body);
        res.status(201).json({ success: true, data: memory });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
