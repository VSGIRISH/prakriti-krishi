/* ===== Prakriti Krishi — Full App Logic ===== */

/* ============ CURRENCY ============ */
const CURRENCY = '₹';
function fmt(n) { return CURRENCY + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

/* ============ AUTH / ACCOUNT ============ */
const Auth = {
  KEY: 'pk_users',
  SESSION: 'pk_session',
  ADDR_KEY: 'pk_active_addr',

  _users() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  _save(users) { localStorage.setItem(this.KEY, JSON.stringify(users)); },

  currentUser() {
    const email = sessionStorage.getItem(this.SESSION);
    if (!email) return null;
    return this._users().find(u => u.email === email) || null;
  },

  isLoggedIn() { return !!this.currentUser(); },

  register(data) {
    const users = this._users();
    if (users.find(u => u.email === data.email)) return { ok: false, msg: 'Email already registered.' };
    const user = {
      id: Date.now(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.password,
      addresses: data.address ? [{ id: 1, label: 'Home', line: data.address, city: data.city || '', state: data.state || '', pin: data.pin || '' }] : [],
      orders: [],
      subscriptions: [],
      deliveryPrefs: { callBefore: false, leaveAtDoor: false, preferredTime: '' },
      wallet: 0,
      referralCode: 'PK' + Date.now().toString(36).toUpperCase(),
      referredBy: data.referralCode || null,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    this._save(users);
    sessionStorage.setItem(this.SESSION, user.email);
    if (user.addresses.length) localStorage.setItem(this.ADDR_KEY, '0');
    // Apply referral reward
    if (data.referralCode) {
      const referrer = users.find(u => u.referralCode === data.referralCode && u.email !== user.email);
      if (referrer) {
        referrer.wallet = (referrer.wallet || 0) + 100;
        user.wallet = (user.wallet || 0) + 100;
        this._save(users);
      }
    }
    return { ok: true };
  },

  login(email, password) {
    const user = this._users().find(u => u.email === email && u.password === password);
    if (!user) return { ok: false, msg: 'Invalid email or password.' };
    sessionStorage.setItem(this.SESSION, user.email);
    if (user.addresses.length && !localStorage.getItem(this.ADDR_KEY)) localStorage.setItem(this.ADDR_KEY, '0');
    return { ok: true };
  },

  logout() { sessionStorage.removeItem(this.SESSION); },

  updateUser(fields) {
    const users = this._users();
    const idx = users.findIndex(u => u.email === sessionStorage.getItem(this.SESSION));
    if (idx < 0) return;
    Object.assign(users[idx], fields);
    this._save(users);
  },

  addAddress(addr) {
    const user = this.currentUser();
    if (!user) return;
    const addrs = user.addresses || [];
    addr.id = addrs.length ? Math.max(...addrs.map(a => a.id)) + 1 : 1;
    addrs.push(addr);
    this.updateUser({ addresses: addrs });
    return addr.id;
  },

  removeAddress(id) {
    const user = this.currentUser();
    if (!user) return;
    this.updateUser({ addresses: (user.addresses || []).filter(a => a.id !== id) });
  },

  getActiveAddress() {
    const user = this.currentUser();
    if (!user || !user.addresses.length) return null;
    const idx = parseInt(localStorage.getItem(this.ADDR_KEY) || '0', 10);
    return user.addresses[idx] || user.addresses[0];
  },

  setActiveAddress(idx) { localStorage.setItem(this.ADDR_KEY, String(idx)); },

  addOrder(order) {
    const user = this.currentUser();
    if (!user) return;
    const orders = user.orders || [];
    order.id = 'PK' + Date.now();
    order.date = new Date().toISOString();
    order.status = 'Placed';
    order.tracking = [{ status: 'Order Placed', time: new Date().toISOString() }];
    order.deliveryPrefs = user.deliveryPrefs || {};
    orders.unshift(order);
    this.updateUser({ orders });
    // Track purchases
    (order.items || []).forEach(i => Tracker.trackPurchase(i.id, i.qty));
  },

  changePassword(oldPw, newPw) {
    const user = this.currentUser();
    if (!user) return { ok: false, msg: 'Not logged in.' };
    if (user.password !== oldPw) return { ok: false, msg: 'Current password is incorrect.' };
    this.updateUser({ password: newPw });
    return { ok: true };
  }
};

/* ============ BEHAVIOR TRACKER ============ */
const Tracker = {
  KEY: 'pk_behavior',
  _data() { try { return JSON.parse(localStorage.getItem(this.KEY)) || { views: {}, purchases: {}, lastViewed: [] }; } catch { return { views: {}, purchases: {}, lastViewed: [] }; } },
  _save(d) { localStorage.setItem(this.KEY, JSON.stringify(d)); },

  trackView(productId) {
    const d = this._data();
    d.views[productId] = (d.views[productId] || 0) + 1;
    d.lastViewed = [productId, ...d.lastViewed.filter(id => id !== productId)].slice(0, 20);
    this._save(d);
  },

  trackPurchase(productId, qty) {
    const d = this._data();
    if (!d.purchases[productId]) d.purchases[productId] = { count: 0, totalQty: 0, first: new Date().toISOString() };
    d.purchases[productId].count++;
    d.purchases[productId].totalQty += qty;
    d.purchases[productId].last = new Date().toISOString();
    this._save(d);
  },

  getMostViewed(limit) { const d = this._data(); return Object.entries(d.views).sort((a, b) => b[1] - a[1]).slice(0, limit || 6).map(e => parseInt(e[0])); },
  getMostPurchased(limit) { const d = this._data(); return Object.entries(d.purchases).sort((a, b) => b[1].totalQty - a[1].totalQty).slice(0, limit || 6).map(e => parseInt(e[0])); },
  getRecentlyViewed(limit) { return this._data().lastViewed.slice(0, limit || 8); },

  getTodaysEssentials() {
    const d = this._data();
    const freq = Object.entries(d.purchases).filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count).map(e => parseInt(e[0]));
    const defaults = [1, 5, 3, 9, 2, 7];
    return [...new Set([...freq, ...defaults])].slice(0, 6);
  }
};

/* ============ STORE / PRODUCTS ============ */
const Store = {
  STORAGE_KEY: 'prakriti_cart',

  products: [
    { id: 1, name: 'Ashwagandha Powder', price: 499, oldPrice: 699, cat: 'herbs', tag: 'Bestseller', emoji: '🌿', desc: 'Organic ashwagandha root powder for stress relief and vitality. Sourced from certified organic farms in Madhya Pradesh.', tags: ['best_seller', 'most_bought'], stock: 50 },
    { id: 2, name: 'Turmeric Golden Milk', price: 349, oldPrice: null, cat: 'wellness', tag: 'New', emoji: '🥛', desc: 'Premium turmeric latte blend with black pepper for enhanced absorption. A warming, anti-inflammatory drink.', tags: ['new'], stock: 35 },
    { id: 3, name: 'Neem Face Wash', price: 249, oldPrice: 349, cat: 'skincare', tag: 'Popular', emoji: '🧴', desc: 'Gentle neem and tea tree face wash for clear, blemish-free skin. Suitable for all skin types.', tags: ['best_seller'], stock: 80 },
    { id: 4, name: 'Brahmi Hair Oil', price: 399, oldPrice: null, cat: 'haircare', tag: 'Organic', emoji: '🫧', desc: 'Cold-pressed brahmi oil blended with coconut and amla for strong, lustrous hair.', tags: ['most_bought'], stock: 25 },
    { id: 5, name: 'Tulsi Green Tea', price: 199, oldPrice: 299, cat: 'wellness', tag: 'Sale', emoji: '🍵', desc: 'Holy basil and green tea blend. Rich in antioxidants for daily immunity support.', tags: ['best_seller', 'most_bought'], stock: 100 },
    { id: 6, name: 'Aloe Vera Gel', price: 299, oldPrice: null, cat: 'skincare', tag: 'Pure', emoji: '🪴', desc: '99% pure aloe vera gel for soothing sunburn, moisturising skin, and minor cuts.', tags: [], stock: 60 },
    { id: 7, name: 'Triphala Capsules', price: 449, oldPrice: 599, cat: 'herbs', tag: 'Ayurvedic', emoji: '💊', desc: 'Traditional triphala blend in vegetarian capsules for digestive health and detoxification.', tags: ['most_bought'], stock: 40 },
    { id: 8, name: 'Rose Water Toner', price: 229, oldPrice: null, cat: 'skincare', tag: 'Natural', emoji: '🌹', desc: 'Steam-distilled rose water toner to hydrate, tone, and refresh your skin naturally.', tags: ['new'], stock: 55 },
    { id: 9, name: 'Moringa Leaf Powder', price: 349, oldPrice: 499, cat: 'herbs', tag: 'Superfood', emoji: '🌱', desc: 'Nutrient-dense moringa powder packed with vitamins, minerals, and amino acids.', tags: ['new', 'limited_stock'], stock: 8 },
    { id: 10, name: 'Coconut Oil (Virgin)', price: 299, oldPrice: null, cat: 'haircare', tag: 'Cold-Pressed', emoji: '🥥', desc: 'Unrefined virgin coconut oil for cooking, hair care, and skin moisturising.', tags: ['best_seller'], stock: 70 },
    { id: 11, name: 'Saffron Face Cream', price: 599, oldPrice: 849, cat: 'skincare', tag: 'Premium', emoji: '✨', desc: 'Luxurious saffron-infused face cream for radiant, even-toned skin.', tags: ['limited_stock'], stock: 5 },
    { id: 12, name: 'Chamomile Sleep Tea', price: 219, oldPrice: null, cat: 'wellness', tag: 'Calming', emoji: '🌼', desc: 'Soothing chamomile and lavender blend to promote restful sleep.', tags: [], stock: 45 },
  ],

  bundles: [
    { id: 'b1', name: 'Weekly Vegetable Box', price: 499, oldPrice: 599, cat: 'bundle', tag: 'Bundle', emoji: '🥬', desc: 'Curated box of 5 kg seasonal organic vegetables — onions, tomatoes, potatoes, greens & more.', tags: ['best_seller'], stock: 30, items: ['Mixed Vegetables 5 kg'] },
    { id: 'b2', name: 'Weekly Fruit Box', price: 549, oldPrice: 699, cat: 'bundle', tag: 'Bundle', emoji: '🍎', desc: 'Fresh seasonal fruit box — bananas, apples, oranges, and surprise seasonal picks. ~4 kg.', tags: ['new'], stock: 25, items: ['Mixed Fruits 4 kg'] },
    { id: 'b3', name: 'Breakfast Essentials Pack', price: 399, oldPrice: 480, cat: 'bundle', tag: 'Bundle', emoji: '🍳', desc: 'Farm eggs (6 pc), fresh milk (1 L), artisan bread, organic honey 250 g.', tags: ['best_seller'], stock: 20, items: ['Eggs 6 pc', 'Milk 1 L', 'Bread', 'Honey 250 g'] },
    { id: 'b4', name: 'Immunity Booster Kit', price: 999, oldPrice: 1247, cat: 'bundle', tag: 'Bundle', emoji: '🛡️', desc: 'Ashwagandha + Tulsi Tea + Moringa + Turmeric Golden Milk — complete immunity bundle.', tags: ['most_bought'], stock: 15, linkedProducts: [1, 5, 9, 2], items: ['Ashwagandha Powder', 'Tulsi Green Tea', 'Moringa Powder', 'Turmeric Golden Milk'] },
    { id: 'b5', name: 'Skincare Starter Set', price: 699, oldPrice: 877, cat: 'bundle', tag: 'Bundle', emoji: '💆', desc: 'Neem Face Wash + Rose Water Toner + Aloe Vera Gel — start your natural skincare journey.', tags: ['new'], stock: 18, linkedProducts: [3, 8, 6], items: ['Neem Face Wash', 'Rose Water Toner', 'Aloe Vera Gel'] },
    { id: 'b6', name: 'Hair Repair Bundle', price: 649, oldPrice: 798, cat: 'bundle', tag: 'Bundle', emoji: '💇', desc: 'Brahmi Hair Oil + Virgin Coconut Oil — restore shine and strength.', tags: [], stock: 22, linkedProducts: [4, 10], items: ['Brahmi Hair Oil', 'Coconut Oil'] },
  ],

  upsellRules: {
    1: [7, 9, 2], 2: [5, 12, 1], 3: [8, 6, 11], 4: [10, 3, 6],
    5: [12, 2, 1], 6: [3, 8, 11], 7: [1, 9, 5], 8: [3, 6, 11],
    9: [1, 7, 2], 10: [4, 3, 6], 11: [8, 3, 6], 12: [5, 2, 1],
  },

  alsoBought: {
    1: [5, 7, 9], 2: [5, 1, 12], 3: [6, 8, 4], 4: [10, 3, 8],
    5: [1, 2, 12], 6: [3, 8, 11], 7: [1, 9, 5], 8: [3, 11, 6],
    9: [1, 7, 2], 10: [4, 6, 3], 11: [3, 8, 6], 12: [5, 2, 1],
  },

  getCart() { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } catch { return []; } },
  saveCart(cart) { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cart)); },

  addToCart(productId, qty) {
    if (!qty) qty = 1;
    if (!Auth.isLoggedIn()) { window.location = 'account.html?m=login&next=' + encodeURIComponent(window.location.href); return; }
    const cart = this.getCart();
    const idx = cart.findIndex(i => i.id === productId);
    if (idx > -1) cart[idx].qty += qty;
    else cart.push({ id: productId, qty: qty });
    this.saveCart(cart);
    this.updateCartBadge();
    this.refreshCardButtons();
    showToast('Added to cart!');
  },

  removeFromCart(productId) {
    const cart = this.getCart().filter(i => i.id !== productId);
    this.saveCart(cart);
    this.updateCartBadge();
    this.refreshCardButtons();
  },

  setQty(productId, qty) {
    if (qty < 1) { this.removeFromCart(productId); return; }
    const cart = this.getCart();
    const item = cart.find(i => i.id === productId);
    if (item) item.qty = qty;
    this.saveCart(cart);
    this.updateCartBadge();
    this.refreshCardButtons();
  },

  cartItemQty(productId) {
    const item = this.getCart().find(i => i.id === productId);
    return item ? item.qty : 0;
  },

  getProduct(id) {
    return this.products.find(p => p.id === id) || this.bundles.find(b => b.id === id) || null;
  },

  cartTotal() {
    return this.getCart().reduce((sum, item) => {
      const p = this.getProduct(item.id);
      return p ? sum + p.price * item.qty : sum;
    }, 0);
  },
  cartCount() { return this.getCart().reduce((s, i) => s + i.qty, 0); },

  updateCartBadge() {
    document.querySelectorAll('.cart-count').forEach(el => {
      const c = this.cartCount();
      el.textContent = c;
      el.style.display = c > 0 ? 'flex' : 'none';
    });
  },

  refreshCardButtons() {
    document.querySelectorAll('.prod-card').forEach(card => {
      const actionsDiv = card.querySelector('.prod-actions');
      if (!actionsDiv) return;
      const pidRaw = actionsDiv.dataset.pid;
      const pid = /^\d+$/.test(pidRaw) ? parseInt(pidRaw, 10) : pidRaw;
      if (!pid && pid !== 0) return;
      const qty = this.cartItemQty(pid);
      const btnArea = actionsDiv.querySelector('.atc-area');
      if (!btnArea) return;
      if (qty > 0) {
        btnArea.innerHTML = '<div class="inline-qty"><button class="iq-btn" onclick="event.stopPropagation();Store.setQty(\'' + pid + '\',' + (qty - 1) + ')">&#8722;</button><span class="iq-val">' + qty + '</span><button class="iq-btn" onclick="event.stopPropagation();Store.setQty(\'' + pid + '\',' + (qty + 1) + ')">+</button></div>';
      } else {
        btnArea.innerHTML = '<button class="btn btn-primary" onclick="event.stopPropagation();Store.addToCart(\'' + pid + '\')">Add to Cart</button>';
      }
    });
  },

  getUpsellProducts() {
    const cart = this.getCart();
    const cartIds = new Set(cart.map(i => String(i.id)));
    const recs = new Set();
    cart.forEach(item => {
      const rules = this.upsellRules[item.id];
      if (rules) rules.forEach(rid => { if (!cartIds.has(String(rid))) recs.add(rid); });
    });
    return [...recs].slice(0, 4).map(id => this.getProduct(id)).filter(Boolean);
  },

  getAlsoBought(productId) {
    return (this.alsoBought[productId] || []).map(id => this.getProduct(id)).filter(Boolean);
  },

  reorder(order) {
    if (!Auth.isLoggedIn()) return;
    let added = 0;
    (order.items || []).forEach(item => {
      const product = this.products.find(p => p.id === item.id || p.name === item.name);
      if (product && product.stock > 0) { this.addToCart(product.id, item.qty); added++; }
    });
    if (added === 0) showToast('No items could be re-added (out of stock).');
  },

  search(query) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const results = [];
    this.products.forEach(p => {
      const s = (p.name.toLowerCase().includes(q) ? 10 : 0) + (p.cat.includes(q) ? 5 : 0) + (p.desc.toLowerCase().includes(q) ? 2 : 0) + ((p.tag || '').toLowerCase().includes(q) ? 3 : 0);
      if (s > 0) results.push({ product: p, score: s, type: 'product' });
    });
    this.bundles.forEach(b => {
      const s = (b.name.toLowerCase().includes(q) ? 10 : 0) + (b.desc.toLowerCase().includes(q) ? 2 : 0);
      if (s > 0) results.push({ product: b, score: s, type: 'bundle' });
    });
    ['Herbs|herbs|🌿', 'Skincare|skincare|🧴', 'Hair Care|haircare|🫧', 'Wellness|wellness|🍵', 'Bundles|bundle|📦'].forEach(c => {
      const [name, cat, emoji] = c.split('|');
      if (name.toLowerCase().includes(q) || cat.includes(q)) results.push({ cat, name, emoji, score: 5, type: 'category' });
    });
    return results.sort((a, b) => b.score - a.score);
  },

  allDisplayProducts() {
    return [...this.products, ...this.bundles];
  }
};

/* ============ RECIPES ============ */
const Recipes = [
  { id: 'r1', title: 'Golden Turmeric Latte', emoji: '☕', time: '5 min', servings: 1, desc: 'A warming anti-inflammatory drink that supports immunity and digestion.', ingredients: [{ productId: 2, name: 'Turmeric Golden Milk', qty: '1 tsp' }], steps: ['Heat 200 ml milk (dairy or plant-based).', 'Add 1 teaspoon Turmeric Golden Milk powder.', 'Whisk until frothy and well combined.', 'Sweeten with honey or jaggery to taste.', 'Serve warm — enjoy daily!'] },
  { id: 'r2', title: 'Immunity Kadha', emoji: '🫖', time: '15 min', servings: 2, desc: 'Traditional Ayurvedic decoction to boost immunity — especially good during seasonal changes.', ingredients: [{ productId: 5, name: 'Tulsi Green Tea', qty: '1 bag' }, { productId: 1, name: 'Ashwagandha Powder', qty: '½ tsp' }, { productId: 9, name: 'Moringa Leaf Powder', qty: '½ tsp' }], steps: ['Boil 500 ml water with tulsi tea bag for 5 minutes.', 'Add ashwagandha and moringa powders.', 'Simmer on low for 8-10 minutes.', 'Strain, add honey and a squeeze of lemon.', 'Drink warm twice a day for best results.'] },
  { id: 'r3', title: 'Neem-Aloe Face Mask', emoji: '🧖', time: '20 min', servings: 1, desc: 'A purifying face mask for acne-prone skin using natural ingredients.', ingredients: [{ productId: 3, name: 'Neem Face Wash', qty: '1 pump' }, { productId: 6, name: 'Aloe Vera Gel', qty: '1 tbsp' }], steps: ['Mix 1 pump of Neem Face Wash with 1 tablespoon Aloe Vera Gel.', 'Add a pinch of turmeric powder (optional).', 'Apply evenly to clean face avoiding eye area.', 'Leave on for 15 minutes.', 'Rinse with lukewarm water and pat dry.'] },
  { id: 'r4', title: 'Overnight Hair Growth Serum', emoji: '💆', time: '5 min + overnight', servings: 1, desc: 'Nourishing oil blend for thicker, stronger hair with regular use.', ingredients: [{ productId: 4, name: 'Brahmi Hair Oil', qty: '2 tbsp' }, { productId: 10, name: 'Coconut Oil (Virgin)', qty: '1 tbsp' }], steps: ['Warm 2 tbsp Brahmi Hair Oil + 1 tbsp Coconut Oil gently.', 'Part hair into sections and apply to scalp.', 'Massage in circular motions for 5-10 minutes.', 'Leave overnight (use an old towel on your pillow).', 'Wash out in the morning with a mild shampoo.'] },
  { id: 'r5', title: 'Chamomile Night Ritual', emoji: '🌙', time: '30 min', servings: 1, desc: 'Complete wind-down routine for better sleep — inside and out.', ingredients: [{ productId: 12, name: 'Chamomile Sleep Tea', qty: '1 bag' }, { productId: 11, name: 'Saffron Face Cream', qty: 'pea-sized' }, { productId: 8, name: 'Rose Water Toner', qty: '2 sprays' }], steps: ['Brew Chamomile Sleep Tea 30 min before bed.', 'Cleanse your face and spray Rose Water Toner.', 'Apply a pea-sized amount of Saffron Face Cream.', 'Sip tea slowly while reading or journaling.', 'Lights out — expect deep, restful sleep!'] },
  { id: 'r6', title: 'Triphala Detox Smoothie', emoji: '🥤', time: '5 min', servings: 1, desc: 'A gut-cleansing smoothie packed with superfoods for daily detox.', ingredients: [{ productId: 7, name: 'Triphala Capsules', qty: '1 capsule (opened)' }, { productId: 9, name: 'Moringa Leaf Powder', qty: '½ tsp' }], steps: ['Open 1 Triphala capsule into a blender.', 'Add ½ tsp Moringa powder, 1 banana, handful of spinach.', 'Pour in 200 ml water or coconut water.', 'Blend until smooth.', 'Drink first thing in the morning on an empty stomach.'] },
];

/* ============ HARVEST CALENDAR ============ */
const HarvestCalendar = {
  months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  data: [
    { name: 'Ashwagandha', emoji: '🌿', months: [0,1,2,10,11], peak: 'Nov-Feb', region: 'Madhya Pradesh, Rajasthan' },
    { name: 'Turmeric', emoji: '🟡', months: [0,1,2], peak: 'Jan-Mar', region: 'Andhra Pradesh, Tamil Nadu' },
    { name: 'Neem', emoji: '🌳', months: [2,3,4], peak: 'Mar-May', region: 'Pan-India' },
    { name: 'Brahmi', emoji: '🍃', months: [5,6,7,8], peak: 'Jun-Sep', region: 'Kerala, Karnataka' },
    { name: 'Tulsi', emoji: '🌱', months: [3,4,5,6,7,8,9], peak: 'Apr-Oct', region: 'Pan-India' },
    { name: 'Aloe Vera', emoji: '🪴', months: [0,1,2,3,4,5,6,7,8,9,10,11], peak: 'Year-round', region: 'Rajasthan, Gujarat' },
    { name: 'Moringa', emoji: '🌿', months: [2,3,4,5,6,7], peak: 'Mar-Aug', region: 'Tamil Nadu, Andhra Pradesh' },
    { name: 'Saffron', emoji: '🌸', months: [9,10], peak: 'Oct-Nov', region: 'Kashmir' },
    { name: 'Chamomile', emoji: '🌼', months: [2,3,4], peak: 'Mar-May', region: 'Himachal Pradesh, Uttarakhand' },
    { name: 'Rose', emoji: '🌹', months: [1,2,3,4], peak: 'Feb-May', region: 'Rajasthan, Uttar Pradesh' },
    { name: 'Coconut', emoji: '🥥', months: [0,1,2,3,4,5,6,7,8,9,10,11], peak: 'Year-round', region: 'Kerala, Karnataka, Tamil Nadu' },
    { name: 'Alphonso Mango', emoji: '🥭', months: [3,4,5], peak: 'Apr-Jun', region: 'Maharashtra, Gujarat' },
    { name: 'Guava', emoji: '🍏', months: [9,10,11,0,1], peak: 'Oct-Feb', region: 'Uttar Pradesh, Bihar' },
    { name: 'Pomegranate', emoji: '🫐', months: [8,9,10,11,0,1], peak: 'Sep-Feb', region: 'Maharashtra, Karnataka' },
  ],
  getCurrentSeason() {
    const m = new Date().getMonth();
    return this.data.filter(d => d.months.includes(m));
  }
};

/* ============ TOAST ============ */
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

/* ============ MOBILE NAV ============ */
function initMobileNav() {
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) toggle.addEventListener('click', () => nav.classList.toggle('open'));
}

/* ============ ADDRESS BAR ============ */
function initAddressBar() {
  const bar = document.getElementById('addressBar');
  if (!bar) return;
  const user = Auth.currentUser();
  if (!user || !user.addresses.length) {
    bar.innerHTML = '<span class="addr-text">No address set</span>' + (Auth.isLoggedIn() ? '<a href="account.html?tab=details" class="addr-change">+ Add</a>' : '<a href="account.html?m=login" class="addr-change">Login</a>');
    return;
  }
  const addr = Auth.getActiveAddress();
  const short = (addr.line || '').substring(0, 28) + ((addr.line || '').length > 28 ? '\u2026' : '') + (addr.city ? ', ' + addr.city : '');
  bar.innerHTML = '<span class="addr-pin">\uD83D\uDCCD</span><span class="addr-text">' + short + '</span><button class="addr-change" onclick="toggleAddrDropdown(event)">Change</button>';
  let dd = document.getElementById('addrDropdown');
  if (!dd) { dd = document.createElement('div'); dd.id = 'addrDropdown'; dd.className = 'addr-dropdown'; bar.parentElement.appendChild(dd); }
  dd.innerHTML = user.addresses.map(function(a, i) {
    return '<div class="addr-option' + (Auth.getActiveAddress().id === a.id ? ' active' : '') + '" onclick="selectAddr(' + i + ')">' + a.label + ': ' + a.line + ', ' + a.city + '</div>';
  }).join('') + '<a href="account.html?tab=details" class="addr-option add-new">+ Add new address</a>';
}
function toggleAddrDropdown(e) { e.stopPropagation(); var dd = document.getElementById('addrDropdown'); if (dd) dd.classList.toggle('open'); }
function selectAddr(idx) { Auth.setActiveAddress(idx); initAddressBar(); var dd = document.getElementById('addrDropdown'); if (dd) dd.classList.remove('open'); }
document.addEventListener('click', function() { var dd = document.getElementById('addrDropdown'); if (dd) dd.classList.remove('open'); });

/* ============ SEARCH OVERLAY ============ */
function initSearch() {
  // Inject search button into nav
  document.querySelectorAll('.nav').forEach(function(nav) {
    if (nav.querySelector('.nav-search-btn')) return;
    var btn = document.createElement('button');
    btn.className = 'nav-search-btn';
    btn.innerHTML = '🔍';
    btn.title = 'Search';
    btn.onclick = function(e) { e.stopPropagation(); toggleSearchOverlay(); };
    var cartLink = nav.querySelector('.cart-icon');
    if (cartLink) nav.insertBefore(btn, cartLink);
  });

  // Create overlay
  if (document.getElementById('searchOverlay')) return;
  var ov = document.createElement('div');
  ov.id = 'searchOverlay';
  ov.className = 'search-overlay';
  ov.innerHTML = '<div class="search-box"><input type="text" id="searchInput" placeholder="Search products, categories, bundles\u2026" autocomplete="off"><button class="search-close" onclick="toggleSearchOverlay()">\u2715</button></div><div class="search-results" id="searchResults"></div>';
  document.body.appendChild(ov);

  var input = document.getElementById('searchInput');
  var results = document.getElementById('searchResults');
  var debounce = null;
  input.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() {
      var q = input.value.trim();
      var matches = Store.search(q);
      if (!q || !matches.length) { results.innerHTML = q ? '<p class="search-empty">No results found.</p>' : ''; return; }
      results.innerHTML = matches.slice(0, 10).map(function(m) {
        if (m.type === 'category') return '<a href="category.html?cat=' + m.cat + '" class="search-item search-cat"><span class="se">' + m.emoji + '</span><span>' + m.name + '</span><small>Category</small></a>';
        var p = m.product;
        var link = m.type === 'bundle' ? 'product.html?id=' + p.id : 'product.html?id=' + p.id;
        return '<a href="' + link + '" class="search-item"><span class="se">' + p.emoji + '</span><div><strong>' + p.name + '</strong><br><small>' + fmt(p.price) + (m.type === 'bundle' ? ' &middot; Bundle' : '') + '</small></div></a>';
      }).join('');
    }, 200);
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') toggleSearchOverlay();
  });
}

function toggleSearchOverlay() {
  var ov = document.getElementById('searchOverlay');
  if (!ov) return;
  ov.classList.toggle('open');
  if (ov.classList.contains('open')) {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    setTimeout(function() { document.getElementById('searchInput').focus(); }, 100);
  }
}

/* ============ PRODUCT CARD RENDERER ============ */
function renderProductCards(container, products) {
  if (!container) return;
  var cart = Store.getCart();
  container.innerHTML = products.map(function(p) {
    var cItem = cart.find(function(i) { return i.id === p.id; });
    var qty = cItem ? cItem.qty : 0;
    var isNum = typeof p.id === 'number';
    var pidStr = String(p.id);
    var atcHTML = qty > 0
      ? '<div class="inline-qty"><button class="iq-btn" onclick="event.stopPropagation();Store.setQty(' + (isNum ? p.id : "'" + p.id + "'") + ',' + (qty - 1) + ')">&#8722;</button><span class="iq-val">' + qty + '</span><button class="iq-btn" onclick="event.stopPropagation();Store.setQty(' + (isNum ? p.id : "'" + p.id + "'") + ',' + (qty + 1) + ')">+</button></div>'
      : '<button class="btn btn-primary" onclick="event.stopPropagation();Store.addToCart(' + (isNum ? p.id : "'" + p.id + "'") + ')">Add to Cart</button>';

    // Smart tag badges
    var badges = '';
    if (p.tags && p.tags.length) {
      var badgeMap = { best_seller: '🏆 Best Seller', new: '🆕 New', most_bought: '🔥 Most Bought', limited_stock: '⚡ Limited Stock' };
      badges = '<div class="smart-badges">' + p.tags.map(function(t) { return badgeMap[t] ? '<span class="badge badge-' + t + '">' + badgeMap[t] + '</span>' : ''; }).join('') + '</div>';
    }

    var stockWarn = '';
    if (p.stock !== undefined && p.stock <= 10 && p.stock > 0) stockWarn = '<div class="stock-warn">Only ' + p.stock + ' left!</div>';
    else if (p.stock !== undefined && p.stock <= 0) stockWarn = '<div class="stock-out">Out of Stock</div>';

    return '<div class="prod-card">' +
      '<a href="product.html?id=' + p.id + '"><div class="prod-img">' + p.emoji + '</div></a>' +
      '<div class="prod-info">' +
        badges +
        '<span class="tag">' + (p.tag || '') + '</span>' +
        '<h3><a href="product.html?id=' + p.id + '">' + p.name + '</a></h3>' +
        '<div><span class="price">' + fmt(p.price) + '</span>' + (p.oldPrice ? '<span class="old-price">' + fmt(p.oldPrice) + '</span>' : '') + '</div>' +
        stockWarn +
      '</div>' +
      '<div class="prod-actions" data-pid="' + p.id + '">' +
        '<span class="atc-area">' + (p.stock <= 0 ? '<button class="btn btn-primary" disabled style="opacity:.5;cursor:not-allowed">Out of Stock</button>' : atcHTML) + '</span>' +
        '<a href="product.html?id=' + p.id + '" class="btn btn-outline">View</a>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* ============ CATEGORY FILTER (ADVANCED) ============ */
function initCategoryFilter() {
  var btns = document.querySelectorAll('.filter-btn');
  var grid = document.getElementById('categoryProducts');
  if (!btns.length || !grid) return;

  // Inject advanced filters panel
  var filterWrap = document.getElementById('advancedFilters');
  if (!filterWrap) {
    filterWrap = document.createElement('div');
    filterWrap.id = 'advancedFilters';
    filterWrap.className = 'adv-filters';
    filterWrap.innerHTML =
      '<div class="af-group"><label>Price:</label>' +
        '<button class="af-btn active" data-price="all">All</button>' +
        '<button class="af-btn" data-price="0-250">Under ' + fmt(250) + '</button>' +
        '<button class="af-btn" data-price="250-400">' + fmt(250) + '-' + fmt(400) + '</button>' +
        '<button class="af-btn" data-price="400-600">' + fmt(400) + '-' + fmt(600) + '</button>' +
        '<button class="af-btn" data-price="600+">' + fmt(600) + '+</button>' +
      '</div>' +
      '<div class="af-group"><label>Stock:</label>' +
        '<button class="af-btn active" data-stock="all">All</button>' +
        '<button class="af-btn" data-stock="in">In Stock</button>' +
        '<button class="af-btn" data-stock="out">Out of Stock</button>' +
      '</div>' +
      '<div class="af-group"><label>Tags:</label>' +
        '<button class="af-btn active" data-tag="all">All</button>' +
        '<button class="af-btn" data-tag="best_seller">🏆 Best Seller</button>' +
        '<button class="af-btn" data-tag="new">🆕 New</button>' +
        '<button class="af-btn" data-tag="most_bought">🔥 Most Bought</button>' +
        '<button class="af-btn" data-tag="limited_stock">⚡ Limited</button>' +
      '</div>';
    grid.parentElement.insertBefore(filterWrap, grid);
  }

  function getFiltered() {
    var catBtn = document.querySelector('.filter-btn.active');
    var cat = catBtn ? catBtn.dataset.cat : 'all';
    var priceBtn = filterWrap.querySelector('[data-price].active');
    var priceRange = priceBtn ? priceBtn.dataset.price : 'all';
    var stockBtn = filterWrap.querySelector('[data-stock].active');
    var stockFilter = stockBtn ? stockBtn.dataset.stock : 'all';
    var tagBtn = filterWrap.querySelector('[data-tag].active');
    var tagFilter = tagBtn ? tagBtn.dataset.tag : 'all';

    var pool = cat === 'all' ? Store.allDisplayProducts() : (cat === 'bundle' ? Store.bundles : Store.products.filter(function(p) { return p.cat === cat; }));

    return pool.filter(function(p) {
      if (priceRange !== 'all') {
        if (priceRange === '0-250' && p.price > 250) return false;
        if (priceRange === '250-400' && (p.price < 250 || p.price > 400)) return false;
        if (priceRange === '400-600' && (p.price < 400 || p.price > 600)) return false;
        if (priceRange === '600+' && p.price < 600) return false;
      }
      if (stockFilter === 'in' && (p.stock !== undefined && p.stock <= 0)) return false;
      if (stockFilter === 'out' && (p.stock === undefined || p.stock > 0)) return false;
      if (tagFilter !== 'all' && !(p.tags || []).includes(tagFilter)) return false;
      return true;
    });
  }

  function applyFilters() {
    renderProductCards(grid, getFiltered());
  }

  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      btns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      applyFilters();
    });
  });

  filterWrap.querySelectorAll('.af-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var group = btn.parentElement;
      group.querySelectorAll('.af-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      applyFilters();
    });
  });
}

/* ============ PRODUCT DETAIL PAGE ============ */
function initProductDetail() {
  var container = document.getElementById('productDetail');
  if (!container) return;
  var rawId = new URLSearchParams(window.location.search).get('id');
  if (!rawId) return;
  var id = /^\d+$/.test(rawId) ? parseInt(rawId, 10) : rawId;
  var p = Store.getProduct(id);
  if (!p) { container.innerHTML = '<p>Product not found.</p>'; return; }
  document.title = p.name + ' \u2014 Prakriti Krishi';

  // Track view
  Tracker.trackView(id);

  var qty = Math.max(1, Store.cartItemQty(p.id));
  var isBundle = typeof p.id === 'string' && p.id.startsWith('b');
  var isNum = typeof p.id === 'number';
  var pidArg = isNum ? p.id : "'" + p.id + "'";

  var bundleItems = '';
  if (isBundle && p.items) {
    bundleItems = '<div class="bundle-contents"><h4>What\'s Included:</h4><ul>' + p.items.map(function(i) { return '<li>✓ ' + i + '</li>'; }).join('') + '</ul></div>';
  }

  var badgeMap = { best_seller: '🏆 Best Seller', new: '🆕 New', most_bought: '🔥 Most Bought', limited_stock: '⚡ Limited Stock' };
  var badges = (p.tags || []).map(function(t) { return badgeMap[t] ? '<span class="badge badge-' + t + '">' + badgeMap[t] + '</span>' : ''; }).join('');

  container.innerHTML =
    '<div class="breadcrumb container"><a href="index.html">Home</a><span>\u203A</span><a href="category.html?cat=' + p.cat + '">' + p.cat + '</a><span>\u203A</span>' + p.name + '</div>' +
    '<div class="container"><div class="pd-grid">' +
      '<div class="pd-image">' + p.emoji + '</div>' +
      '<div class="pd-info">' +
        (badges ? '<div class="smart-badges" style="margin-bottom:8px">' + badges + '</div>' : '') +
        '<span class="tag" style="font-size:.85rem;padding:4px 12px">' + (p.tag || '') + '</span>' +
        '<h1>' + p.name + '</h1>' +
        '<div class="rating">\u2605\u2605\u2605\u2605\u2605 <span style="color:var(--gray-500);font-size:.85rem">(128 reviews)</span></div>' +
        '<div class="price">' + fmt(p.price) + (p.oldPrice ? ' <span class="old-price" style="font-size:1rem">' + fmt(p.oldPrice) + '</span>' : '') + '</div>' +
        (p.stock !== undefined && p.stock <= 10 && p.stock > 0 ? '<div class="stock-warn" style="margin-bottom:12px">Only ' + p.stock + ' left in stock!</div>' : '') +
        '<p class="description">' + p.desc + '</p>' +
        bundleItems +
        '<ul class="features"><li>100% Natural Ingredients</li><li>Cruelty-Free & Vegan</li><li>Eco-Friendly Packaging</li><li>Lab Tested for Purity</li></ul>' +
        '<div class="qty-selector"><button id="qtyMinus">\u2212</button><span id="qtyVal">' + qty + '</span><button id="qtyPlus">+</button></div>' +
        '<button class="btn btn-primary" id="addToCartBtn" style="width:100%;margin-bottom:12px">Add to Cart \u2014 ' + fmt(p.price * qty) + '</button>' +
        '<button class="btn btn-outline" style="width:100%" onclick="window.location=\'cart.html\'">Go to Cart</button>' +
      '</div>' +
    '</div></div>';

  var updateUI = function() {
    document.getElementById('qtyVal').textContent = qty;
    document.getElementById('addToCartBtn').textContent = 'Add to Cart \u2014 ' + fmt(p.price * qty);
  };
  document.getElementById('qtyMinus').onclick = function() { if (qty > 1) { qty--; updateUI(); } };
  document.getElementById('qtyPlus').onclick = function() { qty++; updateUI(); };
  document.getElementById('addToCartBtn').onclick = function() { Store.addToCart(p.id, qty); };

  // Render "You May Also Need" (upsell) for regular products
  if (isNum) {
    var upsells = (Store.upsellRules[p.id] || []).map(function(rid) { return Store.getProduct(rid); }).filter(Boolean);
    var upsellEl = document.getElementById('upsellProducts');
    if (upsellEl && upsells.length) renderProductCards(upsellEl, upsells);
    else if (upsellEl) upsellEl.parentElement.style.display = 'none';
  }

  // Render "People Also Bought"
  if (isNum) {
    var also = Store.getAlsoBought(p.id);
    var alsoEl = document.getElementById('alsoBoughtProducts');
    if (alsoEl && also.length) renderProductCards(alsoEl, also);
    else if (alsoEl) alsoEl.parentElement.style.display = 'none';
  }
}

/* ============ CART PAGE ============ */
function initCartPage() {
  var container = document.getElementById('cartContent');
  if (!container) return;
  renderCart();

  function renderCart() {
    var cart = Store.getCart();
    if (!cart.length) {
      container.innerHTML = '<div class="cart-empty"><p style="font-size:4rem">\uD83D\uDED2</p><p>Your cart is empty</p><a href="index.html" class="btn btn-primary">Continue Shopping</a></div>';
      return;
    }
    var sub = Store.cartTotal();
    var ship = sub > 599 ? 0 : 49;
    var walletBal = Auth.isLoggedIn() ? (Auth.currentUser().wallet || 0) : 0;

    container.innerHTML =
      '<table class="cart-table"><thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Total</th><th></th></tr></thead>' +
      '<tbody>' + cart.map(function(item) {
        var p = Store.getProduct(item.id);
        if (!p) return '';
        return '<tr><td><div class="cart-product"><div class="thumb">' + p.emoji + '</div><div class="name">' + p.name + (p.cat === 'bundle' ? ' <small style="color:var(--green-500)">[Bundle]</small>' : '') + '</div></div></td>' +
          '<td>' + fmt(p.price) + '</td>' +
          '<td><div class="cart-qty"><button onclick="changeQty(\'' + item.id + '\',-1)">\u2212</button><span>' + item.qty + '</span><button onclick="changeQty(\'' + item.id + '\',1)">+</button></div></td>' +
          '<td><strong>' + fmt(p.price * item.qty) + '</strong></td>' +
          '<td><span class="cart-remove" onclick="removeItem(\'' + item.id + '\')">\u2715</span></td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="cart-summary"><div class="cart-summary-box">' +
        '<h3>Order Summary</h3>' +
        '<div class="summary-row"><span>Subtotal</span><span>' + fmt(sub) + '</span></div>' +
        '<div class="summary-row"><span>Shipping</span><span>' + (ship === 0 ? 'Free' : fmt(ship)) + '</span></div>' +
        (walletBal > 0 ? '<div class="summary-row"><span>\uD83D\uDCB0 Wallet Balance</span><span style="color:var(--green-700)">' + fmt(walletBal) + '</span></div>' : '') +
        '<div class="summary-row total"><span>Total</span><span>' + fmt(sub + ship) + '</span></div>' +
        '<a href="checkout.html" class="btn btn-primary" style="width:100%;text-align:center;margin-top:16px">Proceed to Checkout</a>' +
        '<a href="index.html" class="btn btn-outline" style="width:100%;text-align:center;margin-top:8px">Continue Shopping</a>' +
      '</div></div>';

    // Upsell recommendations
    var upsells = Store.getUpsellProducts();
    if (upsells.length) {
      var upsellDiv = document.getElementById('cartUpsell');
      if (upsellDiv) renderProductCards(upsellDiv, upsells);
    }
  }

  window.changeQty = function(id, d) {
    var numId = /^\d+$/.test(id) ? parseInt(id, 10) : id;
    var c = Store.getCart();
    var i = c.find(function(x) { return x.id === numId; });
    if (i) { i.qty = Math.max(1, i.qty + d); Store.saveCart(c); Store.updateCartBadge(); renderCart(); }
  };
  window.removeItem = function(id) {
    var numId = /^\d+$/.test(id) ? parseInt(id, 10) : id;
    Store.removeFromCart(numId); renderCart();
  };
}

/* ============ CHECKOUT PAGE ============ */
function initCheckoutPage() {
  var form = document.getElementById('checkoutForm');
  var summary = document.getElementById('checkoutSummary');
  if (!form || !summary) return;
  if (!Auth.isLoggedIn()) { window.location = 'account.html?m=login&next=checkout.html'; return; }

  var user = Auth.currentUser();
  var addr = Auth.getActiveAddress();
  if (user.name) { var parts = user.name.split(' '); var fn = form.querySelector('#firstName'); var ln = form.querySelector('#lastName'); if (fn) fn.value = parts[0] || ''; if (ln) ln.value = parts.slice(1).join(' ') || ''; }
  if (user.email) { var em = form.querySelector('#email'); if (em) em.value = user.email; }
  if (user.phone) { var ph = form.querySelector('#phone'); if (ph) ph.value = user.phone; }
  if (addr) {
    var els = { address: addr.line, city: addr.city, zip: addr.pin, state: addr.state };
    Object.keys(els).forEach(function(k) { var el = form.querySelector('#' + k); if (el) el.value = els[k] || ''; });
  }

  // Pre-fill delivery preferences
  var prefs = user.deliveryPrefs || {};
  var cbEl = form.querySelector('#prefCallBefore');
  var ldEl = form.querySelector('#prefLeaveAtDoor');
  var ptEl = form.querySelector('#prefTime');
  if (cbEl) cbEl.checked = !!prefs.callBefore;
  if (ldEl) ldEl.checked = !!prefs.leaveAtDoor;
  if (ptEl) ptEl.value = prefs.preferredTime || '';

  var cart = Store.getCart();
  var sub = Store.cartTotal();
  var ship = sub > 599 ? 0 : 49;
  var walletBal = user.wallet || 0;

  summary.innerHTML = '<h3>Your Order</h3>' +
    cart.map(function(item) {
      var p = Store.getProduct(item.id);
      return p ? '<div class="order-item"><span>' + p.emoji + ' ' + p.name + ' \u00D7 ' + item.qty + '</span><span>' + fmt(p.price * item.qty) + '</span></div>' : '';
    }).join('') +
    '<div class="order-item" style="font-size:.85rem;color:var(--gray-500)"><span>Shipping</span><span>' + (ship === 0 ? 'Free' : fmt(ship)) + '</span></div>' +
    (walletBal > 0 ? '<div class="order-item" style="font-size:.85rem"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="useWallet"> Use wallet (' + fmt(walletBal) + ')</label><span id="walletDiscount"></span></div>' : '') +
    '<div class="order-total"><span>Total</span><span id="checkoutTotal">' + fmt(sub + ship) + '</span></div>';

  var walletCb = document.getElementById('useWallet');
  if (walletCb) {
    walletCb.addEventListener('change', function() {
      var disc = walletCb.checked ? Math.min(walletBal, sub + ship) : 0;
      var dd = document.getElementById('walletDiscount');
      if (dd) dd.textContent = disc > 0 ? '-' + fmt(disc) : '';
      var tt = document.getElementById('checkoutTotal');
      if (tt) tt.textContent = fmt(sub + ship - disc);
    });
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var walletUsed = 0;
    if (walletCb && walletCb.checked) {
      walletUsed = Math.min(walletBal, sub + ship);
      Auth.updateUser({ wallet: walletBal - walletUsed });
    }

    // Save delivery preferences
    var newPrefs = {
      callBefore: cbEl ? cbEl.checked : false,
      leaveAtDoor: ldEl ? ldEl.checked : false,
      preferredTime: ptEl ? ptEl.value : ''
    };
    Auth.updateUser({ deliveryPrefs: newPrefs });

    Auth.addOrder({
      items: cart.map(function(i) { var pp = Store.getProduct(i.id); return { id: i.id, qty: i.qty, name: pp ? pp.name : 'Unknown' }; }),
      total: sub + ship - walletUsed,
      walletUsed: walletUsed,
      deliveryPrefs: newPrefs
    });
    Store.saveCart([]);
    Store.updateCartBadge();
    document.querySelector('.checkout-grid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 0">' +
      '<p style="font-size:4rem;margin-bottom:16px">\uD83C\uDF89</p>' +
      '<h2 style="color:var(--green-900);margin-bottom:8px">Order Placed Successfully!</h2>' +
      '<p style="color:var(--gray-500);margin-bottom:24px">Thank you for choosing Prakriti Krishi. Your order is being prepared with care.</p>' +
      '<a href="account.html?tab=orders" class="btn btn-primary">Track Your Order</a> <a href="index.html" class="btn btn-outline" style="margin-left:8px">Back to Home</a></div>';
  });
}

/* ============ DELIVERY TRACKING ============ */
function getOrderTracking(order) {
  var placed = new Date(order.date);
  var now = new Date();
  var hours = (now - placed) / 3600000;
  var stages = [
    { status: 'Order Placed', icon: '\uD83D\uDCCB', minH: 0 },
    { status: 'Confirmed', icon: '\u2705', minH: 0.5 },
    { status: 'Packed', icon: '\uD83D\uDCE6', minH: 4 },
    { status: 'Out for Delivery', icon: '\uD83D\uDE9A', minH: 24 },
    { status: 'Delivered', icon: '\uD83C\uDFE1', minH: 48 }
  ];
  return stages.map(function(s) {
    return {
      status: s.status,
      icon: s.icon,
      reached: hours >= s.minH,
      time: hours >= s.minH ? new Date(placed.getTime() + s.minH * 3600000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null
    };
  });
}

/* ============ ACCOUNT PAGE ============ */
function initAccountPage() {
  var page = document.getElementById('accountPage');
  if (!page) return;
  var params = new URLSearchParams(window.location.search);
  var mode = params.get('m') || (Auth.isLoggedIn() ? 'dashboard' : 'login');
  var nextUrl = params.get('next') || 'index.html';
  if (mode === 'register') return renderRegister(page, nextUrl);
  if (mode === 'login') return renderLogin(page, nextUrl);
  if (!Auth.isLoggedIn()) { window.location = 'account.html?m=login'; return; }
  renderDashboard(page, params.get('tab') || 'details');
}

function renderLogin(page, nextUrl) {
  page.innerHTML = '<div class="auth-box"><h2>Login to Prakriti Krishi</h2><p class="auth-sub">Welcome back! Enter your credentials.</p><div id="authErr" class="auth-err"></div><form id="loginForm"><div class="form-group"><label for="lEmail">Email</label><input type="email" id="lEmail" required></div><div class="form-group"><label for="lPass">Password</label><input type="password" id="lPass" required></div><button type="submit" class="btn btn-primary" style="width:100%">Login</button></form><p class="auth-switch">Don\'t have an account? <a href="account.html?m=register&next=' + encodeURIComponent(nextUrl) + '">Register</a></p></div>';
  document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var res = Auth.login(document.getElementById('lEmail').value, document.getElementById('lPass').value);
    if (!res.ok) { document.getElementById('authErr').textContent = res.msg; return; }
    window.location = decodeURIComponent(nextUrl);
  });
}

function renderRegister(page, nextUrl) {
  page.innerHTML = '<div class="auth-box" style="max-width:520px"><h2>Create Account</h2><p class="auth-sub">Join Prakriti Krishi for a natural shopping experience.</p><div id="authErr" class="auth-err"></div><form id="regForm"><div class="form-row"><div class="form-group"><label>Full Name *</label><input type="text" id="rName" required></div><div class="form-group"><label>Phone *</label><input type="tel" id="rPhone" required></div></div><div class="form-group"><label>Email *</label><input type="email" id="rEmail" required></div><div class="form-row"><div class="form-group"><label>Password *</label><input type="password" id="rPass" required minlength="6"></div><div class="form-group"><label>Confirm Password *</label><input type="password" id="rPass2" required></div></div><div class="form-group"><label>Referral Code (optional)</label><input type="text" id="rReferral" placeholder="e.g. PKAB12CD"></div><h4 style="margin:20px 0 10px;color:var(--green-900)">Shipping Address</h4><div class="form-group"><label>Address Line</label><input type="text" id="rAddr" placeholder="123 Green Lane"></div><div class="form-row"><div class="form-group"><label>City</label><input type="text" id="rCity"></div><div class="form-group"><label>PIN Code</label><input type="text" id="rPin"></div></div><div class="form-group"><label>State</label><select id="rState"><option value="">Select</option><option>Andhra Pradesh</option><option>Arunachal Pradesh</option><option>Assam</option><option>Bihar</option><option>Chhattisgarh</option><option>Goa</option><option>Gujarat</option><option>Haryana</option><option>Himachal Pradesh</option><option>Jharkhand</option><option>Karnataka</option><option>Kerala</option><option>Madhya Pradesh</option><option>Maharashtra</option><option>Manipur</option><option>Meghalaya</option><option>Mizoram</option><option>Nagaland</option><option>Odisha</option><option>Punjab</option><option>Rajasthan</option><option>Sikkim</option><option>Tamil Nadu</option><option>Telangana</option><option>Tripura</option><option>Uttar Pradesh</option><option>Uttarakhand</option><option>West Bengal</option><option>Andaman & Nicobar</option><option>Chandigarh</option><option>Delhi</option><option>Jammu & Kashmir</option><option>Ladakh</option><option>Lakshadweep</option><option>Puducherry</option></select></div><button type="submit" class="btn btn-primary" style="width:100%">Create Account</button></form><p class="auth-switch">Already have an account? <a href="account.html?m=login&next=' + encodeURIComponent(nextUrl) + '">Login</a></p></div>';
  document.getElementById('regForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var pw = document.getElementById('rPass').value;
    if (pw !== document.getElementById('rPass2').value) { document.getElementById('authErr').textContent = 'Passwords do not match.'; return; }
    var res = Auth.register({ name: document.getElementById('rName').value, phone: document.getElementById('rPhone').value, email: document.getElementById('rEmail').value, password: pw, referralCode: document.getElementById('rReferral').value.trim(), address: document.getElementById('rAddr').value, city: document.getElementById('rCity').value, pin: document.getElementById('rPin').value, state: document.getElementById('rState').value });
    if (!res.ok) { document.getElementById('authErr').textContent = res.msg; return; }
    showToast('Account created!' + (document.getElementById('rReferral').value.trim() ? ' \u20B9100 added to your wallet!' : ''));
    window.location = decodeURIComponent(nextUrl);
  });
}

function renderDashboard(page, activeTab) {
  var user = Auth.currentUser();
  var tabs = [
    { id: 'details', label: '\uD83D\uDC64 Account Details' },
    { id: 'addresses', label: '\uD83D\uDCCD Addresses' },
    { id: 'orders', label: '\uD83D\uDCE6 Orders' },
    { id: 'subscriptions', label: '\uD83D\uDD04 Subscriptions' },
    { id: 'delivery', label: '\uD83D\uDE9A Delivery Prefs' },
    { id: 'referral', label: '\uD83C\uDF81 Referrals & Wallet' },
    { id: 'security', label: '\uD83D\uDD12 Login & Security' }
  ];

  page.innerHTML = '<div class="dash-layout"><aside class="dash-sidebar"><div class="dash-user"><strong>' + user.name + '</strong><br><small>' + user.email + '</small></div>' +
    tabs.map(function(t) { return '<a class="dash-tab' + (t.id === activeTab ? ' active' : '') + '" href="account.html?tab=' + t.id + '">' + t.label + '</a>'; }).join('') +
    '<a class="dash-tab" href="#" onclick="Auth.logout();window.location=\'index.html\'">\uD83D\uDEAA Logout</a></aside><main class="dash-main" id="dashContent"></main></div>';

  var main = document.getElementById('dashContent');
  if (activeTab === 'details') renderAccDetails(main, user);
  else if (activeTab === 'addresses') renderAccAddresses(main, user);
  else if (activeTab === 'orders') renderAccOrders(main, user);
  else if (activeTab === 'subscriptions') renderAccSubscriptions(main, user);
  else if (activeTab === 'delivery') renderAccDeliveryPrefs(main, user);
  else if (activeTab === 'referral') renderAccReferral(main, user);
  else if (activeTab === 'security') renderAccSecurity(main, user);
}

function renderAccDetails(el, user) {
  el.innerHTML = '<h2>Account Details</h2><form id="detForm"><div class="form-row"><div class="form-group"><label>Full Name</label><input type="text" id="dName" value="' + (user.name || '') + '"></div><div class="form-group"><label>Phone</label><input type="tel" id="dPhone" value="' + (user.phone || '') + '"></div></div><div class="form-group"><label>Email</label><input type="email" value="' + user.email + '" disabled></div><button type="submit" class="btn btn-primary">Save Changes</button></form>';
  document.getElementById('detForm').addEventListener('submit', function(e) { e.preventDefault(); Auth.updateUser({ name: document.getElementById('dName').value, phone: document.getElementById('dPhone').value }); showToast('Details updated!'); });
}

function renderAccAddresses(el, user) {
  var addrs = user.addresses || [];
  el.innerHTML = '<h2>Saved Addresses</h2><div class="addr-list">' +
    (addrs.length ? addrs.map(function(a) { return '<div class="addr-card"><strong>' + a.label + '</strong><p>' + a.line + ', ' + a.city + ' ' + a.state + ' - ' + a.pin + '</p><button class="btn btn-outline" style="padding:6px 14px;font-size:.8rem" onclick="Auth.removeAddress(' + a.id + ');window.location=\'account.html?tab=addresses\'">Remove</button></div>'; }).join('') : '<p>No addresses saved.</p>') +
    '</div><h3 style="margin-top:24px;color:var(--green-900)">Add New Address</h3><form id="addAddrForm"><div class="form-group"><label>Label</label><input type="text" id="aLabel" placeholder="Home / Office / Other" required></div><div class="form-group"><label>Address Line</label><input type="text" id="aLine" required></div><div class="form-row"><div class="form-group"><label>City</label><input type="text" id="aCity" required></div><div class="form-group"><label>PIN Code</label><input type="text" id="aPin" required></div></div><div class="form-group"><label>State</label><select id="aState" required><option value="">Select</option><option>Andhra Pradesh</option><option>Arunachal Pradesh</option><option>Assam</option><option>Bihar</option><option>Chhattisgarh</option><option>Goa</option><option>Gujarat</option><option>Haryana</option><option>Himachal Pradesh</option><option>Jharkhand</option><option>Karnataka</option><option>Kerala</option><option>Madhya Pradesh</option><option>Maharashtra</option><option>Manipur</option><option>Meghalaya</option><option>Mizoram</option><option>Nagaland</option><option>Odisha</option><option>Punjab</option><option>Rajasthan</option><option>Sikkim</option><option>Tamil Nadu</option><option>Telangana</option><option>Tripura</option><option>Uttar Pradesh</option><option>Uttarakhand</option><option>West Bengal</option><option>Andaman & Nicobar</option><option>Chandigarh</option><option>Delhi</option><option>Jammu & Kashmir</option><option>Ladakh</option><option>Lakshadweep</option><option>Puducherry</option></select></div><button type="submit" class="btn btn-primary">Add Address</button></form>';
  document.getElementById('addAddrForm').addEventListener('submit', function(e) {
    e.preventDefault();
    Auth.addAddress({ label: document.getElementById('aLabel').value, line: document.getElementById('aLine').value, city: document.getElementById('aCity').value, pin: document.getElementById('aPin').value, state: document.getElementById('aState').value });
    showToast('Address added!');
    window.location = 'account.html?tab=addresses';
  });
}

function renderAccOrders(el, user) {
  var orders = user.orders || [];
  if (!orders.length) { el.innerHTML = '<h2>My Orders</h2><p>No orders yet. <a href="category.html">Start shopping!</a></p>'; return; }

  el.innerHTML = '<h2>My Orders</h2><div id="ordersList">' +
    orders.map(function(o) {
      var tracking = getOrderTracking(o);
      var currentStatus = 'Placed';
      for (var i = tracking.length - 1; i >= 0; i--) { if (tracking[i].reached) { currentStatus = tracking[i].status; break; } }
      return '<div class="order-card">' +
        '<div class="order-head"><span><strong>' + o.id + '</strong> \u2014 ' + new Date(o.date).toLocaleDateString('en-IN') + '</span><span class="order-status">' + currentStatus + '</span></div>' +
        '<div class="order-items">' + (o.items || []).map(function(i) { return '<span>' + i.name + ' \u00D7 ' + i.qty + '</span>'; }).join(' \u00B7 ') + '</div>' +
        '<div class="order-total-line" style="display:flex;justify-content:space-between;align-items:center">Total: <strong>' + fmt(o.total) + '</strong>' +
          '<span><button class="btn btn-outline" style="padding:4px 12px;font-size:.8rem;margin-right:6px" onclick="viewOrderDetail(\'' + o.id + '\')">Track</button>' +
          '<button class="btn btn-primary" style="padding:4px 12px;font-size:.8rem" onclick="reorderFromOrder(\'' + o.id + '\')">Reorder</button></span>' +
        '</div></div>';
    }).join('') + '</div><div id="orderDetail" style="display:none"></div>';

  window.reorderFromOrder = function(orderId) {
    var order = (Auth.currentUser().orders || []).find(function(o) { return o.id === orderId; });
    if (order) Store.reorder(order);
  };

  window.viewOrderDetail = function(orderId) {
    var order = (Auth.currentUser().orders || []).find(function(o) { return o.id === orderId; });
    if (!order) return;
    var tracking = getOrderTracking(order);
    var detailEl = document.getElementById('orderDetail');
    var listEl = document.getElementById('ordersList');
    listEl.style.display = 'none';
    detailEl.style.display = 'block';
    detailEl.innerHTML =
      '<button class="btn btn-outline" style="margin-bottom:16px" onclick="document.getElementById(\'ordersList\').style.display=\'block\';document.getElementById(\'orderDetail\').style.display=\'none\'">\u2190 Back to Orders</button>' +
      '<h3>Order ' + order.id + '</h3>' +
      '<p style="color:var(--gray-500);margin-bottom:16px">' + new Date(order.date).toLocaleDateString('en-IN', { dateStyle: 'long' }) + '</p>' +
      '<div class="tracking-timeline">' + tracking.map(function(s) {
        return '<div class="track-step' + (s.reached ? ' reached' : '') + '"><div class="track-icon">' + s.icon + '</div><div><strong>' + s.status + '</strong>' + (s.time ? '<br><small>' + s.time + '</small>' : '') + '</div></div>';
      }).join('') + '</div>' +
      '<h4 style="margin-top:24px;color:var(--green-900)">Items</h4>' +
      '<div class="order-detail-items">' + (order.items || []).map(function(i) {
        var pp = Store.getProduct(i.id);
        return '<div class="odi"><span>' + (pp ? pp.emoji : '\uD83D\uDCE6') + ' ' + i.name + ' \u00D7 ' + i.qty + '</span><span>' + (pp ? fmt(pp.price * i.qty) : '') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="order-detail-total">Total: ' + fmt(order.total) + (order.walletUsed ? ' <small>(includes ' + fmt(order.walletUsed) + ' wallet credit)</small>' : '') + '</div>' +
      (order.deliveryPrefs ? '<div class="order-detail-prefs"><h4 style="margin-top:16px;color:var(--green-900)">Delivery Preferences</h4><ul>' +
        (order.deliveryPrefs.callBefore ? '<li>\uD83D\uDCDE Call before delivery</li>' : '') +
        (order.deliveryPrefs.leaveAtDoor ? '<li>\uD83D\uDEAA Leave at door</li>' : '') +
        (order.deliveryPrefs.preferredTime ? '<li>\u23F0 Preferred time: ' + order.deliveryPrefs.preferredTime + '</li>' : '') +
        '</ul></div>' : '') +
      '<button class="btn btn-primary" style="margin-top:16px" onclick="reorderFromOrder(\'' + order.id + '\')">Reorder This Order</button>';
  };
}

function renderAccSubscriptions(el, user) {
  var subs = user.subscriptions || [];
  el.innerHTML = '<h2>My Subscriptions</h2>' +
    (!subs.length ? '<p>No active subscriptions. <a href="subscriptions.html">Set up recurring deliveries!</a></p>' :
    subs.map(function(s) { return '<div class="order-card"><div class="order-head"><span><strong>' + s.name + '</strong></span><span class="order-status">' + s.frequency + '</span></div><div class="order-items">Days: ' + s.days.join(', ') + ' \u00B7 Qty: ' + s.qty + '</div><div class="order-total-line">' + fmt(s.price) + ' per delivery</div></div>'; }).join('')) +
    '<a href="subscriptions.html" class="btn btn-primary" style="margin-top:16px">Manage Subscriptions</a>';
}

function renderAccDeliveryPrefs(el, user) {
  var prefs = user.deliveryPrefs || {};
  el.innerHTML = '<h2>Delivery Preferences</h2><p style="color:var(--gray-500);margin-bottom:20px">These preferences will be attached to all future orders.</p>' +
    '<form id="dpForm">' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="dpCall" ' + (prefs.callBefore ? 'checked' : '') + '> \uD83D\uDCDE Call before delivery</label></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="dpDoor" ' + (prefs.leaveAtDoor ? 'checked' : '') + '> \uD83D\uDEAA Leave at door if no one is home</label></div>' +
    '<div class="form-group"><label>Preferred Delivery Time</label><select id="dpTime"><option value="">No preference</option><option value="6am-9am"' + (prefs.preferredTime === '6am-9am' ? ' selected' : '') + '>6 AM \u2013 9 AM (Early Morning)</option><option value="9am-12pm"' + (prefs.preferredTime === '9am-12pm' ? ' selected' : '') + '>9 AM \u2013 12 PM</option><option value="12pm-3pm"' + (prefs.preferredTime === '12pm-3pm' ? ' selected' : '') + '>12 PM \u2013 3 PM</option><option value="3pm-6pm"' + (prefs.preferredTime === '3pm-6pm' ? ' selected' : '') + '>3 PM \u2013 6 PM</option><option value="6pm-9pm"' + (prefs.preferredTime === '6pm-9pm' ? ' selected' : '') + '>6 PM \u2013 9 PM (Evening)</option></select></div>' +
    '<button type="submit" class="btn btn-primary">Save Preferences</button></form>';
  document.getElementById('dpForm').addEventListener('submit', function(e) {
    e.preventDefault();
    Auth.updateUser({ deliveryPrefs: { callBefore: document.getElementById('dpCall').checked, leaveAtDoor: document.getElementById('dpDoor').checked, preferredTime: document.getElementById('dpTime').value } });
    showToast('Delivery preferences saved!');
  });
}

function renderAccReferral(el, user) {
  var code = user.referralCode || 'N/A';
  var wallet = user.wallet || 0;
  el.innerHTML = '<h2>Referrals & Wallet</h2>' +
    '<div class="referral-card"><h3>\uD83D\uDCB0 Wallet Balance</h3><p class="wallet-bal">' + fmt(wallet) + '</p><small>Earn ' + fmt(100) + ' for every friend you refer!</small></div>' +
    '<div class="referral-card" style="margin-top:20px"><h3>\uD83C\uDF81 Your Referral Code</h3><div class="referral-code-box"><span id="refCode">' + code + '</span><button class="btn btn-outline" style="padding:6px 14px;font-size:.8rem" onclick="navigator.clipboard.writeText(\'' + code + '\');showToast(\'Code copied!\')">Copy</button></div><p style="color:var(--gray-500);margin-top:8px">Share this code with friends. When they sign up and you both get ' + fmt(100) + ' wallet credit!</p></div>';
}

function renderAccSecurity(el, user) {
  el.innerHTML = '<h2>Login & Security</h2><div class="sec-info"><p><strong>Email:</strong> ' + user.email + '</p><p><strong>Account created:</strong> ' + new Date(user.createdAt).toLocaleDateString('en-IN') + '</p></div><h3 style="margin:24px 0 12px;color:var(--green-900)">Change Password</h3><form id="pwForm"><div class="form-group"><label>Current Password</label><input type="password" id="sPwOld" required></div><div class="form-group"><label>New Password</label><input type="password" id="sPwNew" required minlength="6"></div><div class="form-group"><label>Confirm New Password</label><input type="password" id="sPwNew2" required></div><div id="secErr" class="auth-err"></div><button type="submit" class="btn btn-primary">Update Password</button></form>';
  document.getElementById('pwForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if (document.getElementById('sPwNew').value !== document.getElementById('sPwNew2').value) { document.getElementById('secErr').textContent = 'Passwords do not match.'; return; }
    var res = Auth.changePassword(document.getElementById('sPwOld').value, document.getElementById('sPwNew').value);
    if (!res.ok) { document.getElementById('secErr').textContent = res.msg; return; }
    showToast('Password changed!');
    document.getElementById('pwForm').reset();
  });
}

/* ============ SUBSCRIPTIONS PAGE ============ */
function initSubscriptionsPage() {
  var pg = document.getElementById('subsPage');
  if (!pg) return;
  if (!Auth.isLoggedIn()) { window.location = 'account.html?m=login&next=subscriptions.html'; return; }

  var subsProducts = [
    { id: 's1', name: 'Farm Fresh Eggs (12 pc)', price: 96, emoji: '\uD83E\uDD5A', unit: 'dozen', seasonal: false },
    { id: 's2', name: 'Fresh Cow Milk (1L)', price: 68, emoji: '\uD83E\uDD5B', unit: 'litre', seasonal: false },
    { id: 's3', name: 'A2 Buffalo Milk (1L)', price: 82, emoji: '\uD83D\uDC03', unit: 'litre', seasonal: false },
    { id: 's4', name: 'Farm Butter (200g)', price: 145, emoji: '\uD83E\uDDC8', unit: 'pack', seasonal: false },
    { id: 's5', name: 'Fresh Paneer (250g)', price: 120, emoji: '\uD83E\uDDC0', unit: 'pack', seasonal: false },
    { id: 's6', name: 'Organic Curd (500g)', price: 55, emoji: '\uD83E\uDD63', unit: 'pot', seasonal: false },
    { id: 's7', name: 'Ghee (500ml)', price: 430, emoji: '\uD83E\uDED9', unit: 'jar', seasonal: false },
    { id: 's8', name: 'Seasonal Alphonso Mangoes (1 doz)', price: 650, emoji: '\uD83E\uDD6D', unit: 'dozen', seasonal: true, season: 'Apr\u2013Jun' },
    { id: 's9', name: 'Seasonal Guavas (1 kg)', price: 120, emoji: '\uD83C\uDF4F', unit: 'kg', seasonal: true, season: 'Oct\u2013Feb' },
    { id: 's10', name: 'Seasonal Pomegranates (1 kg)', price: 180, emoji: '\uD83E\uDED0', unit: 'kg', seasonal: true, season: 'Sep\u2013Feb' },
    { id: 's11', name: 'Seasonal Jamun (500g)', price: 90, emoji: '\uD83C\uDF47', unit: 'pack', seasonal: true, season: 'Jun\u2013Jul' },
    { id: 's12', name: 'Fresh Vegetables Box (5 kg)', price: 350, emoji: '\uD83E\uDD6C', unit: 'box', seasonal: false },
  ];

  var daily = subsProducts.filter(function(p) { return !p.seasonal; });
  var seasonal = subsProducts.filter(function(p) { return p.seasonal; });
  var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  pg.innerHTML =
    '<h2 class="section-title">Recurring Deliveries</h2>' +
    '<p class="section-subtitle">Get farm-fresh essentials delivered to your door \u2014 daily, weekly, or on your chosen schedule.</p>' +
    '<h3 style="color:var(--green-900);margin-bottom:16px">\uD83E\uDD5B Daily Essentials</h3>' +
    '<div class="subs-grid">' + daily.map(function(p) {
      return '<div class="subs-card" id="sub_' + p.id + '"><div class="subs-emoji">' + p.emoji + '</div><h4>' + p.name + '</h4><p class="price">' + fmt(p.price) + ' <small>/ ' + p.unit + '</small></p>' +
        '<div class="form-group"><label>Quantity</label><input type="number" class="sub-qty" data-id="' + p.id + '" min="1" value="1" style="width:70px"></div>' +
        '<div class="form-group"><label>Frequency</label><select class="sub-freq" data-id="' + p.id + '"><option value="daily">Every day</option><option value="alternate">Alternate days</option><option value="weekly">Once a week</option><option value="custom">Custom days</option></select></div>' +
        '<div class="sub-days" data-id="' + p.id + '" style="display:none">' + days.map(function(d) { return '<label class="day-check"><input type="checkbox" value="' + d + '"> ' + d + '</label>'; }).join('') + '</div>' +
        '<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="subscribeTo(\'' + p.id + '\',\'' + p.name + '\',' + p.price + ')">Subscribe</button></div>';
    }).join('') + '</div>' +
    '<h3 style="color:var(--green-900);margin:40px 0 16px">\uD83E\uDD6D Seasonal Specials</h3>' +
    '<p style="color:var(--gray-500);margin-bottom:20px">Order larger quantities of seasonal fruits \u2014 delivered during their harvest window.</p>' +
    '<div class="subs-grid">' + seasonal.map(function(p) {
      return '<div class="subs-card seasonal" id="sub_' + p.id + '"><div class="subs-emoji">' + p.emoji + '</div><span class="tag">' + p.season + '</span><h4>' + p.name + '</h4><p class="price">' + fmt(p.price) + ' <small>/ ' + p.unit + '</small></p>' +
        '<div class="form-group"><label>Quantity per delivery</label><input type="number" class="sub-qty" data-id="' + p.id + '" min="1" value="2" style="width:70px"></div>' +
        '<div class="form-group"><label>Frequency</label><select class="sub-freq" data-id="' + p.id + '"><option value="weekly">Once a week</option><option value="biweekly">Twice a month</option><option value="monthly">Once a month</option></select></div>' +
        '<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="subscribeTo(\'' + p.id + '\',\'' + p.name + '\',' + p.price + ')">Subscribe for Season</button></div>';
    }).join('') + '</div>';

  document.querySelectorAll('.sub-freq').forEach(function(sel) {
    sel.addEventListener('change', function() {
      var dayDiv = document.querySelector('.sub-days[data-id="' + sel.dataset.id + '"]');
      if (dayDiv) dayDiv.style.display = sel.value === 'custom' ? 'flex' : 'none';
    });
  });

  window.subscribeTo = function(id, name, price) {
    var qty = parseInt(document.querySelector('.sub-qty[data-id="' + id + '"]').value, 10) || 1;
    var freq = document.querySelector('.sub-freq[data-id="' + id + '"]').value;
    var selDays = [];
    if (freq === 'custom') {
      document.querySelectorAll('.sub-days[data-id="' + id + '"] input:checked').forEach(function(cb) { selDays.push(cb.value); });
      if (!selDays.length) { showToast('Please select at least one day.'); return; }
    } else if (freq === 'daily') { selDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; }
    else if (freq === 'alternate') { selDays = ['Mon','Wed','Fri','Sun']; }
    else if (freq === 'weekly') { selDays = ['Mon']; }
    else if (freq === 'biweekly') { selDays = ['1st','15th']; }
    else if (freq === 'monthly') { selDays = ['1st']; }

    var user = Auth.currentUser();
    var subs = user.subscriptions || [];
    var existing = subs.findIndex(function(s) { return s.id === id; });
    var sub = { id: id, name: name, price: price, qty: qty, frequency: freq, days: selDays };
    if (existing > -1) subs[existing] = sub; else subs.push(sub);
    Auth.updateUser({ subscriptions: subs });
    showToast('Subscribed to ' + name + '!');
  };
}

/* ============ RECIPES PAGE ============ */
function initRecipesPage() {
  var pg = document.getElementById('recipesPage');
  if (!pg) return;

  pg.innerHTML = '<h2 class="section-title">Recipes & DIY</h2><p class="section-subtitle">Discover how to use our products in delicious recipes and self-care rituals.</p>' +
    '<div class="recipes-grid">' + Recipes.map(function(r) {
      return '<div class="recipe-card">' +
        '<div class="recipe-head"><span style="font-size:2.5rem">' + r.emoji + '</span><div><h3>' + r.title + '</h3><small>\u23F1 ' + r.time + ' \u00B7 ' + r.servings + ' serving' + (r.servings > 1 ? 's' : '') + '</small></div></div>' +
        '<p class="recipe-desc">' + r.desc + '</p>' +
        '<div class="recipe-ingredients"><h4>Ingredients</h4><ul>' + r.ingredients.map(function(i) {
          return '<li>' + i.qty + ' \u2014 <a href="product.html?id=' + i.productId + '">' + i.name + '</a></li>';
        }).join('') + '</ul></div>' +
        '<details class="recipe-steps"><summary>View Steps</summary><ol>' + r.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ol></details>' +
        '<button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="addRecipeToCart(\'' + r.id + '\')">Add All Ingredients to Cart</button>' +
      '</div>';
    }).join('') + '</div>';

  window.addRecipeToCart = function(recipeId) {
    if (!Auth.isLoggedIn()) { window.location = 'account.html?m=login&next=recipes.html'; return; }
    var recipe = Recipes.find(function(r) { return r.id === recipeId; });
    if (!recipe) return;
    recipe.ingredients.forEach(function(i) {
      var p = Store.getProduct(i.productId);
      if (p && p.stock > 0) Store.addToCart(i.productId, 1);
    });
  };
}

/* ============ HARVEST CALENDAR PAGE ============ */
function initHarvestPage() {
  var pg = document.getElementById('harvestPage');
  if (!pg) return;

  var currentMonth = new Date().getMonth();

  pg.innerHTML = '<h2 class="section-title">Harvest Calendar</h2><p class="section-subtitle">See what\'s in season right now and plan your purchases around nature\'s schedule.</p>' +
    '<div class="harvest-current"><h3>\uD83C\uDF3E In Season This Month \u2014 ' + HarvestCalendar.months[currentMonth] + '</h3><div class="harvest-tags">' +
    HarvestCalendar.getCurrentSeason().map(function(d) { return '<span class="harvest-tag">' + d.emoji + ' ' + d.name + '</span>'; }).join('') +
    '</div></div>' +
    '<div class="harvest-grid"><table class="harvest-table"><thead><tr><th>Crop</th>' + HarvestCalendar.months.map(function(m, i) { return '<th class="' + (i === currentMonth ? 'hm-current' : '') + '">' + m + '</th>'; }).join('') + '<th>Region</th></tr></thead><tbody>' +
    HarvestCalendar.data.map(function(d) {
      return '<tr><td>' + d.emoji + ' ' + d.name + '</td>' + HarvestCalendar.months.map(function(m, i) {
        return '<td class="' + (d.months.includes(i) ? 'hm-active' : '') + (i === currentMonth ? ' hm-current' : '') + '">' + (d.months.includes(i) ? '\u2713' : '') + '</td>';
      }).join('') + '<td><small>' + d.region + '</small></td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* ============ TODAY'S ESSENTIALS ============ */
function initTodaysEssentials() {
  var container = document.getElementById('todaysEssentials');
  if (!container) return;

  var ids = Tracker.getTodaysEssentials();
  var products = ids.map(function(id) { return Store.getProduct(id); }).filter(Boolean);
  if (!products.length) { container.style.display = 'none'; return; }

  container.innerHTML = '<div class="container"><h2 class="section-title">Today\'s Essentials</h2><p class="section-subtitle">Picked for you based on your shopping habits</p><div class="prod-grid" id="essentialsGrid"></div></div>';
  renderProductCards(document.getElementById('essentialsGrid'), products);
}

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', function() {
  Store.updateCartBadge();
  initMobileNav();
  initAddressBar();
  initSearch();
  initCategoryFilter();
  initProductDetail();
  initCartPage();
  initCheckoutPage();
  initAccountPage();
  initSubscriptionsPage();
  initRecipesPage();
  initHarvestPage();
  initTodaysEssentials();

  // Update nav account link
  document.querySelectorAll('.nav-account').forEach(function(el) {
    if (Auth.isLoggedIn()) { el.textContent = '\uD83D\uDC64'; el.href = 'account.html'; el.title = Auth.currentUser().name; }
    else { el.textContent = 'Login'; el.href = 'account.html?m=login'; }
  });

  // Home page featured products
  var featured = document.getElementById('featuredProducts');
  if (featured) renderProductCards(featured, Store.products.slice(0, 8));

  // Category page all products
  var catProducts = document.getElementById('categoryProducts');
  if (catProducts) {
    var activeBtn = document.querySelector('.filter-btn.active');
    var cat = activeBtn ? activeBtn.dataset.cat : 'all';
    renderProductCards(catProducts, cat === 'all' ? Store.allDisplayProducts() : (cat === 'bundle' ? Store.bundles : Store.products.filter(function(p) { return p.cat === cat; })));
  }
});
