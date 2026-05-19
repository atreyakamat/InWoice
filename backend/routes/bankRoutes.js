const express = require('express');
const router = express.Router();
const { getBankTransactions, addBankTransaction } = require('../services/dbService');

router.get('/', async (req, res) => {
    const txns = await getBankTransactions();
    res.json(txns);
});

router.post('/', async (req, res) => {
    const txn = await addBankTransaction(req.body);
    res.json(txn);
});

module.exports = router;