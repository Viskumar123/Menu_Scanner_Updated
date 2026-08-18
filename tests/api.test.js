/**
 * tests/api.test.js — Integration Tests for Canonical QR Resolution & REST APIs.
 */

const assert = require('node:assert');

async function runAPITests(app) {
  console.log('\n--- 3. Running Integration & Canonical Route Tests ---');
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

  // 1. Health check
  await test('GET /api/health returns 200 and HEALTHY status', async () => {
    const res = await makeRequest('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'HEALTHY');
  });

  // 2. Canonical Stable QR resolution by Slug: /r/the-spice-garden -> 302 Redirect
  await test('Canonical QR URL /r/the-spice-garden redirects (302) to /menu.html?restaurant=R001', async () => {
    const res = await makeRequest('GET', '/r/the-spice-garden');
    assert.strictEqual(res.status, 302);
    assert.ok(res.headers.location.includes('/menu.html?restaurant=R001'));
  });

  // 3. Canonical Stable QR resolution with Table Number: /r/R001?table=5 -> 302 Redirect with table
  await test('Canonical QR URL /r/R001?table=5 redirects to menu with table parameter', async () => {
    const res = await makeRequest('GET', '/r/R001?table=5');
    assert.strictEqual(res.status, 302);
    assert.ok(res.headers.location.includes('/menu.html?restaurant=R001&table=5'));
  });

  // 4. Menu Items with Dietary Filter: /api/items/R001?vegOnly=true
  await test('GET /api/items/R001?vegOnly=true returns only vegetarian dishes', async () => {
    const res = await makeRequest('GET', '/api/items/R001?vegOnly=true');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.items.length > 0);
    const nonVeg = res.body.items.filter(i => !i.isVegetarian);
    assert.strictEqual(nonVeg.length, 0);
  });

  // 5. Place Public Table Order: POST /api/orders
  await test('POST /api/orders places table order and returns valid confirmation', async () => {
    const orderData = {
      restaurantId: 'R001',
      tableNumber: 'Table 7',
      items: [
        { name: 'Paneer Tikka', price: 320, quantity: 2, isVegetarian: true }
      ],
      subtotal: 640,
      tax: 32,
      grandTotal: 672,
      notes: 'Less spicy please'
    };

    const res = await makeRequest('POST', '/api/orders', {}, orderData);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.orderId.startsWith('ORD'));
    assert.strictEqual(res.body.grandTotal, 672);
  });

  // 6. Anonymous Analytics Event Ingestion: POST /api/analytics/event
  await test('POST /api/analytics/event ingests anonymous user interactions', async () => {
    const res = await makeRequest('POST', '/api/analytics/event', {}, {
      restaurantId: 'R001',
      eventType: 'MENU_VIEW',
      metadata: { table: '5' }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.eventId.startsWith('EVT_'));
  });

  return { passed, total };
}

module.exports = { runAPITests };
