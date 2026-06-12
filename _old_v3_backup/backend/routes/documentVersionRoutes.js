const express = require('express');
const router = express.Router();
const db = require('../services/sqliteService');

router.get('/:invoiceId', (req, res) => {
    try {
        const versions = db.getDocumentVersions(req.params.invoiceId);
        res.json({ success: true, data: versions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', (req, res) => {
    try {
        const version = db.addDocumentVersion(req.body);
        res.status(201).json({ success: true, data: version });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
