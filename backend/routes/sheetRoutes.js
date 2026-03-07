const express = require('express');
const router = express.Router();
const { getCustomers, getSettings, updateSettings } = require('../services/googleSheetsService');

router.get('/customers', async (req, res) => {
    try {
        const customers = await getCustomers();
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

router.get('/settings', async (req, res) => {
    try {
        const settings = await getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const updatedSettings = await updateSettings(req.body);
        res.json({ message: 'Settings updated successfully', settings: updatedSettings });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;