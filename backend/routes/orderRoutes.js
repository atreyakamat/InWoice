const express = require('express');
const router = express.Router();
const { getOrders, addOrder, updateOrderStatus, deleteOrder } = require('../services/dbService');
const axios = require('axios');

router.get('/', async (req, res) => {
    try {
        const orders = await getOrders();
        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch orders.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const order = await addOrder(req.body);
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create order.' });
    }
});

router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updated = await updateOrderStatus(req.params.id, status);
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update order status.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await deleteOrder(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete order.' });
    }
});

/**
 * Webhook for WhatsApp integration (Simulated)
 * This endpoint can be used as a callback URL for Meta WhatsApp Business API
 */
router.post('/webhook', async (req, res) => {
    try {
        // Log the incoming message for debugging
        console.log('[WhatsApp Webhook] Incoming:', JSON.stringify(req.body));
        
        // This is where you'd extract the message text from the WhatsApp payload
        // Meta's structure is deep: entry[0].changes[0].value.messages[0].text.body
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        
        if (message && message.text) {
            const sender = message.from; // WhatsApp ID
            const text = message.text.body;
            
            // Forward to AI for extraction
            // In a real app, you might do this asynchronously
            const id = `wa_${Date.now()}`;
            await addOrder({
                id,
                source: 'WhatsApp',
                customer_contact: sender,
                order_text: text,
                status: 'New'
            });
            
            console.log(`[WhatsApp Webhook] Order logged from ${sender}`);
        }
        
        // WhatsApp expects a 200 OK to acknowledge receipt
        res.sendStatus(200);
    } catch (error) {
        console.error('[WhatsApp Webhook] Error:', error);
        res.sendStatus(500);
    }
});

// GET webhook verification (required by Meta to verify the webhook URL)
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'inwoice_secret_token')) {
            console.log('[WhatsApp Webhook] Verified');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

module.exports = router;
