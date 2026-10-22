import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';

let auth: Record<string, string>;
let supplierId: string;
let vinyl: string;
let ink: string;
let product: string;

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  supplierId = (await api.post('/api/suppliers').set(auth).send({ name: 'PrintPro', leadTime: '5' })).body.data.id;
  vinyl = (await api.post('/api/inventory').set(auth).send({ name: 'Vinyl', unit: 'sheet', currentStock: 10, reorderLevel: 5, costPerUnit: 20, supplierId })).body.data.id;
  ink = (await api.post('/api/inventory').set(auth).send({ name: 'Ink', unit: 'ml', currentStock: 100, reorderLevel: 20 })).body.data.id;
  product = (await api.post('/api/products').set(auth).send({ name: 'Custom Sticker', price: 120, stock: 0 })).body.data.id;
});
afterAll(() => prisma.$disconnect());

const stock = async (id: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).currentStock;

describe('inventory', () => {
  it('records opening stock as a movement', async () => {
    expect(await stock(vinyl)).toBe(10);
    const moves = await api.get(`/api/stock-movements?inventoryItemId=${vinyl}`).set(auth);
    expect(moves.body.data).toHaveLength(1);
    expect(moves.body.data[0]).toMatchObject({ type: 'ADJUSTMENT', quantity: 10 });
  });

  it('adjusts stock only through movements', async () => {
    await api.put(`/api/inventory/${vinyl}`).set(auth).send({ currentStock: 9999, location: 'Shelf A' });
    expect(await stock(vinyl)).toBe(10);
    expect((await api.post(`/api/inventory/${vinyl}/adjust`).set(auth).send({ delta: 0 })).status).toBe(400);
    await api.post(`/api/inventory/${vinyl}/adjust`).set(auth).send({ delta: -2, type: 'DAMAGE', notes: 'torn' });
    expect(await stock(vinyl)).toBe(8);
  });

  it('summarises the inventory dashboard', async () => {
    const res = await api.get('/api/inventory/dashboard').set(auth);
    expect(res.body.data.totalItems).toBe(2);
    expect(res.body.data.totalValue).toBe(160); // 8 x 20
  });
});

describe('BOM, production and made-to-order sales', () => {
  it('saves a bill of materials and reports producible units', async () => {
    const save = await api
      .put(`/api/bom/${product}`)
      .set(auth)
      .send({ items: [{ inventoryItemId: vinyl, quantityRequired: 0.5 }, { inventoryItemId: ink, quantityRequired: 5 }] });
    expect(save.status).toBe(200);
    const bom = await api.get(`/api/bom/${product}`).set(auth);
    expect(bom.body.data.items).toHaveLength(2);
    expect(bom.body.data.producible).toBe(16); // min(8/0.5, 100/5)
  });

  it('refuses production when materials are short, without leaving a stray batch', async () => {
    const before = await prisma.productionBatch.count();
    const res = await api.post('/api/production').set(auth).send({ outputs: [{ productId: product, quantity: 100 }], complete: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Not enough materials/);
    expect(await prisma.productionBatch.count()).toBe(before);
  });

  it('completes a batch: consumes materials and adds finished stock', async () => {
    const res = await api.post('/api/production').set(auth).send({ outputs: [{ productId: product, quantity: 4 }] });
    expect(res.body.data.status).toBe('PLANNED');
    const done = await api.post(`/api/production/${res.body.data.id}/complete`).set(auth);
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.usages).toHaveLength(2);
    expect(await stock(vinyl)).toBe(6);
    expect(await stock(ink)).toBe(80);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product } })).stock).toBe(4);
    expect((await api.post(`/api/production/${res.body.data.id}/complete`).set(auth)).status).toBe(400);
  });

  it('sells from finished stock first, then makes the shortfall to order', async () => {
    const customer = (await api.post('/api/customers').set(auth).send({ name: 'Buyer' })).body.data.id;
    const inv = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: customer, issue: true, items: [{ type: 'PRODUCT', itemId: product, quantity: 6 }] });
    expect(inv.status).toBe(201);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product } })).stock).toBe(0);
    expect(await stock(vinyl)).toBe(5); // 2 made to order x 0.5
    expect(await stock(ink)).toBe(70);

    // Cancelling reverses both finished goods and materials exactly.
    await api.post(`/api/invoices/${inv.body.data.id}/cancel`).set(auth);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product } })).stock).toBe(4);
    expect(await stock(vinyl)).toBe(6);
    expect(await stock(ink)).toBe(80);
  });
});

describe('purchase orders', () => {
  let poId: string;

  it('creates numbered orders with computed totals', async () => {
    const res = await api
      .post('/api/purchase-orders')
      .set(auth)
      .send({ supplierId, status: 'ORDERED', items: [{ inventoryItemId: vinyl, quantityOrdered: 50, unitPrice: 18 }, { inventoryItemId: ink, quantityOrdered: 200, unitPrice: 1 }] });
    expect(res.status).toBe(201);
    poId = res.body.data.id;
    expect(res.body.data.poNumber).toMatch(/^PO-\d{4}-0001$/);
    expect(res.body.data.totalAmount).toBe(1100);
  });

  it('rejects the same material twice in one order', async () => {
    const res = await api
      .post('/api/purchase-orders')
      .set(auth)
      .send({ supplierId, items: [{ inventoryItemId: ink, quantityOrdered: 1 }, { inventoryItemId: ink, quantityOrdered: 2 }] });
    expect(res.status).toBe(400);
  });

  it('receives partially, then fully, adding stock', async () => {
    const part = await api.post(`/api/purchase-orders/${poId}/receive`).set(auth).send({ items: [{ inventoryItemId: vinyl, quantity: 20 }] });
    expect(part.body.data.status).toBe('PARTIAL');
    expect(await stock(vinyl)).toBe(26);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: vinyl } })).costPerUnit).toBe(18);

    const full = await api
      .post(`/api/purchase-orders/${poId}/receive`)
      .set(auth)
      .send({ items: [{ inventoryItemId: vinyl, quantity: 30 }, { inventoryItemId: ink, quantity: 200 }] });
    expect(full.body.data.status).toBe('RECEIVED');
    expect(await stock(vinyl)).toBe(56);
    expect(await stock(ink)).toBe(280);
    expect((await api.post(`/api/purchase-orders/${poId}/receive`).set(auth).send({ items: [{ inventoryItemId: ink, quantity: 1 }] })).status).toBe(400);
  });

  it('marks suppliers with orders inactive instead of deleting', async () => {
    await api.delete(`/api/suppliers/${supplierId}`).set(auth);
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } })).status).toBe('INACTIVE');
  });
});

describe('events and fulfillment', () => {
  it('allocates stock to an event and returns unsold items', async () => {
    const event = (await api.post('/api/events').set(auth).send({ name: 'Weekend Market', location: 'Panaji' })).body.data;
    expect((await api.post(`/api/events/${event.id}/allocate`).set(auth).send({ inventoryItemId: ink, quantity: 10000 })).status).toBe(400);
    await api.post(`/api/events/${event.id}/allocate`).set(auth).send({ inventoryItemId: vinyl, quantity: 10 });
    expect(await stock(vinyl)).toBe(46);
    const upd = await api.patch(`/api/events/${event.id}/inventory`).set(auth).send({ inventoryItemId: vinyl, sold: 7, returned: 3 });
    expect(upd.body.data.inventory[0]).toMatchObject({ quantitySold: 7, quantityReturned: 3 });
    expect(await stock(vinyl)).toBe(49);
    expect((await api.patch(`/api/events/${event.id}/inventory`).set(auth).send({ inventoryItemId: vinyl, sold: 1 })).status).toBe(400);
  });

  it('tracks shipment status history', async () => {
    const customer = (await api.post('/api/customers').set(auth).send({ name: 'Ship To' })).body.data.id;
    const inv = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: customer, issue: true, items: [{ type: 'CUSTOM', name: 'Order', quantity: 1, unitPrice: 10 }] });
    const list = await api.get('/api/fulfillments?status=OPEN').set(auth);
    const f = list.body.data.find((x: { invoiceId: string }) => x.invoiceId === inv.body.data.id);
    expect(f).toBeTruthy();
    const res = await api.patch(`/api/fulfillments/${f.id}`).set(auth).send({ status: 'SHIPPED', courier: 'DTDC', trackingNumber: 'X1' });
    expect(res.body.data.status).toBe('SHIPPED');
    expect(res.body.data.shipmentRecords[0].status).toBe('SHIPPED');

    // Omitted fields are kept; "" clears a field.
    const keep = await api.patch(`/api/fulfillments/${f.id}`).set(auth).send({ status: 'SHIPPED' });
    expect(keep.body.data.courier).toBe('DTDC');
    const cleared = await api.patch(`/api/fulfillments/${f.id}`).set(auth).send({ status: 'SHIPPED', trackingNumber: '' });
    expect(cleared.body.data.trackingNumber).toBeNull();
    expect(cleared.body.data.courier).toBe('DTDC');
  });
});
