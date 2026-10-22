import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { parseJsonFromText } from '../src/services/ai.service';

let auth: Record<string, string>;

// A stand-in for Ollama's /api/chat so the local-AI path is tested without a model.
let fakeOllama: http.Server;
let ollamaUrl: string;
const received: { model: string; messages: { role: string; content: string }[] }[] = [];

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  fakeOllama = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      if (parsed.model === 'missing-model') {
        res.writeHead(404).end('{"error":"model not found"}');
        return;
      }
      received.push(parsed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { role: 'assistant', content: '# Daily Executive Briefing\nAll good.' } }));
    });
  });
  await new Promise<void>((r) => fakeOllama.listen(0, '127.0.0.1', r));
  ollamaUrl = `http://127.0.0.1:${(fakeOllama.address() as AddressInfo).port}`;

  const customer = (await api.post('/api/customers').set(auth).send({ name: 'Repeat Buyer' })).body.data.id;
  for (const daysAgo of [120, 90, 75]) {
    const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    const inv = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: customer, issue: true, date, dueDate: date, items: [{ type: 'CUSTOM', name: 'Job', quantity: 1, unitPrice: 500 }] });
    if (daysAgo > 100) await api.post(`/api/invoices/${inv.body.data.id}/payments`).set(auth).send({ amount: inv.body.data.grandTotal, paymentDate: date });
  }
  await api.post('/api/products').set(auth).send({ name: 'Low Item', price: 10, stock: 1, lowStockThreshold: 5 });
});
afterAll(async () => {
  fakeOllama.close();
  await prisma.$disconnect();
});

describe('dashboard', () => {
  it('returns KPIs, a 12-month series, and low stock', async () => {
    const res = await api.get('/api/dashboard').set(auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.monthly).toHaveLength(12);
    expect(d.kpis.overdueCount).toBe(2);
    expect(d.kpis.outstanding).toBeGreaterThan(0);
    expect(d.topCustomers[0].name).toBe('Repeat Buyer');
    expect(d.lowStock.products.map((p: { name: string }) => p.name)).toContain('Low Item');
  });
});

describe('executive analysis without AI', () => {
  it('works fully on rules when AI is off', async () => {
    const res = await api.post('/api/executive/analyze').set(auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.briefing.source).toBe('RULES');
    expect(d.briefing.content).toContain('# Daily Executive Briefing');
    expect(d.healthScore.overallScore).toBeGreaterThanOrEqual(0);
    expect(d.healthScore.overallScore).toBeLessThanOrEqual(100);
    expect(d.forecasts).toHaveLength(2);
    expect(d.aiError).toBeNull();

    const view = await api.get('/api/executive').set(auth);
    const titles = view.body.data.risks.map((r: { title: string }) => r.title).join(' | ');
    expect(titles).toMatch(/overdue/);
    expect(titles).toMatch(/Low Item/);
    expect(titles).toMatch(/churning/);
    expect(view.body.data.ai.enabled).toBe(false);
  });

  it('keeps decisions on opportunities across re-analysis', async () => {
    const view = await api.get('/api/executive').set(auth);
    const opp = view.body.data.opportunities[0];
    await api.patch(`/api/executive/opportunities/${opp.id}`).set(auth).send({ status: 'APPROVED' });
    await api.post('/api/executive/analyze').set(auth);
    expect((await prisma.businessOpportunity.findUniqueOrThrow({ where: { id: opp.id } })).status).toBe('APPROVED');
  });

  it('explains that Q&A needs AI when AI is off', async () => {
    const res = await api.post('/api/executive/ask').set(auth).send({ question: 'How are we doing?' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/AI is turned off/);
  });
});

describe('local AI (Ollama protocol)', () => {
  it('reports a missing model clearly in the connection test', async () => {
    const res = await api.post('/api/settings/test-ai').set(auth).send({ aiProvider: 'OLLAMA', ollamaUrl, aiModel: 'missing-model' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ollama pull missing-model/);
  });

  it('reports an unreachable server clearly', async () => {
    const res = await api.post('/api/settings/test-ai').set(auth).send({ aiProvider: 'OLLAMA', ollamaUrl: 'http://127.0.0.1:1', aiModel: 'x' });
    expect(res.status).toBe(502);
  });

  it('uses the local model for briefings and Q&A once enabled', async () => {
    const test = await api.post('/api/settings/test-ai').set(auth).send({ aiProvider: 'OLLAMA', ollamaUrl, aiModel: 'qwen2.5:1.5b' });
    expect(test.status).toBe(200);
    expect(test.body.data.provider).toBe('OLLAMA');

    await api.put('/api/settings').set(auth).send({ aiProvider: 'OLLAMA', ollamaUrl, aiModel: 'qwen2.5:1.5b' });
    const analysis = await api.post('/api/executive/analyze').set(auth);
    expect(analysis.body.data.briefing.source).toBe('OLLAMA');

    const ask = await api.post('/api/executive/ask').set(auth).send({ question: 'Who owes me money?' });
    expect(ask.status).toBe(200);
    expect(ask.body.data.answer).toContain('All good');
    const last = received[received.length - 1]!;
    expect(last.model).toBe('qwen2.5:1.5b');
    // The model receives real business data, not an empty prompt.
    expect(last.messages[1]!.content).toContain('Repeat Buyer');
  });

  it('falls back to the rules briefing if the AI provider fails', async () => {
    await api.put('/api/settings').set(auth).send({ ollamaUrl: 'http://127.0.0.1:1' });
    const res = await api.post('/api/executive/analyze').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.briefing.source).toBe('RULES');
    expect(res.body.data.aiError).toMatch(/not reachable/);
  });
});

describe('parseJsonFromText', () => {
  it('extracts JSON from fenced or chatty replies', () => {
    expect(parseJsonFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonFromText('Sure! Here it is: [1,2,3] hope that helps')).toEqual([1, 2, 3]);
    expect(parseJsonFromText('no json here')).toBeNull();
  });
});
