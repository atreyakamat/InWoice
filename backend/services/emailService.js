const nodemailer = require('nodemailer');
const { getSettings } = require('./googleSheetsService');

const sendInvoiceEmail = async (invoiceData, pdfBuffer) => {
    const settings = await getSettings();
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
        throw new Error('SMTP settings are not configured properly.');
    }

    const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: parseInt(settings.smtpPort) || 587,
        secure: parseInt(settings.smtpPort) === 465,
        auth: {
            user: settings.smtpUser,
            pass: settings.smtpPass
        }
    });

    const mailOptions = {
        from: `"${settings.businessName}" <${settings.email || settings.smtpUser}>`,
        to: invoiceData.customerEmail,
        subject: `Invoice from ${settings.businessName}`,
        text: `Hello ${invoiceData.customerName},\n\nThank you for your order!\n\nPlease find your invoice attached.\n\nBest regards,\n${settings.businessName}`,
        attachments: [
            {
                filename: `${invoiceData.invoiceID}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    return transporter.sendMail(mailOptions);
};

module.exports = { sendInvoiceEmail };