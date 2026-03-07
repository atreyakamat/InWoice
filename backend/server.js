require('dotenv').config();
const express = require('express');
const cors = require('cors');
const invoiceRoutes = require('./routes/invoiceRoutes');
const emailRoutes = require('./routes/emailRoutes');
const sheetRoutes = require('./routes/sheetRoutes');
const aiRoutes = require('./routes/aiRoutes');
const productRoutes = require('./routes/productRoutes');
const webInvoiceRoutes = require('./routes/webInvoiceRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/invoices', invoiceRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/data', sheetRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/products', productRoutes);
app.use('/api/web-invoices', webInvoiceRoutes);

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
