const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (password === adminPassword) {
        // In a real app, you'd use JWT. For homelab, we'll return a success flag.
        return res.json({ success: true, token: 'homelab-secure-token' });
    }

    res.status(401).json({ error: 'Invalid password' });
});

module.exports = router;
