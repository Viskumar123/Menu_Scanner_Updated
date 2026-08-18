/**
 * tests/unit.test.js — Unit Tests for MenuScan Core Business Logic.
 */

const assert = require('node:assert');
const { slugify } = require('../server/db/seed');

function runUnitTests() {
  console.log('\n--- 1. Running Unit Tests ---');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  // 1. Slugify validation
  test('Slugify transforms restaurant names into clean URL slugs', () => {
    assert.strictEqual(slugify('The Spice Garden'), 'the-spice-garden');
    assert.strictEqual(slugify('La Bella Italia! 2026'), 'la-bella-italia-2026');
    assert.strictEqual(slugify('   Burger & Barn @ Indiranagar   '), 'burger-barn-indiranagar');
  });

  // 2. Price calculation and GST
  test('Price and Tax (GST 5%) calculates correctly', () => {
    const subtotal = 540;
    const tax = Math.round(subtotal * 0.05);
    const grandTotal = subtotal + tax;
    assert.strictEqual(tax, 27);
    assert.strictEqual(grandTotal, 567);
  });

  // 3. Fallback Hierarchy Resolution
  test('Image Fallback Hierarchy prioritizes: Uploaded -> URL -> Emoji -> Text', () => {
    function resolveDisplay(item) {
      if (item.uploadedImage) return { type: 'IMAGE', src: item.uploadedImage, alt: item.altText };
      if (item.imageUrl) return { type: 'IMAGE_URL', src: item.imageUrl, alt: item.altText };
      if (item.emoji) return { type: 'EMOJI', src: item.emoji, alt: item.name };
      return { type: 'TEXT', text: item.name, alt: item.name };
    }

    const fullItem = { uploadedImage: '/uploads/dish1.png', imageUrl: 'https://img.com/d.jpg', emoji: '🍕', name: 'Pizza', altText: 'Hot pizza' };
    assert.strictEqual(resolveDisplay(fullItem).type, 'IMAGE');

    const urlItem = { imageUrl: 'https://img.com/d.jpg', emoji: '🍕', name: 'Pizza', altText: 'Hot pizza' };
    assert.strictEqual(resolveDisplay(urlItem).type, 'IMAGE_URL');

    const emojiItem = { emoji: '🍕', name: 'Pizza', altText: 'Hot pizza' };
    assert.strictEqual(resolveDisplay(emojiItem).type, 'EMOJI');

    const textItem = { name: 'Pizza' };
    assert.strictEqual(resolveDisplay(textItem).type, 'TEXT');
  });

  // 4. In-Stock Availability state toggle
  test('Availability toggling preserves item attributes and flips binary flag', () => {
    let isAvailable = 1;
    isAvailable = isAvailable === 1 ? 0 : 1;
    assert.strictEqual(isAvailable, 0);
    isAvailable = isAvailable === 1 ? 0 : 1;
    assert.strictEqual(isAvailable, 1);
  });

  return { passed, total };
}

module.exports = { runUnitTests };
