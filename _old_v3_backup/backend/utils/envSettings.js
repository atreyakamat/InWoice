const parseBool = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
};

const parseNumber = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
};

const parseImapAccountsFromEnv = () => {
    if (process.env.IMAP_ACCOUNTS_JSON) {
        try {
            const parsed = JSON.parse(process.env.IMAP_ACCOUNTS_JSON);
            if (Array.isArray(parsed)) {
                return parsed.map(account => ({
                    host: account.host,
                    port: parseNumber(account.port, 993),
                    user: account.user,
                    password: account.password,
                    tls: parseBool(account.tls, true)
                })).filter(account => account.host && account.user && account.password);
            }
        } catch (error) {
            return [];
        }
    }

    if (process.env.IMAP_USER && process.env.IMAP_PASS && process.env.IMAP_HOST) {
        return [{
            host: process.env.IMAP_HOST,
            port: parseNumber(process.env.IMAP_PORT, 993),
            user: process.env.IMAP_USER,
            password: process.env.IMAP_PASS,
            tls: parseBool(process.env.IMAP_TLS, true)
        }];
    }

    return [];
};

const getEnvSettings = () => {
    return {
        smtpHost: process.env.SMTP_HOST || '',
        smtpPort: process.env.SMTP_PORT || '587',
        smtpUser: process.env.SMTP_USER || '',
        smtpPass: process.env.SMTP_PASS || '',
        imapAccounts: parseImapAccountsFromEnv()
    };
};

const applyEnvSettings = (settings) => {
    const envSettings = getEnvSettings();
    const merged = { ...settings };

    if (!merged.smtpHost && envSettings.smtpHost) merged.smtpHost = envSettings.smtpHost;
    if (!merged.smtpPort && envSettings.smtpPort) merged.smtpPort = envSettings.smtpPort;
    if (!merged.smtpUser && envSettings.smtpUser) merged.smtpUser = envSettings.smtpUser;
    if (!merged.smtpPass && envSettings.smtpPass) merged.smtpPass = envSettings.smtpPass;

    if (!Array.isArray(merged.imapAccounts) || merged.imapAccounts.length === 0) {
        if (envSettings.imapAccounts.length > 0) {
            merged.imapAccounts = envSettings.imapAccounts;
        }
    }

    return merged;
};

module.exports = {
    getEnvSettings,
    applyEnvSettings
};
