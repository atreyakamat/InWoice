const express = require('express');
const router = express.Router();
const {
    getOrders,
    addOrder,
    updateOrderStatus,
    updateOrderClassification,
    deleteOrder,
    recordWhatsAppMessage,
    getWhatsAppChatMessages,
    getWhatsAppChat
} = require('../services/dbService');
const { getOpenWaStatus } = require('../services/openWaService');
const { authMiddleware } = require('../utils/authMiddleware');

const normalizeTimestamp = (value) => {
    if (!value) return new Date().toISOString();
    if (typeof value === 'number') {
        return new Date(value < 1e12 ? value * 1000 : value).toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const normalizeWebhookMessages = (payload) => {
    if (!payload) return [];

    if (Array.isArray(payload?.entry)) {
        const messages = [];
        payload.entry.forEach((entry) => {
            entry?.changes?.forEach((change) => {
                const value = change?.value || {};
                const inbound = Array.isArray(value.messages) ? value.messages : [];
                inbound.forEach((message) => messages.push({
                    ...message,
                    chatId: message.chatId || message.from || value.metadata?.display_phone_number || value.metadata?.phone_number_id,
                    contactName: message.pushname || value.contacts?.[0]?.profile?.name || value.contacts?.[0]?.profile?.pushname,
                    contactPhone: message.from || value.contacts?.[0]?.wa_id || message.sender || null,
                    body: message.text?.body || message.body || message.caption || message.message || null,
                    messageId: message.id || message.messageId || message.key?.id || `${message.from || 'unknown'}_${message.timestamp || Date.now()}`,
                    timestamp: normalizeTimestamp(message.timestamp || message.t || Date.now()),
                    direction: message.fromMe ? 'outbound' : 'inbound',
                    messageType: message.type || (message.text ? 'text' : 'unknown'),
                    raw: message
                }));
            });
        });
        return messages;
    }

    const directMessages = [];
    if (Array.isArray(payload.messages)) {
        directMessages.push(...payload.messages);
    } else if (payload.message) {
        directMessages.push(payload.message);
    } else if (payload.data) {
        directMessages.push(payload.data);
    } else {
        directMessages.push(payload);
    }

    return directMessages.map((message) => ({
        ...message,
        chatId: message.chatId || message.chat_id || message.from || message.contact_id || message.sender?.id || message.sender || message.id || 'unknown',
        contactName: message.contactName || message.pushname || message.sender_name || message.sender?.pushname || message.profileName || message.notifyName || null,
        contactPhone: message.contactPhone || message.from || message.sender?.id || message.sender || message.chatId || null,
        body: message.body || message.text?.body || message.message?.body || message.caption || message.content || message.message || null,
        messageId: message.messageId || message.id || message.key?.id || message._serialized || `${message.chatId || message.from || 'unknown'}_${message.timestamp || Date.now()}`,
        timestamp: normalizeTimestamp(message.timestamp || message.t || Date.now()),
        direction: message.direction || (message.fromMe ? 'outbound' : 'inbound'),
        messageType: message.messageType || message.type || (message.text ? 'text' : 'unknown'),
        raw: message
    }));
};

const ingestWebhookMessages = (messages) => {
    const storedChats = [];
    const seenChatIds = new Set();

    messages.forEach((message) => {
        if (!message.chatId || !message.messageId) return;

        const stored = recordWhatsAppMessage({
            chat_id: message.chatId,
            message_id: message.messageId,
            direction: message.direction,
            sender_id: message.contactPhone || message.chatId,
            sender_name: message.contactName || null,
            body: message.body || '',
            message_type: message.messageType || 'text',
            timestamp: message.timestamp,
            raw_json: JSON.stringify(message.raw || message),
            contact_id: message.contactPhone || message.chatId,
            contact_name: message.contactName || null,
            contact_phone: message.contactPhone || message.chatId,
            title: message.contactName || message.contactPhone || message.chatId,
            source: 'OpenWA'
        });

        if (stored && !seenChatIds.has(stored.chat_id)) {
            seenChatIds.add(stored.chat_id);
            storedChats.push(stored);
        }
    });

    return storedChats;
};

router.get('/', authMiddleware, async (req, res) => {
    try {
        const chats = await getOrders();
        res.json(chats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch WhatsApp chats.' });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const chat = await addOrder(req.body);
        res.json(chat);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save WhatsApp chat.' });
    }
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const updated = await updateOrderStatus(req.params.id, status);
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update chat status.' });
    }
});

router.patch('/:id/classification', authMiddleware, async (req, res) => {
    try {
        const { classification } = req.body;
        const updated = await updateOrderClassification(req.params.id, classification);
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update chat classification.' });
    }
});

router.get('/:id/conversation', authMiddleware, async (req, res) => {
    try {
        const chat = getWhatsAppChat(req.params.id);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found.' });
        }

        res.json({
            chat,
            messages: getWhatsAppChatMessages(req.params.id)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load chat conversation.' });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await deleteOrder(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete chat.' });
    }
});

const handleIncomingWebhook = async (req, res) => {
    try {
        const token = process.env.OPENWA_WEBHOOK_TOKEN;
        if (token && req.query.token !== token) {
            return res.status(403).json({ error: 'Invalid webhook token.' });
        }

        const messages = normalizeWebhookMessages(req.body);
        if (messages.length === 0) {
            return res.status(200).json({ success: true, received: 0 });
        }

        const storedChats = ingestWebhookMessages(messages);
        res.status(200).json({
            success: true,
            received: messages.length,
            chats: storedChats.map((chat) => chat.chat_id)
        });
    } catch (error) {
        console.error('[OpenWA Webhook] Error:', error);
        res.status(500).json({ error: 'Failed to ingest WhatsApp message.' });
    }
};

router.post('/openwa/webhook', handleIncomingWebhook);
router.post('/webhook', handleIncomingWebhook);

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'inwoice_secret_token')) {
            console.log('[WhatsApp Webhook] Verified');
            return res.status(200).send(challenge);
        }

        return res.sendStatus(403);
    }

    return res.json({ success: true, message: 'WhatsApp webhook endpoint ready.' });
});

router.get('/openwa/status', authMiddleware, async (req, res) => {
    res.json({
        success: true,
        source: 'OpenWA',
        webhookTokenConfigured: !!process.env.OPENWA_WEBHOOK_TOKEN,
        ...getOpenWaStatus()
    });
});

module.exports = router;
