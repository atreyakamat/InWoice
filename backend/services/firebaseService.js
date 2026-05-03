const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const credsPath = path.join(__dirname, '../firebase-credentials.json');

if (!fs.existsSync(credsPath)) {
    throw new Error('Firebase credentials not found. Please add firebase-credentials.json to the backend folder.');
}

const serviceAccount = require(credsPath);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- Settings ---
const getSettings = async () => {
    const snapshot = await db.collection('settings').get();
    const settings = {};
    snapshot.forEach(doc => {
        try {
            settings[doc.id] = JSON.parse(doc.data().value);
        } catch (e) {
            settings[doc.id] = doc.data().value;
        }
    });
    return settings;
};

const updateSettings = async (newSettings) => {
    const batch = db.batch();
    for (const [key, value] of Object.entries(newSettings)) {
        const docRef = db.collection('settings').doc(key);
        batch.set(docRef, { value: JSON.stringify(value) }, { merge: true });
    }
    await batch.commit();
    return getSettings();
};

// --- Products ---
const getProducts = async () => {
    const snapshot = await db.collection('products').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const addProduct = async (product) => {
    const id = product.id || Date.now().toString();
    await db.collection('products').doc(id).set({
        name: product.name,
        category: product.category || null,
        price: product.price,
        image: product.image || null
    });
    return { ...product, id };
};

const deleteProduct = async (id) => {
    await db.collection('products').doc(id).delete();
};

// --- Customers ---
const getCustomers = async () => {
    const snapshot = await db.collection('customers').get();
    return snapshot.docs.map(doc => ({ email: doc.id, ...doc.data() }));
};

// --- Invoices ---
const getInvoices = async () => {
    const snapshot = await db.collection('invoices').orderBy('date', 'desc').get();
    return snapshot.docs.map(doc => doc.data());
};

const addInvoice = async (invoice) => {
    await db.collection('invoices').doc(invoice.invoiceID).set(invoice);

    // Update customer
    if (invoice.customerEmail) {
        const customerRef = db.collection('customers').doc(invoice.customerEmail);
        const doc = await customerRef.get();
        if (!doc.exists) {
            await customerRef.set({
                name: invoice.customerName,
                phone: invoice.customerPhone || null,
                instagram: invoice.instagramHandle || null,
                totalPurchases: invoice.grandTotal,
                lastPurchaseDate: invoice.date
            });
        } else {
            const data = doc.data();
            await customerRef.update({
                totalPurchases: (data.totalPurchases || 0) + invoice.grandTotal,
                lastPurchaseDate: invoice.date,
                name: invoice.customerName
            });
        }
    }

    return invoice;
};

const updateInvoiceStatus = async (invoiceID, status) => {
    await db.collection('invoices').doc(invoiceID).update({ paymentStatus: status });
    const doc = await db.collection('invoices').doc(invoiceID).get();
    return doc.data();
};

const updateInvoice = async (invoiceID, updatedData) => {
    await db.collection('invoices').doc(invoiceID).update(updatedData);

    // Recalculate customer total (approximation or trigger-based in real life, simplified here)
    if (updatedData.customerEmail) {
        const snapshot = await db.collection('invoices').where('customerEmail', '==', updatedData.customerEmail).get();
        let total = 0;
        let lastDate = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            total += data.grandTotal;
            if (!lastDate || data.date > lastDate) lastDate = data.date;
        });
        
        await db.collection('customers').doc(updatedData.customerEmail).update({
            totalPurchases: total,
            lastPurchaseDate: lastDate
        });
    }

    const doc = await db.collection('invoices').doc(invoiceID).get();
    return doc.data();
};

const deleteInvoice = async (invoiceID) => {
    await db.collection('invoices').doc(invoiceID).delete();
};

const backupDatabase = async () => {
    console.log('Firebase handles its own backups and redundancy automatically.');
};

module.exports = {
    getSettings,
    updateSettings,
    getProducts,
    addProduct,
    deleteProduct,
    getCustomers,
    getInvoices,
    addInvoice,
    updateInvoiceStatus,
    updateInvoice,
    deleteInvoice,
    backupDatabase
};
