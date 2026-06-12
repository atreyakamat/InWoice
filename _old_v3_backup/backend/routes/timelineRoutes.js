const express = require('express');
const router = express.Router();
const db = require('../services/sqliteService');

router.get('/:customerId', (req, res) => {
    try {
        const timeline = db.getCustomerTimeline(req.params.customerId);
        res.json({ success: true, data: timeline });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', (req, res) => {
    try {
        const event = db.addTimelineEvent(req.body);
        res.status(201).json({ success: true, data: event });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
