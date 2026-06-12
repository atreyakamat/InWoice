const request = require('supertest');
const app = require('./server');

describe('V3 Modules API Tests', () => {
    describe('Business Settings API', () => {
        it('should get settings', async () => {
            const res = await request(app).get('/api/settings');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });
        it('should update settings', async () => {
            const res = await request(app).put('/api/settings').send({ business_name: 'Stix N Vibes' });
            expect(res.statusCode).toBe(200);
        });
    });

    describe('Collections API', () => {
        it('should create and get collection', async () => {
            const createRes = await request(app).post('/api/collections').send({ name: 'Test Collection' });
            expect(createRes.statusCode).toBe(201);
            
            const getRes = await request(app).get('/api/collections');
            expect(getRes.statusCode).toBe(200);
            expect(getRes.body.data.length).toBeGreaterThan(0);
        });
    });

    describe('Packs API', () => {
        it('should create and get pack', async () => {
            const createRes = await request(app).post('/api/packs').send({ name: 'Test Pack', price: 99 });
            expect(createRes.statusCode).toBe(201);
            
            const getRes = await request(app).get('/api/packs');
            expect(getRes.statusCode).toBe(200);
            expect(getRes.body.data.length).toBeGreaterThan(0);
        });
    });

    describe('Timeline API', () => {
        it('should create timeline event', async () => {
            const res = await request(app).post('/api/timeline').send({ customer_id: 'test@test.com', event_type: 'Invoice Created', title: 'Test' });
            expect(res.statusCode).toBe(201);
        });
    });

    describe('Files API', () => {
        it('should get files', async () => {
            const res = await request(app).get('/api/files');
            expect(res.statusCode).toBe(200);
        });
    });
});
