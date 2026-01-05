const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const LS = {
  user: "pikul_user",
  orders: "pikul_orders",
  vendors: "pikul_vendors"
};

const screens = {
  Home: $("#screenHome"),
  Map: $("#screenMap"),
  Orders: $("#screenOrders"),
  Messages: $("#screenMessages"),
  Profile: $("#screenProfile"),
};

let state = {
  user: null,
  you: { ok:false, lat:null, lon:null },
  vendors: [],
  cart: [],
  orders: [],
  selectedVendorId: null,
  chatWithVendorId: null,
  chats: {}
};

const MENU = {
  bakso: [
    { id:"m1", name:"Bakso Urat", price:15000 },
    { id:"m2", name:"Bakso Telur", price:17000 },
    { id:"m3", name:"Es Teh", price:5000 },
  ],
  kopi: [
    { id:"k1", name:"Kopi Susu", price:12000 },
    { id:"k2", name:"Americano", price:14000 },
    { id:"k3", name:"Roti Bakar", price:10000 },
  ],
  nasi: [
    { id:"n1", name:"Nasi Goreng", price:18000 },
    { id:"n2", name:"Mie Goreng", price:17000 },
    { id:"n3", name:"Air Mineral", price:4000 },
  ]
};

function rupiah(n){ return "Rp " + (n||0).toLocaleString("id-ID"); }
function uid(p="ID"){ return `${p}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }

function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return fallback;
    return JSON.parse(raw);
  }catch{ return fallback; }
}
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function setActiveNav(name){
  $$(".nav").forEach(b => b.classList.toggle("active", b.dataset.go === name));
}
function go(name){
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  setActiveNav(name);
  if(name === "Map") renderMap();
  if(name === "Orders") renderOrders();
  if(name === "Messages") renderChat();
  if(name === "Profile") renderProfile();
}

/* ---------- AUTH ---------- */
function showAuth(){ show($("#auth")); hide($("#app")); }
function showApp(){ hide($("#auth")); show($("#app")); }

function initAuth(){
  const u = loadJSON(LS.user, null);
  if(u){
    state.user = u;
    showApp();
    bootApp();
  }else{
    showAuth();
  }
}

$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("#email").value.trim();
  const pass = $("#password").value.trim();
  if(!email.includes("@")) return alert("Email tidak valid.");
  if(pass.length < 4) return alert("Password minimal 4 karakter.");
  const name = email.split("@")[0].replaceAll(".", " ").slice(0,18);
  const user = { id: uid("USR"), name: titleCase(name), email, wallet: 0 };
  state.user = user;
  saveJSON(LS.user, user);
  showApp();
  bootApp();
});

$("#demoBtn").addEventListener("click", () => {
  const user = { id: uid("USR"), name: "Ily Demo", email:"demo@pikul.id", wallet: 25000 };
  state.user = user;
  saveJSON(LS.user, user);
  showApp();
  bootApp();
});

$("#logoutBtn").addEventListener("click", () => {
  if(confirm("Keluar dari akun?")){
    localStorage.removeItem(LS.user);
    stopGPS();
    state.user = null;
    showAuth();
  }
});

/* ---------- BOOT ---------- */
function bootApp(){
  $("#userName").textContent = state.user.name;
  loadOrders();
  loadOrSeedVendors();
  renderHome();
  go("Home");
  updateGpsUI();
}

/* ---------- GPS ---------- */
let watchId = null;

function updateGpsUI(){
  const gps = $("#gpsStatus");
  gps.textContent = state.you.ok ? "GPS aktif" : "GPS belum aktif";
  gps.classList.toggle("warn", !state.you.ok);
  $("#youCoord").textContent = state.you.ok
    ? `${state.you.lat.toFixed(5)}, ${state.you.lon.toFixed(5)}`
    : "-";
}

function startGPS(){
  if(!navigator.geolocation) return alert("Browser tidak mendukung GPS.");
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      state.you.ok = true;
      state.you.lat = pos.coords.latitude;
      state.you.lon = pos.coords.longitude;
      updateGpsUI();
      // re-seed near user only if no vendors
      if(!state.vendors.length) loadOrSeedVendors(true);
      renderHome();
      if(!screens.Map.classList.contains("hidden")) renderMap();
    },
    () => {
      state.you.ok = false;
      updateGpsUI();
      alert("GPS ditolak/error. Pakai Live Server / HTTPS ya.");
    },
    { enableHighAccuracy:true, maximumAge:2000, timeout:8000 }
  );
}
function stopGPS(){
  if(watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

$("#gpsBtn").addEventListener("click", startGPS);

/* ---------- VENDORS ---------- */
function loadOrSeedVendors(forceNearUser=false){
  const saved = loadJSON(LS.vendors, []);
  if(saved.length && !forceNearUser){
    state.vendors = saved;
    return;
  }
  const baseLat = state.you.lat ?? -6.200000;
  const baseLon = state.you.lon ?? 106.816666;
  const rand = (min,max)=>Math.random()*(max-min)+min;

  state.vendors = [
    { id:"v1", name:"Bakso Mang Ujang", type:"bakso", ico:"🍲", rating:4.7, busy:"Sedang", lat: baseLat+rand(-0.006,0.006), lon: baseLon+rand(-0.006,0.006)},
    { id:"v2", name:"Kopi Keliling Dinda", type:"kopi", ico:"☕", rating:4.8, busy:"Ramai", lat: baseLat+rand(-0.006,0.006), lon: baseLon+rand(-0.006,0.006)},
    { id:"v3", name:"Nasi Goreng Pak De", type:"nasi", ico:"🍳", rating:4.6, busy:"Lengang", lat: baseLat+rand(-0.006,0.006), lon: baseLon+rand(-0.006,0.006)},
    { id:"v4", name:"Es Teh Jumbo Rani", type:"bakso", ico:"🧋", rating:4.5, busy:"Sedang", lat: baseLat+rand(-0.006,0.006), lon: baseLon+rand(-0.006,0.006)},
  ];
  saveJSON(LS.vendors, state.vendors);
}

function moveVendors(){
  const step = 0.00025;
  state.vendors = state.vendors.map(v => ({
    ...v,
    lat: v.lat + (Math.random()-0.5)*step,
    lon: v.lon + (Math.random()-0.5)*step
  }));
  saveJSON(LS.vendors, state.vendors);
  $("#tick").textContent = new Date().toLocaleTimeString("id-ID");
}

setInterval(() => {
  if(!state.vendors.length) return;
  moveVendors();
  if(!screens.Home.classList.contains("hidden")) renderVendorCards();
  if(!screens.Map.classList.contains("hidden")) { renderMap(); renderRealtimeList(); }
}, 2000);

function distKm(aLat,aLon,bLat,bLon){
  if(!state.you.ok) return null;
  const R=6371;
  const dLat=(bLat-aLat)*Math.PI/180;
  const dLon=(bLon-aLon)*Math.PI/180;
  const x=Math.sin(dLat/2)**2 + Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}

function vendorDistanceText(v){
  const d = distKm(state.you.lat, state.you.lon, v.lat, v.lon);
  if(d == null) return "GPS belum aktif";
  if(d < 1) return `${Math.round(d*1000)} m`;
  return `${d.toFixed(2)} km`;
}

/* ---------- HOME RENDER ---------- */
function renderHome(){
  renderVendorCards();
  renderCart();
}

function renderVendorCards(){
  const q = ($("#search").value || "").toLowerCase().trim();
  const list = state.vendors
    .filter(v => !q || v.name.toLowerCase().includes(q) || v.type.includes(q))
    .map(v => `
      <div class="vendorCard" data-v="${v.id}">
        <div class="vIco">${v.ico}</div>
        <div class="vMeta">
          <b>${v.name}</b>
          <div class="muted">Rating ${v.rating} • ${v.busy}</div>
          <div class="chips">
            <span class="chip">${v.type.toUpperCase()}</span>
            <span class="chip">📍 ${vendorDistanceText(v)}</span>
            <span class="chip">Realtime</span>
          </div>
        </div>
        <div class="price">Lihat</div>
      </div>
    `).join("");

  $("#vendorList").innerHTML = list || `<div class="card"><div class="muted">Tidak ada pedagang.</div></div>`;
  $$("#vendorList .vendorCard").forEach(el => el.addEventListener("click", () => openVendor(el.dataset.v)));
}

$("#search").addEventListener("input", renderVendorCards);
$("#refreshBtn").addEventListener("click", () => { moveVendors(); renderVendorCards(); });

/* ---------- MODALS ---------- */
function openModal(id){ $("#"+id).classList.remove("hidden"); }
function closeModal(id){ $("#"+id).classList.add("hidden"); }

document.body.addEventListener("click", (e) => {
  const close = e.target.getAttribute("data-close");
  if(close) closeModal(close);
});

function getVendor(id){ return state.vendors.find(v => v.id === id); }

function openVendor(vId){
  state.selectedVendorId = vId;
  const v = getVendor(vId);
  if(!v) return;

  $("#vTitle").textContent = v.name;
  $("#vMeta").textContent = `📍 ${vendorDistanceText(v)} • ${v.type.toUpperCase()}`;
  const menu = MENU[v.type] || [];

  $("#menuList").innerHTML = menu.map(m => `
    <div class="listItem" data-menu="${m.id}">
      <div>
        <b>${m.name}</b>
        <div class="muted">${rupiah(m.price)}</div>
      </div>
      <div class="price">Tambah</div>
    </div>
  `).join("");

  $$("#menuList .listItem").forEach(el => el.addEventListener("click", () => addToCart(vId, v.type, el.dataset.menu)));

  openModal("vendorModal");
}

function addToCart(vId, type, menuId){
  const item = (MENU[type]||[]).find(x => x.id === menuId);
  if(!item) return;
  const ex = state.cart.find(x => x.vendorId === vId && x.itemId === menuId);
  if(ex) ex.qty++;
  else state.cart.push({ vendorId:vId, itemId:menuId, name:item.name, price:item.price, qty:1 });
  renderCart();
}

/* ---------- CART ---------- */
function renderCart(){
  const count = state.cart.reduce((a,c)=>a+c.qty,0);
  $("#cartBadge").textContent = `${count} item`;

  if(!state.cart.length){
    $("#cartBox").innerHTML = `<div class="muted">Keranjang kosong. Klik pedagang → tambah menu.</div>`;
    return;
  }

  const rows = state.cart.map(it => `
    <div class="rowBetween" style="padding:10px 0; border-bottom:1px dashed var(--line)">
      <div>
        <b>${it.name}</b>
        <div class="muted">${rupiah(it.price)} • ${getVendor(it.vendorId)?.name ?? "-"}</div>
      </div>
      <div style="display:flex; gap:6px; align-items:center">
        <button class="iconBtn" data-dec="${it.vendorId}|${it.itemId}">−</button>
        <b>${it.qty}</b>
        <button class="iconBtn" data-inc="${it.vendorId}|${it.itemId}">+</button>
      </div>
    </div>
  `).join("");

  const total = state.cart.reduce((s,it)=>s+it.price*it.qty,0);

  $("#cartBox").innerHTML = `
    ${rows}
    <div class="rowBetween" style="margin-top:10px">
      <div>
        <div class="muted">Total</div>
        <div class="big"><b>${rupiah(total)}</b></div>
      </div>
      <button id="checkoutBtn" class="btn primary small">Checkout</button>
    </div>
  `;

  $("#cartBox").querySelectorAll("[data-inc]").forEach(b => b.addEventListener("click", () => adjustQty(b.getAttribute("data-inc"), +1)));
  $("#cartBox").querySelectorAll("[data-dec]").forEach(b => b.addEventListener("click", () => adjustQty(b.getAttribute("data-dec"), -1)));
  $("#checkoutBtn").addEventListener("click", openCheckout);
}

function adjustQty(key, delta){
  const [vId, itemId] = key.split("|");
  const idx = state.cart.findIndex(x => x.vendorId===vId && x.itemId===itemId);
  if(idx < 0) return;
  state.cart[idx].qty += delta;
  if(state.cart[idx].qty <= 0) state.cart.splice(idx,1);
  renderCart();
}

/* ---------- CHECKOUT ---------- */
function openCheckout(){
  if(!state.cart.length) return alert("Keranjang kosong.");
  $("#checkoutItems").innerHTML = state.cart.map(it => `
    <div class="listItem">
      <div>
        <b>${it.name} × ${it.qty}</b>
        <div class="muted">${getVendor(it.vendorId)?.name ?? "-"}</div>
      </div>
      <div class="price">${rupiah(it.price*it.qty)}</div>
    </div>
  `).join("");

  const total = state.cart.reduce((s,it)=>s+it.price*it.qty,0);
  $("#checkoutTotal").textContent = rupiah(total);
  openModal("checkoutModal");
}

$("#placeOrderBtn").addEventListener("click", () => {
  const method = $("#payMethod").value;
  const note = ($("#orderNote").value || "").trim();
  const total = state.cart.reduce((s,it)=>s+it.price*it.qty,0);

  const firstVendor = getVendor(state.cart[0].vendorId);
  const order = {
    id: uid("ORD"),
    userId: state.user.id,
    userName: state.user.name,
    vendorId: firstVendor?.id ?? "-",
    vendorName: firstVendor?.name ?? "-",
    items: JSON.parse(JSON.stringify(state.cart)),
    total,
    method,
    note,
    status: "Diproses",
    createdAt: new Date().toISOString()
  };

  state.orders.unshift(order);
  saveOrders();

  // simulasi status berubah
  setTimeout(()=>updateOrderStatus(order.id, "Dalam perjalanan"), 3500);
  setTimeout(()=>updateOrderStatus(order.id, "Selesai"), 8000);

  state.cart = [];
  $("#orderNote").value = "";
  closeModal("checkoutModal");
  renderCart();
  go("Orders");
});

function updateOrderStatus(orderId, status){
  // update in memory + localStorage so admin sees it
  state.orders = state.orders.map(o => o.id===orderId ? {...o, status} : o);
  saveOrders();
  if(!screens.Orders.classList.contains("hidden")) renderOrders();
}

/* ---------- ORDERS STORAGE ---------- */
function loadOrders(){
  state.orders = loadJSON(LS.orders, []);
}
function saveOrders(){
  saveJSON(LS.orders, state.orders);
}

/* ---------- ORDERS UI ---------- */
function renderOrders(){
  loadOrders(); // always sync with LS
  const list = $("#ordersList");
  if(!state.orders.length){
    list.innerHTML = `<div class="card"><div class="muted">Belum ada pesanan. Pesan dari Home dulu.</div></div>`;
    return;
  }
  list.innerHTML = state.orders
    .filter(o => o.userId === state.user.id) // user-specific
    .map(o => {
      const t = new Date(o.createdAt).toLocaleString("id-ID");
      return `
        <div class="listItem" data-ord="${o.id}">
          <div>
            <b>${o.vendorName}</b>
            <div class="muted">${t} • ${o.method.toUpperCase()}</div>
            <div class="muted">Status: <b>${o.status}</b></div>
          </div>
          <div class="price">${rupiah(o.total)}</div>
        </div>
      `;
    }).join("");

  list.querySelectorAll("[data-ord]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.ord;
      const o = state.orders.find(x => x.id === id);
      if(!o) return;
      const detail = o.items.map(it => `- ${it.name} x${it.qty} (${rupiah(it.price*it.qty)})`).join("\n");
      alert(`Detail Pesanan\n\nVendor: ${o.vendorName}\nStatus: ${o.status}\nTotal: ${rupiah(o.total)}\n\nItems:\n${detail}`);
    });
  });
}

/* ---------- MESSAGES ---------- */
function ensureChat(vId){
  if(!state.chats[vId]) state.chats[vId] = [];
  return state.chats[vId];
}
function renderChat(){
  const vId = state.chatWithVendorId;
  $("#chatWith").textContent = vId ? (getVendor(vId)?.name ?? "-") : "-";
  const box = $("#chatBox");
  box.innerHTML = "";

  if(!vId){
    box.innerHTML = `<div class="muted">Pilih pedagang dulu untuk chat.</div>`;
    return;
  }

  const msgs = ensureChat(vId);
  if(!msgs.length) msgs.push({from:"vendor", text:"Halo! Mau pesan apa hari ini?", ts:Date.now()});

  msgs.forEach(m => {
    const div = document.createElement("div");
    div.className = "bubble" + (m.from==="me" ? " me" : "");
    div.textContent = m.text;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

$("#pickChatBtn").addEventListener("click", () => {
  $("#pickChatList").innerHTML = state.vendors.map(v => `
    <div class="listItem" data-vchat="${v.id}">
      <div>
        <b>${v.ico} ${v.name}</b>
        <div class="muted">Tap untuk chat</div>
      </div>
      <div class="price">Pilih</div>
    </div>
  `).join("");
  $$("#pickChatList [data-vchat]").forEach(el => {
    el.addEventListener("click", () => {
      state.chatWithVendorId = el.dataset.vchat;
      closeModal("pickChatModal");
      renderChat();
    });
  });
  openModal("pickChatModal");
});

$("#sendChatBtn").addEventListener("click", () => {
  const vId = state.chatWithVendorId;
  if(!vId) return alert("Pilih pedagang dulu.");
  const txt = ($("#chatInput").value || "").trim();
  if(!txt) return;
  ensureChat(vId).push({from:"me", text:txt, ts:Date.now()});
  $("#chatInput").value = "";
  renderChat();
  setTimeout(() => {
    ensureChat(vId).push({from:"vendor", text:"Siap, noted ya ✅", ts:Date.now()});
    renderChat();
  }, 900);
});

$("#chatVendorBtn").addEventListener("click", () => {
  if(!state.selectedVendorId) return;
  state.chatWithVendorId = state.selectedVendorId;
  closeModal("vendorModal");
  go("Messages");
});

$("#checkoutFromVendorBtn").addEventListener("click", () => {
  closeModal("vendorModal");
  openCheckout();
});

/* ---------- PROFILE ---------- */
function renderProfile(){
  $("#pName").textContent = state.user.name;
  $("#pEmail").textContent = state.user.email;
  $("#wallet").textContent = rupiah(state.user.wallet || 0);
}

$("#topupBtn").addEventListener("click", () => {
  state.user.wallet = (state.user.wallet || 0) + 50000;
  saveJSON(LS.user, state.user);
  renderProfile();
  alert("Top up berhasil (dummy) +Rp 50.000");
});

/* ---------- MAP ---------- */
function renderMap(){
  // simple projection: vendor pins around center
  const pins = $("#pins");
  pins.innerHTML = "";

  const box = document.querySelector(".mapBox");
  const w = box.clientWidth;
  const h = box.clientHeight;

  const baseLat = state.you.lat ?? -6.200000;
  const baseLon = state.you.lon ?? 106.816666;

  state.vendors.forEach(v => {
    const dx = (v.lon - baseLon) * 8000;
    const dy = (v.lat - baseLat) * -8000;
    const x = Math.max(6, Math.min(w - 60, (w/2) + dx));
    const y = Math.max(10, Math.min(h - 40, (h*0.55) + dy));

    const el = document.createElement("div");
    el.className = "pin";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.textContent = `${v.ico} ${v.name.split(" ").slice(0,2).join(" ")}`;
    el.title = `${v.name} • ${vendorDistanceText(v)}`;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => openVendor(v.id));
    pins.appendChild(el);
  });

  renderRealtimeList();
}

function renderRealtimeList(){
  $("#realtimeList").innerHTML = state.vendors.map(v => `
    <div class="listItem" data-v="${v.id}">
      <div>
        <b>${v.ico} ${v.name}</b>
        <div class="muted">📍 ${vendorDistanceText(v)} • (${v.lat.toFixed(5)}, ${v.lon.toFixed(5)})</div>
      </div>
      <div class="price">Menu</div>
    </div>
  `).join("");
  $$("#realtimeList [data-v]").forEach(el => el.addEventListener("click", () => openVendor(el.dataset.v)));
}

$("#openMapsBtn").addEventListener("click", () => {
  if(!state.you.ok) return alert("GPS belum aktif.");
  window.open(`https://www.google.com/maps?q=${state.you.lat},${state.you.lon}`, "_blank");
});
$("#recenterBtn").addEventListener("click", renderMap);

/* ---------- NAV ---------- */
$$(".nav").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

/* ---------- UTILS ---------- */
function titleCase(s){
  return (s||"").split(" ").filter(Boolean).map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

/* ---------- INIT ---------- */
initAuth();
