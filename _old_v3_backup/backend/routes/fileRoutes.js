const express = require('express');
const router = express.Router();
const db = require('../services/sqliteService');

router.get('/', (req, res) => {
    try {
        const files = db.getFiles();
        res.json({ success: true, data: files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:id', (req, res) => {
    try {
        const file = db.getFile(req.params.id);
        if (!file) return res.status(404).json({ success: false, error: 'File not found' });
        res.json({ success: true, data: file });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', (req, res) => {
    try {
        const file = db.addFile(req.body);
        res.status(201).json({ success: true, data: file });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        db.deleteFile(req.params.id);
        res.json({ success: true, message: 'File deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
