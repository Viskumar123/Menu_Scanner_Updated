/**
 * tests/runner.js — Master Automated Test Runner for MenuScan Platform.
 * Executes Unit Tests, Tenant Boundary Security Tests, and API Integration Tests.
 */

const { app } = require('../server/server');
const { getDB } = require('../server/db');
const { seedDatabase } = require('../server/db/seed');
const { runUnitTests } = require('./unit.test');
const { runTenantIsolationTests } = require('./tenant_isolation.test');
const { runAPITests } = require('./api.test');

async function runAllTests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🧪 MenuScan Production Automated Test Suite');
  console.log('════════════════════════════════════════════════════════════');

  // Initialize DB before tests
  getDB();
  seedDatabase(false);

  let grandPassed = 0;
  let grandTotal = 0;

  // 1. Unit Tests
  const unit = runUnitTests();
  grandPassed += unit.passed;
  grandTotal += unit.total;

  // 2. Tenant Isolation Tests
  const tenant = await runTenantIsolationTests(app);
  grandPassed += tenant.passed;
  grandTotal += tenant.total;

  // 3. API & Integration Tests
  const api = await runAPITests(app);
  grandPassed += api.passed;
  grandTotal += api.total;

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`📊 Test Summary: ${grandPassed} / ${grandTotal} Tests Passed (${Math.round((grandPassed / grandTotal) * 100)}%)`);
  if (grandPassed === grandTotal) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! Production Quality Verified.');
    console.log('════════════════════════════════════════════════════════════\n');
    process.exit(0);
  } else {
    console.error(`⚠️ ${grandTotal - grandPassed} test(s) failed.`);
    console.log('════════════════════════════════════════════════════════════\n');
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
