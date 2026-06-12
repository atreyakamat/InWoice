const express = require('express');
const router = express.Router();
const db = require('../services/sqliteService');

router.get('/', (req, res) => {
    try {
        const settings = db.getAiSettings();
        // Hide API key on the frontend
        const safeSettings = { ...settings, openrouter_api_key: settings.openrouter_api_key ? '********' : '' };
        res.json({ success: true, data: safeSettings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/', (req, res) => {
    try {
        // If the user sent asterisks, they didn't change the key, so don't update it
        const updates = { ...req.body };
        if (updates.openrouter_api_key === '********') {
            delete updates.openrouter_api_key;
        }
        
        const updated = db.updateAiSettings(updates);
        const safeSettings = { ...updated, openrouter_api_key: updated.openrouter_api_key ? '********' : '' };
        res.json({ success: true, data: safeSettings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// AI Conversations
router.get('/conversations', (req, res) => {
    try {
        res.json({ success: true, data: db.getAiConversations() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/conversations/:id', (req, res) => {
    try {
        res.json({ success: true, data: db.getAiConversation(req.params.id) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
