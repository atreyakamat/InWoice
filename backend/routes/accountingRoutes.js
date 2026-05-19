const express = require('express');
const router = express.Router();
const { getAccounts, addAccount, getJournalEntries, addJournalEntry } = require('../services/dbService');

router.get('/accounts', async (req, res) => {
    const accounts = await getAccounts();
    res.json(accounts);
});

router.post('/accounts', async (req, res) => {
    const account = await addAccount(req.body);
    res.json(account);
});

router.get('/journal', async (req, res) => {
    const entries = await getJournalEntries();
    res.json(entries);
});

router.post('/journal', async (req, res) => {
    const id = await addJournalEntry(req.body);
    res.json({ id });
});

module.exports = router;