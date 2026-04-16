/**
 * Smoke tests: no real Supabase calls for unauthenticated routes.
 * Dummy env vars satisfy config/supabase.js when loading the app.
 */
process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_ANON_KEY ||= 'test-anon-key-placeholder';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key-placeholder';
process.env.NODE_ENV = 'test';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

describe('public auth smoke', () => {
  test('GET /login returns HTML when unauthenticated', async () => {
    const res = await request(app).get('/login').expect(200);
    assert.ok(/login/i.test(res.text) || res.text.includes('html'), 'expected HTML login page');
  });
});

describe('implementation API', () => {
  test('GET /api/implementation/vendors without session returns 401 JSON', async () => {
    const res = await request(app)
      .get('/api/implementation/vendors')
      .set('Accept', 'application/json')
      .expect(401);
    assert.strictEqual(res.body?.error, 'Not authenticated.');
  });
});
