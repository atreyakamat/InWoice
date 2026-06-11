const fs = require('fs');
const path = require('path');
const { create, ev } = require('@open-wa/wa-automate');
const logger = require('../utils/logger');
const { recordWhatsAppMessage } = require('./dbService');
const { enqueueJob } = require('./backgroundJobService');

let clientPromise = null;
let openWaClient = null;
const status = {
    state: 'idle',
    sessionId: process.env.WA_SESSION_ID || 'inwoice',
    connectedAt: null,
    lastMessageAt: null,
    lastError: null
};

const resolveSessionDir = () => {
    const sessionPath = process.env.WA_SESSION_DATA_PATH || 'data/openwa-sessions';
    const absolutePath = path.isAbsolute(sessionPath)
        ? sessionPath
        : path.join(process.cwd(), sessionPath);

    fs.mkdirSync(absolutePath, { recursive: true });
    return absolutePath;
};

const normalizeTimestamp = (value) => {
    if (!value) return new Date().toISOString();
    if (typeof value === 'number') {
        return new Date(value < 1e12 ? value * 1000 : value).toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const normalizeOpenWaMessage = (message) => {
    const chatId = message.chatId
        || message.from
        || message.chat?.id
        || message.sender?.id
        || message.contact?.id
        || message.id?.remote
        || message.id
        || 'unknown';

    const messageId = message.id?.id
        || message.id?._serialized
        || message.messageId
        || message._serialized
        || `${chatId}_${message.timestamp || Date.now()}`;

    const body = message.body || message.text?.body || message.caption || message.message || '';

    return {
        chat_id: chatId,
        message_id: messageId,
        direction: message.fromMe ? 'outbound' : 'inbound',
        sender_id: message.from || message.sender?.id || chatId,
        sender_name: message.sender?.pushname || message.pushname || message.contact?.pushname || message.notifyName || null,
        body,
        message_type: message.type || (message.text ? 'text' : 'unknown'),
        timestamp: normalizeTimestamp(message.timestamp || message.t || Date.now()),
        raw_json: JSON.stringify(message),
        contact_id: message.from || message.sender?.id || chatId,
        contact_name: message.sender?.pushname || message.pushname || message.contact?.pushname || null,
        contact_phone: message.from || message.sender?.id || chatId,
        title: message.sender?.pushname || message.pushname || message.notifyName || chatId,
        source: 'OpenWA'
    };
};

const persistOpenWaMessage = async (message) => {
    if (!message) return null;
    const normalized = normalizeOpenWaMessage(message);
    if (normalized.chat_id === 'unknown' || !normalized.message_id) return null;
    return recordWhatsAppMessage(normalized);
};

const registerSessionDataListeners = (sessionDir) => {
    ev.on('sessionData.**', async (sessionData, sessionId) => {
        const id = sessionId || status.sessionId;
        const filePath = path.join(sessionDir, `${id}.data.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(sessionData, null, 2));
        logger.info('[OpenWA] Session data saved', { sessionId: id, filePath });
    });

    ev.on('sessionDataBase64.**', async (sessionDataString, sessionId) => {
        const id = sessionId || status.sessionId;
        const filePath = path.join(sessionDir, `${id}.data.json`);
        await fs.promises.writeFile(filePath, sessionDataString);
        logger.info('[OpenWA] Session data saved (base64)', { sessionId: id, filePath });
    });
};

const startOpenWaService = async () => {
    if (process.env.OPENWA_ENABLED === 'false') {
        status.state = 'disabled';
        return null;
    }

    if (clientPromise) {
        return clientPromise;
    }

    const sessionDir = resolveSessionDir();
    registerSessionDataListeners(sessionDir);

    status.state = 'starting';
    clientPromise = create({
        sessionId: status.sessionId,
        multiDevice: true,
        headless: true,
        qrTimeout: 0,
        authTimeout: Number(process.env.WA_AUTH_TIMEOUT || 0),
        blockCrashLogs: true,
        disableSpins: true,
        logConsole: false,
        popup: false,
        sessionDataPath: process.env.WA_SESSION_DATA_PATH || 'data/openwa-sessions'
    }).then((client) => {
        openWaClient = client;
        status.state = 'connected';
        status.connectedAt = new Date().toISOString();

        client.onMessage(async (message) => {
            try {
                const payload = normalizeOpenWaMessage(message);
                if (process.env.BACKGROUND_QUEUE_ENABLED === 'false') {
                    const saved = await persistOpenWaMessage(message);
                    if (saved) {
                        status.lastMessageAt = new Date().toISOString();
                    }
                    return;
                }

                enqueueJob('whatsapp.message.persist', payload, { priority: 10 });
                if (payload) {
                    status.lastMessageAt = new Date().toISOString();
                }
            } catch (error) {
                logger.error('[OpenWA] Failed to persist message', { error: error.message });
            }
        });

        logger.info('[OpenWA] Client ready', { sessionId: status.sessionId });
        return client;
    }).catch((error) => {
        status.state = 'error';
        status.lastError = error.message;
        clientPromise = null;
        logger.error('[OpenWA] Failed to start', { error: error.message });
        throw error;
    });

    return clientPromise;
};

const getOpenWaStatus = () => ({
    ...status,
    hasClient: !!openWaClient
});

module.exports = {
    startOpenWaService,
    getOpenWaStatus,
    normalizeOpenWaMessage,
    persistOpenWaMessage
};
