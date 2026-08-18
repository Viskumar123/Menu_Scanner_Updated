/**
 * database.js — Centralized Hybrid Client/API Data Layer for MenuScan Platform.
 * 
 * Features:
 * - Seamlessly synchronizes with backend REST API (/api/*) when available
 * - Provides offline fallback to localStorage & embedded seed CSV
 * - Manages JWT authentication tokens for admin & owner operations
 * - Handles live stock availability, restaurant CRUD, dish CRUD, table orders & analytics
 */

const DB = (() => {
  const STORAGE_KEY_ITEMS = 'menuscan_db_items_v2';
  const STORAGE_KEY_RESTAURANTS = 'menuscan_db_restaurants_v2';
  const STORAGE_KEY_AUTH_TOKEN = 'menuscan_jwt_token_v1';
  const STORAGE_KEY_ORDERS = 'menuscan_db_orders_v1';
  
  let _rawData = null;
  let _restaurants = null;
  let _isOnlineAPI = false;

  // Embedded seed fallback
  const EMBEDDED_CSV = `restaurant_id,restaurant_name,restaurant_tagline,restaurant_theme_color,restaurant_accent_color,restaurant_logo_emoji,restaurant_cuisine,restaurant_rating,restaurant_address,restaurant_phone,open_time,close_time,menu_id,item_id,item_name,category,description,price,currency,image_url,item_emoji,is_vegetarian,is_available,is_bestseller,spice_level
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I001,Paneer Tikka,Starters,"Cottage cheese marinated in yogurt & aromatic spices, grilled to perfection in a clay oven",320,₹,,🧀,true,true,true,Medium
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I002,Veg Samosa (2 pcs),Starters,"Crispy golden pastry filled with spiced potatoes & garden peas, served with mint chutney",120,₹,,🥟,true,true,false,Mild
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I003,Chicken Seekh Kebab,Starters,"Minced chicken blended with fresh herbs and spices, skewered and cooked over charcoal",380,₹,,🍢,false,true,true,Medium
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I004,Tomato Shorba,Starters,"Silky smooth tangy tomato soup tempered with cumin and fresh Indian spices",180,₹,,🍲,true,true,false,Mild
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I005,Butter Chicken,Main Course,"Tender boneless chicken slow-cooked in a rich creamy tomato-butter gravy with aromatic spices",450,₹,,🍗,false,true,true,Mild
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I006,Dal Makhani,Main Course,"Whole black lentils slow-cooked overnight with butter and cream for a velvety finish",320,₹,,🫘,true,true,true,Mild
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I007,Chicken Biryani,Main Course,"Fragrant long-grain basmati rice layered with spiced chicken and caramelised onions",480,₹,,🍛,false,true,true,Medium
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I008,Palak Paneer,Main Course,"Fresh cottage cheese cubes in a smooth and creamy spinach gravy",350,₹,,🥬,true,true,false,Mild
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I009,Garlic Naan,Main Course,"Soft leavened flatbread brushed with garlic butter from the tandoor",80,₹,,🫓,true,true,false,None
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I010,Gulab Jamun,Desserts,"Soft milk-solid dumplings soaked in rose-cardamom syrup, served warm",150,₹,,🍮,true,true,true,None
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I011,Saffron Kheer,Desserts,"Creamy rice pudding infused with saffron and topped with crushed pistachios",160,₹,,🥛,true,true,false,None
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I012,Sweet Lassi,Beverages,"Chilled thick yogurt blended with sugar and a hint of rose water",120,₹,,🥛,true,true,true,None
R001,The Spice Garden,Authentic Indian Cuisine since 1995,#E85D04,#F48C06,🌶️,Indian,4.7,"12 MG Road, Indiranagar, Bangalore",+91-80-4567-8901,11:00 AM,11:00 PM,MENU_R001,I013,Masala Chai,Beverages,"Traditional spiced Indian tea brewed with cardamom, ginger and cinnamon",60,₹,,☕,true,true,false,None
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I014,Veg Spring Rolls,Starters,"Crispy golden rolls filled with stir-fried mixed vegetables and glass noodles",220,₹,,🥢,true,true,false,Mild
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I015,Chicken Dumplings (6 pcs),Starters,"Steamed or pan-fried dumplings filled with minced chicken and ginger",280,₹,,🥟,false,true,true,Mild
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I016,Hot & Sour Soup,Starters,"Tangy and spicy soup with tofu, mushrooms, bamboo shoots and a silky egg ribbon",200,₹,,🍜,true,true,true,Hot
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I017,Prawn Har Gow,Starters,"Delicate steamed crystal prawn dumplings — a dim sum classic",340,₹,,🦐,false,true,false,None
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I018,Kung Pao Chicken,Main Course,"Stir-fried chicken with roasted peanuts, Sichuan chilies and crunchy vegetables",420,₹,,🍗,false,true,true,Hot
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I019,Veg Fried Rice,Main Course,"Wok-tossed jasmine rice with seasonal vegetables and house soy blend",280,₹,,🍚,true,true,false,Mild
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I020,Chicken Hakka Noodles,Main Course,"Wok-fried noodles with shredded chicken and classic soy-sesame sauce",320,₹,,🍝,false,true,true,Medium
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I021,Veg Manchurian Gravy,Main Course,"Fried vegetable balls tossed in a bold and tangy Manchurian sauce",300,₹,,🥦,true,true,false,Medium
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I022,Assorted Dim Sum Basket,Main Course,"Chef's selection of six steamed dumplings with pork, chicken and prawn",380,₹,,🧺,false,false,false,None
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I023,Mango Pudding,Desserts,"Silky smooth chilled mango pudding topped with fresh mango pieces and cream",180,₹,,🥭,true,true,true,None
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I024,Sesame Balls,Desserts,"Golden crispy glutinous rice balls filled with sweet lotus paste and black sesame",160,₹,,🟡,true,true,false,None
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I025,Jasmine Green Tea,Beverages,"Fragrant jasmine-infused green tea served hot or iced",120,₹,,🍵,true,true,true,None
R002,Dragon Palace,Imperial Chinese Cuisine,#C1121F,#FFB703,🐉,Chinese,4.5,"88 Koramangala Block 5, Bangalore",+91-80-5678-9012,12:00 PM,10:30 PM,MENU_R002,I026,Lychee Mocktail,Beverages,"Refreshing lychee juice with sparkling water, lime and mint",150,₹,,🍹,true,true,false,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I027,Bruschetta al Pomodoro,Starters,"Crisp sourdough topped with fresh Roma tomatoes, basil and extra virgin olive oil",280,₹,,🍅,true,true,true,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I028,Caprese Salad,Starters,"Buffalo mozzarella, heirloom tomatoes and fresh basil with aged balsamic reduction",360,₹,,🧀,true,true,false,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I029,Minestrone Soup,Starters,"Hearty Tuscan vegetable and cannellini bean soup with fresh pasta and pesto",260,₹,,🥣,true,true,false,Mild
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I030,Arancini al Formaggio,Starters,"Crispy golden risotto balls stuffed with molten mozzarella and sun-dried tomato",320,₹,,🟠,true,false,false,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I031,Margherita Pizza,Main Course,"Classic Neapolitan pizza with San Marzano tomato sauce and fresh fior di latte",540,₹,,🍕,true,true,true,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I032,Pasta Carbonara,Main Course,"Silky spaghetti with guanciale, Pecorino Romano, egg yolk and cracked black pepper",520,₹,,🍝,false,true,true,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I033,Vegetable Lasagne,Main Course,"Layered egg pasta with roasted Mediterranean vegetables and creamy bechamel",500,₹,,🫙,true,true,false,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I034,Wild Mushroom Risotto,Main Course,"Creamy Arborio rice with mixed wild mushrooms and aged Parmesan",480,₹,,🍄,true,true,true,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I035,Classic Tiramisu,Desserts,"Traditional Italian coffee dessert with mascarpone cream and Savoiardi biscuits",340,₹,,☕,true,true,true,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I036,Panna Cotta,Desserts,"Silky vanilla-scented cooked cream with summer berry coulis and mint",300,₹,,🍮,true,true,false,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I037,Doppio Espresso,Beverages,"Rich concentrated double shot Italian coffee",140,₹,,☕,true,true,false,None
R003,La Bella Italia,Fine Italian Dining,#2D6A4F,#52B788,🍕,Italian,4.8,"5 Church Street, Lavelle Road, Bangalore",+91-80-6789-0123,12:30 PM,11:30 PM,MENU_R003,I038,Limonata Italiana,Beverages,"Fresh Italian lemonade with sparkling water and a sprig of rosemary",180,₹,,🍋,true,true,true,None
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I039,Crispy Onion Rings,Starters,"Beer-battered onion rings fried to a golden crisp, served with chipotle mayo",240,₹,,🧅,true,true,false,None
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I040,Loaded Cheese Fries,Starters,"Seasoned fries smothered in nacho cheese sauce with jalapenos and sour cream",300,₹,,🍟,true,true,true,Medium
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I041,Buffalo Chicken Wings (6 pcs),Starters,"Crispy fried wings tossed in tangy buffalo sauce served with blue cheese dip",400,₹,,🍗,false,true,true,Hot
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I042,Mozzarella Sticks,Starters,"Breaded and fried mozzarella fingers with zesty marinara dipping sauce",280,₹,,🧀,true,false,false,None
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I043,Classic Smash Burger,Main Course,"Double smashed beef patty with American cheese, pickles, lettuce and secret sauce",540,₹,,🍔,false,true,true,Mild
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I044,BBQ Bacon Crunch Burger,Main Course,"Beef patty with crispy streaky bacon, BBQ sauce, coleslaw and cheddar",600,₹,,🥓,false,true,true,Mild
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I045,Veggie Supreme Burger,Main Course,"Plant-based patty with smashed avocado, lettuce, tomato and sriracha mayo",480,₹,,🥑,true,true,false,Medium
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I046,Crispy Chicken Sandwich,Main Course,"Southern-style fried chicken fillet with pickled jalapenos and honey mustard in a brioche bun",500,₹,,🥪,false,true,true,Mild
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I047,Brownie Hot Fudge Sundae,Desserts,"Warm chocolate fudge brownie with two scoops of vanilla bean ice cream and hot fudge",340,₹,,🍫,true,true,true,None
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I048,Hand-spun Vanilla Shake,Desserts,"Thick and creamy hand-spun milkshake made with premium vanilla ice cream",280,₹,,🥤,true,true,false,None
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I049,Classic Cola (Large),Beverages,"Ice-cold cola served in a large cup with plenty of ice",90,₹,,🥤,true,true,false,None
R004,Burger Barn,Smash Burgers & American Classics,#F4A261,#E76F51,🍔,American,4.6,"21 Residency Road, Richmond Town, Bangalore",+91-80-7890-1234,10:00 AM,12:00 AM,MENU_R004,I050,Fresh Squeezed Lemonade,Beverages,"House-made lemonade with real lemons and a hint of mint",130,₹,,🍋,true,true,true,None`;

  // ── Auth Token Helpers ────────────────────────────────────────
  function setAuthToken(token) {
    if (token) sessionStorage.setItem(STORAGE_KEY_AUTH_TOKEN, token);
    else sessionStorage.removeItem(STORAGE_KEY_AUTH_TOKEN);
  }

  function getAuthToken() {
    return sessionStorage.getItem(STORAGE_KEY_AUTH_TOKEN);
  }

  function _authHeaders() {
    const token = getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  // ── Load & parse Database ─────────────────────────────────────
  async function load() {
    // 1. Try loading live data from Server REST API
    try {
      const [restRes, itemsRes] = await Promise.all([
        fetch('/api/restaurants').catch(() => null),
        fetch('/api/items').catch(() => null)
      ]);

      if (restRes && restRes.ok) {
        const restJson = await restRes.json();
        if (restJson.success && restJson.restaurants && restJson.restaurants.length > 0) {
          _restaurants = restJson.restaurants.map(r => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            tagline: r.tagline || '',
            themeColor: r.theme_color || '#6c63ff',
            accentColor: r.accent_color || '#a855f7',
            logoUrl: r.logo_url || '',
            logoEmoji: r.logo_emoji || '🍽️',
            cuisine: r.cuisine || 'Multi-Cuisine',
            rating: parseFloat(r.rating) || 4.5,
            address: r.address || '',
            phone: r.phone || '',
            openTime: r.open_time || '11:00 AM',
            closeTime: r.close_time || '11:00 PM',
            menuId: `MENU_${r.id}`
          }));

          if (itemsRes && itemsRes.ok) {
            const itemsJson = await itemsRes.json();
            if (itemsJson.success && Array.isArray(itemsJson.items)) {
              _rawData = itemsJson.items.map(i => ({
                restaurant_id: i.restaurantId || i.restaurant_id,
                item_id: i.id || i.item_id,
                item_name: i.name || i.item_name,
                category: i.category || i.category_name || 'Main Course',
                description: i.description || '',
                price: parseFloat(i.price) || 0,
                currency: i.currency || '₹',
                image_url: i.imageUrl || i.image_url || '',
                image_alt_text: i.imageAltText || i.image_alt_text || '',
                item_emoji: i.emoji || i.item_emoji || '🍽️',
                is_vegetarian: i.isVegetarian !== undefined ? i.isVegetarian : (i.is_vegetarian === true || i.is_vegetarian === 'true' || i.is_vegetarian === 1),
                is_available: i.isAvailable !== undefined ? i.isAvailable : (i.is_available !== false && i.is_available !== 'false' && i.is_available !== 0),
                is_bestseller: i.isBestseller !== undefined ? i.isBestseller : (i.is_bestseller === true || i.is_bestseller === 'true' || i.is_bestseller === 1),
                spice_level: i.spiceLevel || i.spice_level || 'None',
                allergens: i.allergens || ''
              }));
            }
          }

          _isOnlineAPI = true;
          _saveState();
          return true;
        }
      }
    } catch (e) {
      console.info('[MenuScan DB] API offline or static mode, falling back to local storage/CSV.', e);
    }

    // 2. Fallback: check localStorage
    const savedItems = localStorage.getItem(STORAGE_KEY_ITEMS);
    const savedRestaurants = localStorage.getItem(STORAGE_KEY_RESTAURANTS);

    if (savedItems && savedRestaurants) {
      try {
        _rawData = JSON.parse(savedItems);
        _restaurants = JSON.parse(savedRestaurants);
        return true;
      } catch (e) {
        console.warn('Corrupted localStorage, reloading seed CSV', e);
      }
    }

    // 3. Fallback: fetch static CSV or embedded string
    let csvText = null;
    try {
      const response = await fetch('data/restaurants.csv');
      if (response.ok) csvText = await response.text();
    } catch (e) {}

    if (!csvText) csvText = EMBEDDED_CSV;

    try {
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim(),
        transform: val => (typeof val === 'string' ? val.trim() : val)
      });

      _rawData = result.data.filter(row => row.restaurant_id && row.item_id);
      _buildRestaurantIndex();
      _saveState();
      return true;
    } catch (err) {
      throw new Error('Failed to parse restaurant database: ' + err.message);
    }
  }

  function _buildRestaurantIndex() {
    const map = new Map();
    _rawData.forEach(row => {
      if (!map.has(row.restaurant_id)) {
        map.set(row.restaurant_id, {
          id:         row.restaurant_id,
          name:       row.restaurant_name,
          slug:       row.restaurant_name.toLowerCase().replace(/\s+/g, '-'),
          tagline:    row.restaurant_tagline || '',
          themeColor: row.restaurant_theme_color  || '#6c63ff',
          accentColor:row.restaurant_accent_color || '#a855f7',
          logoUrl:    row.image_url || '',
          logoEmoji:  row.restaurant_logo_emoji   || '🍽️',
          cuisine:    row.restaurant_cuisine       || 'Multi-cuisine',
          rating:     parseFloat(row.restaurant_rating) || 4.5,
          address:    row.restaurant_address || '',
          phone:      row.restaurant_phone   || '',
          openTime:   row.open_time          || '11:00 AM',
          closeTime:  row.close_time         || '11:00 PM',
          menuId:     row.menu_id            || `MENU_${row.restaurant_id}`
        });
      }
    });
    _restaurants = [...map.values()];
  }

  function _saveState() {
    try {
      if (_rawData) localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(_rawData));
      if (_restaurants) localStorage.setItem(STORAGE_KEY_RESTAURANTS, JSON.stringify(_restaurants));
    } catch (e) {}
  }

  // ── Public Read API ───────────────────────────────────────────

  function getRestaurant(idOrSlug) {
    if (!_restaurants) return null;
    return _restaurants.find(r => r.id === idOrSlug || r.slug === idOrSlug) || null;
  }

  function getAllRestaurants() {
    return _restaurants ? [..._restaurants] : [];
  }

  async function fetchMenuItemsAPI(restaurantId, filters = {}) {
    try {
      let url = restaurantId && restaurantId !== 'all' ? `/api/items/${restaurantId}?` : `/api/items?`;
      if (filters.category && filters.category !== 'All') url += `category=${encodeURIComponent(filters.category)}&`;
      if (filters.search) url += `search=${encodeURIComponent(filters.search)}&`;
      if (filters.vegOnly) url += `vegOnly=true&`;
      if (filters.availableOnly) url += `availableOnly=true&`;

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.items;
      }
    } catch (e) {}
    return getMenuItems(restaurantId, filters);
  }

  function getMenuItems(restaurantId, filters = {}) {
    if (!_rawData) return [];
    let rows = _rawData;
    if (restaurantId && restaurantId !== 'all') {
      rows = rows.filter(r => (r.restaurant_id || r.restaurantId) === restaurantId);
    }

    if (filters.category && filters.category !== 'All') {
      rows = rows.filter(r => (r.category || r.category_name) === filters.category);
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(r =>
        ((r.item_name || r.name) && (r.item_name || r.name).toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        ((r.category || r.category_name) && (r.category || r.category_name).toLowerCase().includes(q)) ||
        ((r.item_id || r.id) && (r.item_id || r.id).toLowerCase().includes(q))
      );
    }
    if (filters.vegOnly) {
      rows = rows.filter(r => r.is_vegetarian === true || r.is_vegetarian === 'true' || r.is_vegetarian === 1 || r.isVegetarian === true);
    }
    if (filters.availableOnly) {
      rows = rows.filter(r => r.is_available === true || r.is_available === 'true' || r.is_available === 1 || r.isAvailable === true);
    }

    return rows.map(r => ({
      id:          r.item_id || r.id,
      name:        r.item_name || r.name,
      category:    r.category || r.category_name || 'Main Course',
      description: r.description || '',
      price:       parseFloat(r.price) || 0,
      currency:    r.currency    || '₹',
      imageUrl:    r.image_url   || r.imageUrl || '',
      imageAltText:r.image_alt_text || r.imageAltText || `${r.item_name || r.name} dish presentation`,
      emoji:       r.item_emoji  || r.emoji || '🍽️',
      isVegetarian:r.is_vegetarian === true || r.is_vegetarian === 'true' || r.is_vegetarian === 1 || r.isVegetarian === true,
      isAvailable: r.is_available === true || r.is_available === 'true' || r.is_available === 1 || r.isAvailable === true,
      isBestseller:r.is_bestseller === true || r.is_bestseller === 'true' || r.is_bestseller === 1 || r.isBestseller === true,
      spiceLevel:  r.spice_level  || r.spiceLevel || 'None',
      allergens:   r.allergens || '',
      restaurantId:r.restaurant_id || r.restaurantId
    }));
  }

  function getCategories(restaurantId) {
    if (!_rawData) return ['All'];
    let filtered = _rawData;
    if (restaurantId && restaurantId !== 'all') {
      filtered = _rawData.filter(r => (r.restaurant_id || r.restaurantId) === restaurantId);
    }
    const cats = [...new Set(filtered.map(r => r.category || r.category_name).filter(Boolean))];
    return ['All', ...cats];
  }

  function getStats() {
    return {
      totalRestaurants: _restaurants?.length || 0,
      totalItems:       _rawData?.length || 0,
      availableItems:   _rawData?.filter(r => r.is_available === true || r.is_available === 'true' || r.is_available === 1 || r.isAvailable === true).length || 0
    };
  }

  // ── Public Write/CRUD API ─────────────────────────────────────

  async function addRestaurant(restData) {
    try {
      const res = await fetch('/api/restaurants', {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify(restData)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          await load();
          return json.restaurant;
        }
      }
    } catch (e) {}

    // Fallback local
    const newId = restData.id || `R${String((_restaurants.length + 1)).padStart(3, '0')}`;
    const newRestaurant = {
      id: newId,
      name: restData.name,
      slug: restData.name.toLowerCase().replace(/\s+/g, '-'),
      tagline: restData.tagline || '',
      themeColor: restData.themeColor || '#6c63ff',
      accentColor: restData.accentColor || '#a855f7',
      logoEmoji: restData.logoEmoji || '🍽️',
      logoUrl: restData.logoUrl || '',
      cuisine: restData.cuisine || 'Multi-Cuisine',
      rating: parseFloat(restData.rating) || 4.5,
      address: restData.address || '',
      phone: restData.phone || '',
      openTime: restData.openTime || '11:00 AM',
      closeTime: restData.closeTime || '11:00 PM',
      menuId: `MENU_${newId}`
    };
    _restaurants.push(newRestaurant);
    _saveState();
    return newRestaurant;
  }

  async function updateRestaurant(id, updatedData) {
    try {
      const res = await fetch(`/api/restaurants/${id}`, {
        method: 'PUT',
        headers: _authHeaders(),
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        await load();
        return true;
      }
    } catch (e) {}

    const idx = _restaurants.findIndex(r => r.id === id);
    if (idx === -1) return false;
    _restaurants[idx] = { ..._restaurants[idx], ...updatedData };
    _saveState();
    return true;
  }

  async function deleteRestaurant(id) {
    try {
      const res = await fetch(`/api/restaurants/${id}`, {
        method: 'DELETE',
        headers: _authHeaders()
      });
      if (res.ok) {
        await load();
        return true;
      }
    } catch (e) {}

    _restaurants = _restaurants.filter(r => r.id !== id);
    if (_rawData) _rawData = _rawData.filter(r => r.restaurant_id !== id);
    _saveState();
    return true;
  }

  async function addMenuItem(itemData) {
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify(itemData)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          await load();
          return json.item;
        }
      }
    } catch (e) {}

    // Fallback local
    const newItemId = `I${Date.now().toString().slice(-6)}`;
    const newRow = {
      restaurant_id: itemData.restaurantId,
      item_id: newItemId,
      item_name: itemData.name,
      category: itemData.category || 'Main Course',
      description: itemData.description || '',
      price: String(itemData.price || 0),
      currency: itemData.currency || '₹',
      image_url: itemData.imageUrl || '',
      image_alt_text: itemData.imageAltText || '',
      item_emoji: itemData.emoji || '🍽️',
      is_vegetarian: String(itemData.isVegetarian === true),
      is_available: String(itemData.isAvailable !== false),
      is_bestseller: String(itemData.isBestseller === true),
      spice_level: itemData.spiceLevel || 'None'
    };
    if (_rawData) _rawData.push(newRow);
    _saveState();
    return newRow;
  }

  async function updateMenuItem(itemId, updatedData) {
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: _authHeaders(),
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        await load();
        return true;
      }
    } catch (e) {}

    if (_rawData) {
      const row = _rawData.find(r => r.item_id === itemId);
      if (row) {
        if (updatedData.name !== undefined) row.item_name = updatedData.name;
        if (updatedData.category !== undefined) row.category = updatedData.category;
        if (updatedData.price !== undefined) row.price = String(updatedData.price);
        if (updatedData.description !== undefined) row.description = updatedData.description;
        if (updatedData.imageUrl !== undefined) row.image_url = updatedData.imageUrl;
        if (updatedData.emoji !== undefined) row.item_emoji = updatedData.emoji;
        if (updatedData.isVegetarian !== undefined) row.is_vegetarian = String(updatedData.isVegetarian);
        if (updatedData.isAvailable !== undefined) row.is_available = String(updatedData.isAvailable);
        if (updatedData.isBestseller !== undefined) row.is_bestseller = String(updatedData.isBestseller);
        _saveState();
        return true;
      }
    }
    return false;
  }

  async function toggleItemAvailability(itemId) {
    try {
      const res = await fetch(`/api/items/${itemId}/availability`, {
        method: 'PATCH',
        headers: _authHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        await load();
        return json.isAvailable;
      }
    } catch (e) {}

    if (_rawData) {
      const row = _rawData.find(r => r.item_id === itemId);
      if (row) {
        const curr = row.is_available === 'true' || row.is_available === true;
        row.is_available = String(!curr);
        _saveState();
        return !curr;
      }
    }
    return false;
  }

  async function deleteMenuItem(itemId) {
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: 'DELETE',
        headers: _authHeaders()
      });
      if (res.ok) {
        await load();
        return true;
      }
    } catch (e) {}

    if (_rawData) {
      _rawData = _rawData.filter(r => r.item_id !== itemId);
      _saveState();
    }
    return true;
  }

  async function saveOrder(order) {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch (e) {}

    // Fallback local orders
    const orders = getOrders();
    const newOrder = {
      orderId: order.orderId || ('ORD' + Date.now().toString().slice(-6)),
      restaurantId: order.restaurantId,
      restaurantName: order.restaurantName || '',
      tableNumber: order.tableNumber || 'Takeaway',
      items: order.items || [],
      subtotal: order.subtotal || 0,
      tax: order.tax || 0,
      grandTotal: order.grandTotal || 0,
      timestamp: new Date().toISOString(),
      status: 'Received'
    };
    orders.unshift(newOrder);
    localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders.slice(0, 100)));
    return newOrder;
  }

  async function getOrders(restaurantId = null) {
    try {
      if (restaurantId && restaurantId !== 'all') {
        const res = await fetch(`/api/orders/${restaurantId}`, { headers: _authHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success) return json.orders;
        }
      }
    } catch (e) {}

    const saved = localStorage.getItem(STORAGE_KEY_ORDERS);
    const orders = saved ? JSON.parse(saved) : [];
    if (restaurantId && restaurantId !== 'all') {
      return orders.filter(o => o.restaurantId === restaurantId);
    }
    return orders;
  }

  async function logAnalyticsEvent(restaurantId, eventType, metadata = {}) {
    try {
      await fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, eventType, metadata })
      });
    } catch (e) {}
  }

  function resetToDefault() {
    localStorage.removeItem(STORAGE_KEY_ITEMS);
    localStorage.removeItem(STORAGE_KEY_RESTAURANTS);
    return load();
  }

  function exportCSV() {
    if (!_rawData || _rawData.length === 0) return '';
    return Papa.unparse(_rawData);
  }

  return {
    load,
    setAuthToken,
    getAuthToken,
    getRestaurant,
    getAllRestaurants,
    getMenuItems,
    fetchMenuItemsAPI,
    getCategories,
    getStats,
    addRestaurant,
    updateRestaurant,
    deleteRestaurant,
    addMenuItem,
    updateMenuItem,
    toggleItemAvailability,
    deleteMenuItem,
    saveOrder,
    getOrders,
    logAnalyticsEvent,
    resetToDefault,
    exportCSV
  };
})();
