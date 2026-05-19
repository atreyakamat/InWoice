const express = require('express');
const router = express.Router();
const { getEmails, addEmail, getSettings } = require('../services/dbService');
const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;

router.get('/inbox', async (req, res) => {
    try {
        const emails = await getEmails();
        res.json(emails);
    } catch (error) {
        console.error("Error fetching inbox:", error);
        res.status(500).json({ error: "Failed to load emails." });
    }
});

router.post('/sync', async (req, res) => {
    try {
        const settings = await getSettings();
        const imapAccounts = settings.imapAccounts || [];

        if (!imapAccounts || imapAccounts.length === 0) {
            return res.status(400).json({ error: "No IMAP accounts configured. Add them in Settings." });
        }

        let totalFetched = 0;

        for (const account of imapAccounts) {
            const config = {
                imap: {
                    user: account.user,
                    password: account.password, // Use App Passwords for Gmail
                    host: account.host,
                    port: account.port || 993,
                    tls: account.tls !== false,
                    authTimeout: 10000
                }
            };

            try {
                console.log(`Connecting to IMAP for ${account.user}...`);
                const connection = await imaps.connect(config);
                await connection.openBox('INBOX');

                // Fetch emails from the last 7 days to avoid scanning entire inbox
                const delay = 7 * 24 * 3600 * 1000;
                const pastDate = new Date(Date.now() - delay);
                const searchCriteria = ['UNSEEN', ['SINCE', pastDate.toISOString()]];
                
                const fetchOptions = {
                    bodies: ['HEADER', 'TEXT'],
                    markSeen: false
                };

                const messages = await connection.search(searchCriteria, fetchOptions);

                for (const item of messages) {
                    const all = item.parts.find(p => p.which === 'TEXT');
                    const id = item.attributes.uid;
                    const idHeader = "Imap-Id: " + id + "\r\n";
                    
                    const mail = await simpleParser(idHeader + all.body);
                    
                    const newEmail = {
                        message_id: mail.messageId || `${account.user}-${id}`,
                        sender: mail.from?.text || 'Unknown',
                        recipient: mail.to?.text || account.user,
                        subject: mail.subject || 'No Subject',
                        body: mail.text || mail.html || '',
                        date: mail.date ? mail.date.toISOString() : new Date().toISOString(),
                        is_read: 0
                    };

                    const added = addEmail(newEmail);
                    if (added) totalFetched++;
                }

                connection.end();
            } catch (err) {
                console.error(`Failed to sync account ${account.user}:`, err.message);
                // Continue to next account even if one fails
            }
        }

        res.json({ success: true, message: `Synced ${totalFetched} new emails across all accounts.` });
    } catch (error) {
        console.error("IMAP Sync Error:", error);
        res.status(500).json({ error: "Failed to sync emails." });
    }
});

module.exports = router;