/**
 * Demo data for local testing and sales demos.
 *   npm run db:seed
 * Creates an admin (demo@inwoice.local / demo12345) only if there are no users yet,
 * and sample catalog/customers/invoices only if there are no customers yet.
 */
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma';
import { addPayment, createInvoice } from '../src/services/invoice.service';
import { getSettings } from '../src/services/settings.service';
import { addBillPayment, createBill } from '../src/services/bill.service';
import { createExpense } from '../src/services/expense.service';

const DAY = 86_400_000;

async function main() {
  if ((await prisma.user.count()) === 0) {
    await prisma.user.create({
      data: { name: 'Demo Owner', email: 'demo@inwoice.local', password: await bcrypt.hash('demo12345', 10), role: 'ADMIN' },
    });
    console.log('Created admin: demo@inwoice.local / demo12345  (change this password!)');
  }

  if ((await prisma.customer.count()) > 0) {
    console.log('Customers already exist - skipping sample business data.');
    return;
  }

  const s = await getSettings();
  await prisma.businessSettings.update({
    where: { id: s.id },
    data: {
      businessName: 'Stix N Vibes',
      address: '12 Artisan Lane, Panaji, Goa 403001',
      state: 'Goa',
      email: 'hello@stixnvibes.in',
      phone: '+91 98765 43210',
      gstNumber: '30ABCDE1234F1ZD',
      upiId: 'stixnvibes@upi',
      bankName: 'HDFC Bank',
      accountNumber: '50100123456789',
      ifscCode: 'HDFC0001234',
      defaultTaxRate: 18,
      termsConditions: 'Payment due within 15 days. Goods once sold are not returnable.',
      thankYouMessage: 'Thanks for supporting indie art!',
    },
  });

  const supplier = await prisma.supplier.create({
    data: { name: 'PrintPro Supplies', phone: '+91 90000 11111', email: 'orders@printpro.in', leadTime: 5, paymentTerms: 'Net 30', gst: '30AAACP1234Q1ZL', state: 'Goa' },
  });
  const vinyl = await prisma.inventoryItem.create({
    data: { name: 'Glossy vinyl sheet A4', sku: 'RM-VINYL-A4', category: 'RAW_MATERIAL', unit: 'sheet', currentStock: 0, reorderLevel: 50, costPerUnit: 18, supplierId: supplier.id },
  });
  const lam = await prisma.inventoryItem.create({
    data: { name: 'Matte laminate roll', sku: 'RM-LAM-ROLL', category: 'RAW_MATERIAL', unit: 'metre', currentStock: 0, reorderLevel: 10, costPerUnit: 40, supplierId: supplier.id },
  });
  const sleeves = await prisma.inventoryItem.create({
    data: { name: 'Kraft packing sleeves', sku: 'PK-SLEEVE', category: 'PACKAGING', unit: 'unit', currentStock: 0, reorderLevel: 100, costPerUnit: 3 },
  });
  for (const [item, qty] of [[vinyl, 200], [lam, 25], [sleeves, 60]] as const) {
    await prisma.stockMovement.create({ data: { inventoryItemId: item.id, type: 'ADJUSTMENT', quantity: qty, notes: 'Opening stock' } });
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { currentStock: qty } });
  }

  const products = await Promise.all(
    [
      { name: 'Retro Sunset Sticker', sku: 'STK-001', category: 'Sticker', price: 60, costPrice: 12, stock: 120, hsnCode: '4911' },
      { name: 'Holographic Cat Sticker', sku: 'STK-002', category: 'Sticker', price: 90, costPrice: 20, stock: 45, hsnCode: '4911' },
      { name: 'Goa Vibes Laptop Decal', sku: 'STK-003', category: 'Decal', price: 150, costPrice: 35, stock: 4, hsnCode: '4911' },
      { name: 'Custom Name Sticker', sku: 'STK-004', category: 'Custom', price: 120, costPrice: 25, stock: 0, hsnCode: '4911' },
    ].map((p) => prisma.product.create({ data: p })),
  );
  const [sunset, cat, decal, custom] = products as [typeof products[0], typeof products[0], typeof products[0], typeof products[0]];
  // Custom stickers are made to order from raw materials.
  await prisma.productBOM.create({
    data: {
      productId: custom.id,
      items: { create: [{ inventoryItemId: vinyl.id, quantityRequired: 0.25 }, { inventoryItemId: lam.id, quantityRequired: 0.1 }] },
    },
  });
  await prisma.productBOM.create({ data: { productId: decal.id, items: { create: [{ inventoryItemId: vinyl.id, quantityRequired: 1 }] } } });
  const pack = await prisma.pack.create({
    data: {
      name: 'Starter Pack (5 stickers)',
      price: 249,
      hsnCode: '4911',
      items: { create: [{ productId: sunset.id, quantity: 3 }, { productId: cat.id, quantity: 2 }] },
    },
  });

  const customers = await Promise.all(
    [
      { name: 'Aarav Mehta', email: 'aarav@example.com', phone: '919800000001', city: 'Panaji', state: 'Goa', segment: 'VIP' },
      { name: 'Priya Nair', email: 'priya@example.com', phone: '919800000002', city: 'Kochi', state: 'Kerala' },
      { name: 'The Notebook Café', email: 'orders@notebookcafe.in', phone: '919800000003', city: 'Mumbai', state: 'Maharashtra', gstin: '27AAACN1234B1Z5', segment: 'Wholesale' },
      { name: 'Rohan Das', email: 'rohan@example.com', phone: '919800000004', city: 'Margao', state: 'Goa' },
    ].map((c) => prisma.customer.create({ data: c })),
  );

  // Six months of history so dashboards and forecasts have something to show.
  let n = 0;
  for (let month = 5; month >= 0; month--) {
    for (const [ci, c] of customers.entries()) {
      if ((month + ci) % 3 === 2) continue;
      const date = new Date(Date.now() - (month * 30 + ci * 3 + 2) * DAY);
      const inv = await createInvoice({
        customerId: c.id,
        date,
        dueDate: new Date(date.getTime() + 15 * DAY),
        placeOfSupply: null,
        discount: ci === 2 ? 50 : 0,
        shippingCost: 40,
        notes: null,
        issue: true,
        items:
          ci === 2
            ? [{ type: 'PACK', itemId: pack.id, name: null, hsnCode: null, quantity: 4 }, { type: 'PRODUCT', itemId: decal.id, name: null, hsnCode: null, quantity: 2 }]
            : [{ type: 'PRODUCT', itemId: (n % 2 ? sunset : cat).id, name: null, hsnCode: null, quantity: 2 + (n % 3) }],
      });
      n++;
      // Older invoices are paid; recent ones are a mix of paid, partial, and unpaid.
      if (month >= 2 || ci === 0) {
        await addPayment(inv.id, { amount: inv.grandTotal, paymentMethod: 'UPI', paymentDate: new Date(date.getTime() + 5 * DAY), referenceId: null, notes: null, tdsAmount: 0 });
        if (month >= 1) {
          await prisma.fulfillment.update({
            where: { invoiceId: inv.id },
            data: { status: 'DELIVERED', courier: 'India Post', actualDelivery: new Date(date.getTime() + 4 * DAY), shipmentRecords: { create: { status: 'DELIVERED' } } },
          });
        }
      } else if (ci === 1) {
        await addPayment(inv.id, { amount: Math.round(inv.grandTotal / 2), paymentMethod: 'CASH', paymentDate: date, referenceId: null, notes: null, tdsAmount: 0 });
      }
    }
  }
  // Money out: a materials bill every quarter and small running expenses, so the
  // P&L, GSTR-3B and payables screens have something to show.
  const inks = await prisma.supplier.create({ data: { name: 'Mumbai Inks & Films', gst: '27AAACM5678R1ZL', paymentTerms: 'Net 15' } });
  let bills = 0;
  let expenses = 0;
  for (let month = 5; month >= 0; month--) {
    const date = new Date(Date.now() - (month * 30 + 10) * DAY);
    if (month === 3 || month === 0) {
      const bill = await createBill({
        supplierId: month === 0 ? inks.id : supplier.id,
        billNumber: `${month === 0 ? 'MIF' : 'PP'}-${2600 + month}`,
        date,
        dueDate: undefined,
        discount: 0,
        shippingCost: 60,
        addToStock: true,
        itcEligible: true,
        interState: null,
        purchaseOrderId: null,
        notes: null,
        items: [
          { inventoryItemId: vinyl.id, description: null, category: 'Raw materials', hsnCode: '3919', quantity: 50, unitPrice: 18, taxRate: 18 },
          { inventoryItemId: lam.id, description: null, category: 'Raw materials', hsnCode: '3920', quantity: 5, unitPrice: 40, taxRate: 18 },
        ],
      });
      bills++;
      if (month >= 1) await addBillPayment(bill.id, { amount: bill.grandTotal, paymentMethod: 'BANK_TRANSFER', paymentDate: new Date(date.getTime() + 20 * DAY), referenceId: null, notes: null, tdsAmount: 0, tdsSection: null });
    }
    const common = { date, vendor: null, vendorGstin: null, taxInclusive: true, interState: null, itcEligible: undefined, referenceId: null, notes: null } as const;
    await createExpense({ ...common, category: 'Transport & courier', description: 'India Post shipping', amount: 150, taxRate: 0, paymentMethod: 'UPI' });
    await createExpense({ ...common, category: 'Internet & phone', description: 'Broadband', amount: 590, taxRate: 18, vendor: 'Goa Fibre', vendorGstin: '30AAAPE4321K1ZF', paymentMethod: 'UPI' });
    expenses += 2;
  }
  console.log(`Seeded ${customers.length} customers, ${products.length} products, 1 pack, 3 materials, ${n} invoices, ${bills} bills, ${expenses} expenses.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
