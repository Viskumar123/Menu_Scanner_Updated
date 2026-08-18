/**
 * menu.js — Dynamic menu page for MenuScan.
 * Reads ?restaurant=ID and optional &table=NO from URL, loads data, renders branded menu + cart.
 */

// ═══════════════════════════════════════════════
// CART MODULE (Isolated per restaurant)
// ═══════════════════════════════════════════════
const Cart = {
  items: [],

  add(item) {
    const existing = this.items.find(i => i.id === item.id);
    if (existing) { existing.quantity++; }
    else { this.items.push({ ...item, quantity: 1 }); }
    this._persist();
    this.render();
    this._flashBadge();
  },

  remove(itemId) {
    const idx = this.items.findIndex(i => i.id === itemId);
    if (idx < 0) return;
    if (this.items[idx].quantity > 1) { this.items[idx].quantity--; }
    else { this.items.splice(idx, 1); }
    this._persist();
    this.render();
  },

  getQuantity(itemId) { return this.items.find(i => i.id === itemId)?.quantity || 0; },
  getCount()  { return this.items.reduce((s, i) => s + i.quantity, 0); },
  getSubtotal(){ return this.items.reduce((s, i) => s + i.price * i.quantity, 0); },

  _getStorageKey() {
    return _restaurantId ? `ms_cart_${_restaurantId}` : 'ms_cart_generic';
  },

  _persist() {
    try { sessionStorage.setItem(this._getStorageKey(), JSON.stringify(this.items)); } catch {}
  },
  _restore() {
    try {
      const saved = sessionStorage.getItem(this._getStorageKey());
      if (saved) this.items = JSON.parse(saved);
      else this.items = [];
    } catch {
      this.items = [];
    }
  },
  _flashBadge() {
    const b = document.getElementById('cart-badge');
    if (!b) return;
    b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  },

  render() {
    const count    = this.getCount();
    const subtotal = this.getSubtotal();
    const tax      = Math.round(subtotal * 0.05);
    const grand    = subtotal + tax;

    // Badge
    ['cart-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = count; el.style.display = count > 0 ? 'flex' : 'none'; }
    });

    // Totals
    _setText('cart-subtotal', `₹${subtotal}`);
    _setText('cart-tax',      `₹${tax}`);
    _setText('cart-grand',    `₹${grand}`);

    const orderBtn = document.getElementById('place-order-btn');
    if (orderBtn) orderBtn.disabled = count === 0;

    // Cart items list
    const cartList = document.getElementById('cart-items-list');
    if (cartList) {
      if (this.items.length === 0) {
        cartList.innerHTML = `
          <div class="cart-empty-state">
            <div class="cart-empty-icon">🛒</div>
            <p>Your cart is empty</p>
            <span>Add items from the menu to get started</span>
          </div>`;
      } else {
        cartList.innerHTML = this.items.map(item => `
          <div class="cart-row" id="cr-${item.id}">
            <div class="cart-row-left">
              <div class="veg-dot-sm ${item.isVegetarian ? 'veg' : 'nonveg'}"></div>
              <div class="cart-row-info">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-unit">${item.currency}${item.price} each</span>
              </div>
            </div>
            <div class="cart-row-right">
              <div class="cart-qty-ctrl">
                <button class="cqb" onclick="Cart.remove('${item.id}')">−</button>
                <span class="cqn">${item.quantity}</span>
                <button class="cqb" onclick="addToCart(${_esc(item)})">+</button>
              </div>
              <span class="cart-line-price">${item.currency}${item.price * item.quantity}</span>
            </div>
          </div>`).join('');
      }
    }

    // Sync ADD buttons on cards
    document.querySelectorAll('.menu-card[data-id]').forEach(card => {
      const id  = card.dataset.id;
      const qty = this.getQuantity(id);
      const addBtn = card.querySelector('.add-btn');
      const qtyCtrl = card.querySelector('.card-qty-ctrl');
      if (addBtn && qtyCtrl) {
        addBtn.style.display   = qty > 0 ? 'none' : 'flex';
        qtyCtrl.style.display  = qty > 0 ? 'flex' : 'none';
        const qNum = qtyCtrl.querySelector('.card-qty-num');
        if (qNum) qNum.textContent = qty;
      }
    });
  }
};

// ═══════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════
let _restaurantId   = null;
let _tableNumber    = null;
let _activeCategory = 'All';
let _searchQuery    = '';
let _vegOnly        = false;
let _lastOrderId    = null;

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function initMenu() {
  const params = new URLSearchParams(window.location.search);
  _restaurantId = params.get('restaurant');
  _tableNumber  = params.get('table');

  if (!_restaurantId) {
    _showError('No restaurant specified', 'Scan a QR code or visit the restaurant directory.');
    return;
  }

  try {
    await DB.load();
    const restaurant = DB.getRestaurant(_restaurantId);

    if (!restaurant) {
      _showError(`Restaurant not found: "${_restaurantId}"`, 'This ID is not in our database yet.');
      return;
    }

    Cart._restore();
    _applyTheme(restaurant);
    _renderHeader(restaurant);
    _renderCategoryTabs();
    _renderItems();
    _setupSearch();
    _setupKeyboardListeners();
    Cart.render();

    document.title = `${restaurant.name} — MenuScan`;
    document.getElementById('loading-overlay').classList.add('gone');
    document.getElementById('menu-app').style.display = 'block';

    // Log anonymous MENU_VIEW analytics event
    DB.logAnalyticsEvent(_restaurantId, 'MENU_VIEW', {
      table: _tableNumber || 'Direct',
      referrer: document.referrer || 'Direct'
    });

  } catch (err) {
    _showError('Failed to load menu', err.message);
  }
}

// ═══════════════════════════════════════════════
// THEME (CSS custom properties)
// ═══════════════════════════════════════════════
function _applyTheme(r) {
  const root = document.documentElement;
  root.style.setProperty('--theme',    r.themeColor);
  root.style.setProperty('--accent',   r.accentColor);
  root.style.setProperty('--theme-10', r.themeColor + '1a');
  root.style.setProperty('--theme-30', r.themeColor + '4d');
  root.style.setProperty('--theme-60', r.themeColor + '99');

  const hero = document.getElementById('restaurant-hero');
  if (hero) {
    hero.style.background =
      `linear-gradient(135deg, ${r.themeColor}dd 0%, ${r.accentColor}aa 55%, #0d0d14 100%)`;
  }
  // Sticky nav accent line
  const nav = document.getElementById('sticky-nav');
  if (nav) nav.style.borderBottom = `2px solid ${r.themeColor}44`;
}

// ═══════════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════════
function _renderHeader(r) {
  _setText('r-logo',    r.logoEmoji);
  _setText('r-name',    r.name);
  _setText('r-tagline', r.tagline);
  _setText('r-cuisine', r.cuisine);
  _setText('r-rating',  `⭐ ${r.rating.toFixed(1)}`);
  _setText('r-address', `📍 ${r.address}`);
  _setText('r-hours',   r.openTime && r.closeTime ? `🕐 ${r.openTime} – ${r.closeTime}` : '');
  _setText('r-items',   `🍽️ ${DB.getMenuItems(_restaurantId).length} dishes`);
  _setText('mbi-name',  r.name);

  // Table indicator
  const tableChip = document.getElementById('r-table');
  const tableInput = document.getElementById('cart-table-input');
  if (_tableNumber) {
    if (tableChip) {
      tableChip.textContent = `🪑 Table #${_tableNumber}`;
      tableChip.style.display = 'inline-flex';
    }
    if (tableInput) {
      tableInput.value = `Table ${_tableNumber}`;
    }
  } else {
    if (tableInput && !tableInput.value) {
      tableInput.value = 'Table 1';
    }
  }
}

// ═══════════════════════════════════════════════
// CATEGORY TABS
// ═══════════════════════════════════════════════
const CAT_ICONS = {
  All: '🍽️', Starters: '🥗', 'Main Course': '🍛',
  Desserts: '🍮', Beverages: '🥤', Breads: '🫓',
  Soups: '🍲', Sides: '🍟', Salads: '🥙'
};

function _renderCategoryTabs() {
  const cats = DB.getCategories(_restaurantId);
  const wrap = document.getElementById('category-tabs');
  if (!wrap) return;
  wrap.innerHTML = cats.map(cat => `
    <button class="cat-tab ${cat === _activeCategory ? 'active' : ''}"
            onclick="selectCategory('${cat}')">
      ${CAT_ICONS[cat] || '🍴'} ${cat}
    </button>`).join('');
}

function selectCategory(cat) {
  _activeCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(b =>
    b.classList.toggle('active', b.textContent.trim().endsWith(cat))
  );
  _renderItems();
  document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════════════════
const CAT_GRADIENTS = {
  'Starters':    'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
  'Main Course': 'linear-gradient(135deg,#f6d365 0%,#fda085 100%)',
  'Desserts':    'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)',
  'Beverages':   'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)',
  'Breads':      'linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)',
  'Soups':       'linear-gradient(135deg,#fa709a 0%,#fee140 100%)',
  'Sides':       'linear-gradient(135deg,#a18cd1 0%,#fbc2eb 100%)'
};
const SPICE_DOTS = { None: '', Mild: '🌶 Mild', Medium: '🌶🌶 Med', Hot: '🌶🌶🌶 Hot' };

function _renderItems() {
  const items = DB.getMenuItems(_restaurantId, {
    category: _activeCategory, search: _searchQuery, vegOnly: _vegOnly
  });

  const grid    = document.getElementById('menu-grid');
  const noRes   = document.getElementById('no-results');
  const countEl = document.getElementById('result-count');

  if (countEl) countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = '';
    if (noRes) noRes.style.display = 'flex';
    return;
  }
  if (noRes) noRes.style.display = 'none';
  grid.innerHTML = items.map(_buildCard).join('');
  Cart.render(); // sync qty buttons
}

function _buildCard(item) {
  const grad  = CAT_GRADIENTS[item.category] || CAT_GRADIENTS['Starters'];
  const spice = SPICE_DOTS[item.spiceLevel] || '';
  const qty   = Cart.getQuantity(item.id);

  const imgContent = item.imageUrl
    ? `<img src="${item.imageUrl}" alt="${item.name}" class="dish-photo" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><span class="card-emoji" style="display:none;">${item.emoji}</span>`
    : `<span class="card-emoji">${item.emoji}</span>`;

  return `
    <div class="menu-card ${item.isAvailable ? '' : 'sold-out'}" data-id="${item.id}">
      <div class="card-img" style="background:${grad}">
        ${imgContent}
        ${item.isBestseller ? `<div class="bs-badge">⭐ Bestseller</div>` : ''}
        ${!item.isAvailable ? `<div class="sold-overlay">Sold Out</div>` : ''}
      </div>
      <div class="card-body">
        <div class="card-meta-row">
          <div class="veg-box ${item.isVegetarian ? 'veg' : 'nonveg'}"
               title="${item.isVegetarian ? 'Vegetarian' : 'Non-Vegetarian'}">
            <div class="veg-inner"></div>
          </div>
          ${spice ? `<span class="spice-label" title="Spice level: ${item.spiceLevel}">${spice}</span>` : ''}
        </div>
        <h3 class="card-name">${item.name}</h3>
        <p class="card-desc">${item.description}</p>
        <div class="card-footer">
          <span class="card-price">${item.currency}${item.price}</span>
          ${item.isAvailable ? `
            <button class="add-btn" onclick='addToCart(${_esc(item)})'
                    style="display:${qty > 0 ? 'none' : 'flex'}">
              ADD +
            </button>
            <div class="card-qty-ctrl" style="display:${qty > 0 ? 'flex' : 'none'}">
              <button class="cqb-sm" onclick="Cart.remove('${item.id}')">−</button>
              <span class="card-qty-num">${qty}</span>
              <button class="cqb-sm" onclick='addToCart(${_esc(item)})'>+</button>
            </div>
          ` : `<span class="na-label">Unavailable</span>`}
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════
// ACTIONS (called from HTML)
// ═══════════════════════════════════════════════
function addToCart(item) {
  if (!item.isAvailable) return;
  Cart.add(item);
}

function toggleCart() {
  document.getElementById('cart-sidebar')?.classList.toggle('open');
  document.getElementById('cart-overlay')?.classList.toggle('visible');
}

function closeCart() {
  document.getElementById('cart-sidebar')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('visible');
}

function placeOrder() {
  if (Cart.items.length === 0) return;
  const sub   = Cart.getSubtotal();
  const tax   = Math.round(sub * 0.05);
  const grand = sub + tax;
  const r     = DB.getRestaurant(_restaurantId);
  const tableInput = document.getElementById('cart-table-input');
  const tableVal   = tableInput?.value.trim() || (_tableNumber ? `Table ${_tableNumber}` : 'Table 1');
  const notesInput = document.getElementById('cart-notes-input');
  const notesVal   = notesInput?.value.trim() || '';

  const list  = Cart.items.map(i => `  • ${i.name} ×${i.quantity}  =  ₹${i.price * i.quantity}`).join('\n');
  const ok    = confirm(`🎉 Confirm your order at ${r?.name || 'the restaurant'}\n` +
                        `Dining at: ${tableVal}\n\n` +
                        `${list}\n\n` +
                        `Subtotal: ₹${sub}\nGST (5%): ₹${tax}\n─────────────\nTotal: ₹${grand}\n\nProceed?`);
  if (ok) {
    const num = 'ORD' + Date.now().toString().slice(-6);
    _lastOrderId = '#' + num;

    // Save to Database Layer
    DB.saveOrder({
      orderId: num,
      restaurantId: _restaurantId,
      restaurantName: r?.name || '',
      tableNumber: tableVal,
      items: Cart.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, isVegetarian: i.isVegetarian })),
      subtotal: sub,
      tax: tax,
      grandTotal: grand,
      notes: notesVal
    });

    Cart.items = [];
    Cart._persist();
    Cart.render();
    closeCart();

    _setText('success-rest-name',   r?.name || 'Restaurant');
    _setText('success-table-num',   tableVal);
    _setText('success-order-num',   '#' + num);
    _setText('success-order-total', `₹${grand}`);
    document.getElementById('order-success-modal').style.display = 'flex';
  }
}

function closeSuccessModal() {
  document.getElementById('order-success-modal').style.display = 'none';
}

function copyOrderRef() {
  if (_lastOrderId) {
    navigator.clipboard.writeText(_lastOrderId).then(() => {
      alert(`Copied Order Reference ${_lastOrderId} to clipboard!`);
    }).catch(() => {
      prompt('Copy Order Reference:', _lastOrderId);
    });
  }
}

function handleVegToggle() {
  _vegOnly = document.getElementById('veg-toggle')?.checked || false;
  _renderItems();
}

// ═══════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════
function _setupSearch() {
  const inp = document.getElementById('search-input');
  if (!inp) return;
  let timer;
  inp.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { _searchQuery = e.target.value; _renderItems(); }, 280);
  });
}

function _setupKeyboardListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCart();
      closeSuccessModal();
    }
  });
}

// ═══════════════════════════════════════════════
// ERROR STATE
// ═══════════════════════════════════════════════
function _showError(title, detail = '') {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.innerHTML = `
      <div class="err-card">
        <div class="err-icon">⚠️</div>
        <h2>${title}</h2>
        ${detail ? `<p>${detail}</p>` : ''}
        <a href="index.html" class="back-home-link">← Back to Home</a>
      </div>`;
  }
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Safely JSON-encode item for inline onclick, escaping double-quotes */
function _esc(obj) {
  return JSON.stringify(obj).replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', initMenu);
