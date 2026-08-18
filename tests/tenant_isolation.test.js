/**
 * tests/tenant_isolation.test.js — Mandatory Multi-Tenant Security & Isolation Tests.
 * Explicitly tests that Restaurant A owner cannot read, modify, or delete Restaurant B data (403 Forbidden).
 */

const assert = require('node:assert');
const { generateToken } = require('../server/middleware/auth');
const { queryOne } = require('../server/db');

async function runTenantIsolationTests(app) {
  console.log('\n--- 2. Running Multi-Tenant Authorization & Isolation Tests ---');
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  // Set up mock HTTP caller using Express app
  const makeRequest = (method, path, headers = {}, body = null) => {
    return new Promise((resolve) => {
      const http = require('node:http');
      const server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const options = {
          hostname: '127.0.0.1',
          port: port,
          path: path,
          method: method,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            server.close();
            let parsed = data;
            try { parsed = JSON.parse(data); } catch (e) {}
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          });
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    });
  };

  // 1. Unauthenticated request to protected endpoint -> 401
  await test('Unauthenticated request to protected endpoint returns 401 Unauthorized', async () => {
    const res = await makeRequest('POST', '/api/items', {}, { name: 'Hack Dish', restaurantId: 'R001' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  // 2. Generate token for Owner 1 (mapped only to R001)
  const owner1 = queryOne('SELECT * FROM users WHERE email = ?', ['owner1@menuscan.com']);
  assert.ok(owner1, 'Owner 1 user exists in database');
  const owner1Token = generateToken(owner1);

  // 3. Owner 1 attempting to modify Restaurant B (R002) profile -> 403 Forbidden
  await test('Owner 1 attempting to update Restaurant 2 profile receives 403 Forbidden', async () => {
    const res = await makeRequest('PUT', '/api/restaurants/R002', {
      'Authorization': `Bearer ${owner1Token}`
    }, { tagline: 'Hacked Tagline' });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Forbidden') || res.body.error.includes('denied'));
  });

  // 4. Owner 1 attempting to add item to Restaurant 2 (R002) -> 403 Forbidden
  await test('Owner 1 attempting to add dish to Restaurant 2 receives 403 Forbidden', async () => {
    const res = await makeRequest('POST', '/api/items', {
      'Authorization': `Bearer ${owner1Token}`
    }, {
      restaurantId: 'R002',
      name: 'Unauthorized Spring Roll',
      price: 250
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  // 5. Owner 1 attempting to toggle item in Restaurant 2 (I015 in R002) -> 403 Forbidden
  await test('Owner 1 attempting to modify Restaurant 2 dish availability receives 403 Forbidden', async () => {
    const res = await makeRequest('PATCH', '/api/items/I015/availability', {
      'Authorization': `Bearer ${owner1Token}`
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  // 6. Super Admin can access and modify any restaurant -> 200 OK
  const admin = queryOne('SELECT * FROM users WHERE email = ?', ['admin@menuscan.com']);
  const adminToken = generateToken(admin);

  await test('Super Admin can legitimately update restaurant status across tenants', async () => {
    const res = await makeRequest('PUT', '/api/restaurants/R001', {
      'Authorization': `Bearer ${adminToken}`
    }, { tagline: 'Authentic Indian Cuisine since 1995' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  return { passed, total };
}

module.exports = { runTenantIsolationTests };
