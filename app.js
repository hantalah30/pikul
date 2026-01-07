import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
function rupiah(n) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

// --- STATE ---
const screens = {
  Home: $("#screenHome"),
  Map: $("#screenMap"),
  Orders: $("#screenOrders"),
  Messages: $("#screenMessages"),
  Profile: $("#screenProfile"),
};
// Dummy Fallback Menu
const MENU = {
  bakso: [
    { id: "m1", name: "Bakso Urat", price: 15000 },
    { id: "m2", name: "Bakso Telur", price: 17000 },
    { id: "m3", name: "Es Teh", price: 5000 },
  ],
  kopi: [
    { id: "k1", name: "Kopi Susu", price: 12000 },
    { id: "k2", name: "Americano", price: 14000 },
  ],
  nasi: [
    { id: "n1", name: "Nasi Goreng", price: 18000 },
    { id: "n2", name: "Mie Goreng", price: 17000 },
  ],
};

let state = {
  user: null,
  you: { ok: false, lat: -6.2, lon: 106.816666 }, // Default Loc
  vendors: [],
  cart: [],
  orders: [],
  autoReplies: [],
  selectedVendorId: null,
  chatWithVendorId: null,
  activeCategory: "Semua",
  firstLoad: true,
  unsubChats: null,
  activeOrderTab: "active",
  map: null,
  markers: {},
  userMarker: null,
};

// --- BOOT ---
async function bootApp() {
  $("#userName").textContent = state.user.name;
  initTheme();

  // Listen Vendors (Realtime)
  onSnapshot(collection(db, "vendors"), (s) => {
    state.vendors = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Update tampilan jika sedang aktif
    if (!$("#screenHome").classList.contains("hidden")) renderVendors();
    if (!$("#screenMap").classList.contains("hidden")) updateMapMarkers();
  });

  // Listen Orders (Realtime)
  onSnapshot(
    query(collection(db, "orders"), where("userId", "==", state.user.id)),
    (s) => {
      let raw = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.orders = raw.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      if (!state.firstLoad) {
        s.docChanges().forEach((c) => {
          if (c.type === "modified")
            showToast(`Status Order: ${c.doc.data().status}`);
        });
      }
      state.firstLoad = false;
      renderOrders();
    }
  );

  // Listen Auto Replies
  onSnapshot(
    collection(db, "auto_replies"),
    (s) => (state.autoReplies = s.docs.map((d) => d.data().text))
  );

  renderProfile();
  window.go("Home"); // Start at Home
  startGPS();
  updateFab();
}

// --- HOME ---
function renderHome() {
  const promos = [
    {
      t: "Diskon 50%",
      d: "Pengguna baru",
      c: "linear-gradient(135deg, #ff7a00, #ff4d00)",
    },
    {
      t: "Gratis Ongkir",
      d: "Min 20rb",
      c: "linear-gradient(135deg, #3b82f6, #2563eb)",
    },
  ];
  $("#promoList").innerHTML = promos
    .map(
      (p) =>
        `<div class="promo-card" style="background:${p.c}"><div class="promo-bg">%</div><h3>${p.t}</h3><p>${p.d}</p></div>`
    )
    .join("");

  const cats = ["Semua", "Bakso", "Kopi", "Nasi"];
  $("#categoryFilters").innerHTML = cats
    .map(
      (c) =>
        `<button class="filter-chip ${
          state.activeCategory === c ? "active" : ""
        }" onclick="setCategory('${c}')">${c}</button>`
    )
    .join("");

  renderVendors();
}
window.setCategory = (c) => {
  state.activeCategory = c;
  renderHome();
};

function renderVendors() {
  const q = ($("#search").value || "").toLowerCase();
  const cat = state.activeCategory.toLowerCase();
  const list = state.vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(q) &&
      (cat === "semua" || v.type.includes(cat))
  );

  $("#vendorList").innerHTML =
    list
      .map(
        (v) => `
    <div class="vendorCard" onclick="openVendor('${v.id}')">
      <div class="vIco">${v.ico}</div>
      <div class="vMeta">
        <b>${v.name}</b>
        <div class="muted">⭐ ${v.rating ? v.rating.toFixed(1) : "New"} • ${
          v.busy
        }</div>
        <div class="chips"><span class="chip">${v.type.toUpperCase()}</span><span class="chip">📍 ${distText(
          v
        )}</span></div>
      </div>
      <b style="color:var(--orange)">Lihat</b>
    </div>
  `
      )
      .join("") || `<div class="card muted">Tidak ada pedagang aktif.</div>`;
}
$("#search").addEventListener("input", renderVendors);

// --- MAP REALTIME (LEAFLET) ---
function initMap() {
  if (state.map) return; // Map sudah init
  if (!$("#map")) return;

  state.map = L.map("map").setView([state.you.lat, state.you.lon], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OSM",
  }).addTo(state.map);

  // User Marker
  const userIcon = L.divIcon({
    className: "custom-pin",
    html: '<div style="background:#3b82f6; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow:0 0 0 4px rgba(59,130,246,0.3);"></div>',
    iconSize: [20, 20],
  });
  state.userMarker = L.marker([state.you.lat, state.you.lon], {
    icon: userIcon,
  })
    .addTo(state.map)
    .bindPopup("Lokasi Kamu");

  updateMapMarkers();
}

function updateMapMarkers() {
  if (!state.map) return;

  // Render List di bawah peta
  const listEl = $("#realtimeList");
  if (listEl) {
    listEl.innerHTML = state.vendors
      .map(
        (v) => `
      <div class="listItem" onclick="openVendor('${
        v.id
      }')" style="cursor:pointer">
        <div class="rowBetween"><div><b>${v.ico} ${
          v.name
        }</b><div class="muted" style="font-size:12px">(${v.lat.toFixed(
          4
        )}, ${v.lon.toFixed(
          4
        )})</div></div><div class="pill small">📍 ${distText(v)}</div></div>
      </div>
    `
      )
      .join("");
  }

  // Update Markers
  state.vendors.forEach((v) => {
    if (state.markers[v.id]) {
      state.markers[v.id].setLatLng([v.lat, v.lon]);
    } else {
      const vendorIcon = L.divIcon({
        className: "vendor-pin",
        html: `<div style="background:white; padding:4px; border-radius:8px; border:1px solid #ccc; font-size:16px; text-align:center; width:30px;">${v.ico}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      const m = L.marker([v.lat, v.lon], { icon: vendorIcon }).addTo(state.map);
      m.bindPopup(`<b>${v.name}</b><br>${v.type}`);
      m.on("click", () => openVendor(v.id));
      state.markers[v.id] = m;
    }
  });
}

// --- CART & MENU ---
window.openVendor = (id) => {
  state.selectedVendorId = id;
  const v = state.vendors.find((x) => x.id === id);
  if (!v) return;

  $("#vTitle").textContent = v.name;
  $("#vMeta").textContent = v.type;

  // Prioritize seller menu from DB
  let menuData = v.menu && v.menu.length > 0 ? v.menu : MENU[v.type] || [];

  $("#menuList").innerHTML = menuData
    .map(
      (m) => `
    <div class="listItem">
      <div style="flex:1"><b>${m.name}</b><div class="muted">${rupiah(
        m.price
      )}</div></div>
      <button class="btn small primary" onclick="addToCart('${id}', '${
        m.id
      }', '${m.name}', ${m.price})">+ Tambah</button>
    </div>
  `
    )
    .join("");

  openModal("vendorModal");
};

window.addToCart = (vid, mid, mName, mPrice) => {
  const v = state.vendors.find((x) => x.id === vid);

  // Fallback nama/harga jika undefined
  if (!mName) {
    const type = v ? v.type : "bakso";
    const item = MENU[type].find((x) => x.id === mid);
    if (item) {
      mName = item.name;
      mPrice = item.price;
    }
  }

  const ex = state.cart.find((x) => x.itemId === mid && x.vendorId === vid);
  if (ex) ex.qty++;
  else
    state.cart.push({
      vendorId: vid,
      vendorName: v ? v.name : "Vendor",
      itemId: mid,
      name: mName,
      price: parseInt(mPrice),
      qty: 1,
    });

  updateFab();
  showToast("Masuk keranjang");
};

function updateFab() {
  const t = state.cart.reduce((a, b) => a + b.qty, 0);
  $("#cartBadge").textContent = t;
  if (t > 0) $("#fabCart").classList.remove("hidden");
  else $("#fabCart").classList.add("hidden");
}

window.openGlobalCart = () => {
  if (!state.cart.length) return showToast("Keranjang kosong");
  renderCartModal();
  openModal("checkoutModal");
};

function renderCartModal() {
  $("#checkoutItems").innerHTML = state.cart
    .map(
      (i, idx) => `
    <div class="cart-item-row">
      <div style="flex:1"><div style="font-weight:bold; font-size:14px">${
        i.name
      }</div><div class="muted" style="font-size:12px">${rupiah(i.price)} • ${
        i.vendorName
      }</div></div>
      <div class="cart-controls">
        <button class="ctrl-btn" onclick="updateCartQty(${idx}, -1)">-</button><span class="ctrl-qty">${
        i.qty
      }</span><button class="ctrl-btn add" onclick="updateCartQty(${idx}, 1)">+</button>
      </div>
      <button class="iconBtn" style="width:30px; height:30px; margin-left:10px; border-color:#fee; color:red; background:#fff5f5" onclick="deleteCartItem(${idx})">🗑</button>
    </div>
  `
    )
    .join("");
  $("#checkoutTotal").textContent = rupiah(
    state.cart.reduce((a, b) => a + b.price * b.qty, 0)
  );
}

window.updateCartQty = (idx, change) => {
  const item = state.cart[idx];
  item.qty += change;
  if (item.qty <= 0) {
    if (confirm("Hapus?")) state.cart.splice(idx, 1);
    else item.qty = 1;
  }
  updateFab();
  if (!state.cart.length) closeModal("checkoutModal");
  else renderCartModal();
};
window.deleteCartItem = (idx) => {
  if (confirm("Hapus?")) {
    state.cart.splice(idx, 1);
    updateFab();
    if (!state.cart.length) closeModal("checkoutModal");
    else renderCartModal();
  }
};

$("#placeOrderBtn").addEventListener("click", async () => {
  if (!state.cart.length) return;
  const btn = $("#placeOrderBtn");
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    const total = state.cart.reduce((a, b) => a + b.price * b.qty, 0);
    // Asumsi single vendor order dulu untuk simplifikasi
    const vName = state.cart[0].vendorName;
    const vId = state.cart[0].vendorId;

    await addDoc(collection(db, "orders"), {
      userId: state.user.id,
      userName: state.user.name,
      vendorId: vId,
      vendorName: vName,
      items: state.cart,
      total: total,
      note: $("#orderNote").value,
      status: "Diproses",
      createdAt: new Date().toISOString(),
    });
    state.cart = [];
    updateFab();
    closeModal("checkoutModal");
    window.go("Orders");
    showToast("Berhasil!");
  } catch (e) {
    alert(e.message);
  }
  btn.disabled = false;
  btn.textContent = "Pesan Sekarang";
});

// --- ORDERS ---
window.switchOrderTab = (tab) => {
  state.activeOrderTab = tab;
  $$(".segment-btn").forEach((b) => b.classList.remove("active"));
  if (tab === "active") $$(".segment-btn")[0].classList.add("active");
  else $$(".segment-btn")[1].classList.add("active");
  renderOrders();
};
function renderOrders() {
  const list = $("#ordersList");
  const filtered = state.orders.filter((o) =>
    state.activeOrderTab === "active"
      ? o.status !== "Selesai"
      : o.status === "Selesai"
  );
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">${
      state.activeOrderTab === "active" ? "🥘" : "🧾"
    }</span><p>Kosong.</p><button class="btn small primary" onclick="go('Home')">Jajan Yuk</button></div>`;
    return;
  }
  list.innerHTML = filtered
    .map((o) => {
      const items = (o.items || [])
        .map((i) => `${i.qty}x ${i.name}`)
        .join(", ");
      const date = new Date(o.createdAt).toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      let statusBadge = "",
        statusIcon = "⏳",
        statusDesc = "Menunggu...",
        actionButtons = "";
      if (o.status === "Diproses") {
        statusBadge = "blue";
        statusIcon = "👨‍🍳";
        statusDesc = "Sedang dimasak...";
      } else if (o.status === "Dalam perjalanan") {
        statusBadge = "orange";
        statusIcon = "🛵";
        statusDesc = "Driver OTW!";
        actionButtons = `<button class="btn small ghost" onclick="trackOrder('${o.vendorId}')" style="flex:1; border-color:var(--orange); color:var(--orange);">🗺️ Lacak</button>`;
      } else if (o.status === "Selesai") {
        statusBadge = "green";
        statusIcon = "✅";
        statusDesc = "Selesai.";
        const rateBtn = !o.rating
          ? `<button class="btn small primary" onclick="rate('${o.id}','${o.vendorId}')" style="flex:1">⭐ Nilai</button>`
          : `<div class="pill" style="flex:1; text-align:center">Rating: ${o.rating}⭐</div>`;
        actionButtons = `${rateBtn}<button class="btn small ghost" onclick="reorder('${o.id}')" style="flex:1">🔄 Pesan Lagi</button>`;
      }
      return `<div class="order-card"><div class="oc-header"><div><b style="font-size:15px">${
        o.vendorName
      }</b><div class="muted" style="font-size:11px">${date}</div></div><span class="badge ${statusBadge}">${
        o.status
      }</span></div><div class="oc-body"><div style="font-size:13px; margin-bottom:12px">${items}</div>${
        state.activeOrderTab === "active"
          ? `<div class="step-compact"><div class="step-icon">${statusIcon}</div><div><b style="font-size:13px; display:block">${o.status}</b><span class="muted" style="font-size:11px">${statusDesc}</span></div></div>`
          : `<div class="rowBetween"><span class="muted" style="font-size:12px">Total Bayar</span><b style="font-size:16px">${rupiah(
              o.total
            )}</b></div>`
      }</div>${
        actionButtons ? `<div class="oc-footer">${actionButtons}</div>` : ""
      }</div>`;
    })
    .join("");
}
window.trackOrder = (vid) => {
  window.go("Map");
  setTimeout(() => {
    if (state.markers[vid]) {
      const ll = state.markers[vid].getLatLng();
      state.map.setView(ll, 16);
      state.markers[vid].openPopup();
    }
  }, 500);
  showToast("Melacak posisi...");
};
window.reorder = (id) => {
  const old = state.orders.find((x) => x.id === id);
  if (!old) return;
  state.cart = [];
  old.items.forEach((i) => state.cart.push({ ...i }));
  updateFab();
  showToast("Masuk keranjang!");
  window.openGlobalCart();
};
window.rate = async (oid, vid) => {
  const s = prompt("Bintang (1-5):");
  if (!s) return;
  await updateDoc(doc(db, "orders", oid), { rating: parseInt(s) });
  showToast("Terima kasih!");
};

// --- CHAT SYSTEM (METADATA FIX & NO BOT) ---
$("#chatVendorBtn").addEventListener("click", () => {
  if (state.selectedVendorId) {
    state.chatWithVendorId = state.selectedVendorId;
    closeModal("vendorModal");
    window.go("Messages");
  } else {
    showToast("Error: ID Vendor");
  }
});
function getChatId() {
  return `${state.user.id}_${state.chatWithVendorId}`;
}

async function renderChat() {
  const vid = state.chatWithVendorId;
  if (!vid) {
    $("#chatWith").textContent = "Pilih Pedagang";
    $("#chatBox").innerHTML =
      "<div class='muted' style='text-align:center; padding:20px'>Pilih pedagang dulu.</div>";
    $("#quickReplies").classList.add("hidden");
    return;
  }

  const v = state.vendors.find((x) => x.id === vid);
  $("#chatWith").textContent = v ? v.name : "Unknown";
  $("#chatBox").innerHTML = "";

  const replies = ["Apakah buka?", "Stok ready?", "Oke makasih", "Bisa pedas?"];
  $("#quickReplies").innerHTML = replies
    .map(
      (r) =>
        `<button class="filter-chip" onclick="sendQuick('${r}')">${r}</button>`
    )
    .join("");
  $("#quickReplies").classList.remove("hidden");

  if (state.unsubChats) state.unsubChats();
  const q = query(
    collection(db, "chats", getChatId(), "messages"),
    orderBy("ts", "asc")
  );
  state.unsubChats = onSnapshot(q, (s) => {
    $("#chatBox").innerHTML = s.docs
      .map((d) => {
        const m = d.data();
        const isMe = m.from === state.user.id;
        return `<div class="bubble ${isMe ? "me" : "them"}" style="background:${
          isMe ? "#ff7a00" : "#f3f4f6"
        }; color:${
          isMe ? "white" : "black"
        }; padding:8px 12px; border-radius:12px; margin-bottom:4px; max-width:80%; align-self:${
          isMe ? "flex-end" : "flex-start"
        }">${m.text}</div>`;
      })
      .join("");
    $("#chatBox").scrollTop = $("#chatBox").scrollHeight;
  });
}

window.sendQuick = (t) => {
  $("#chatInput").value = t;
  $("#sendChatBtn").click();
};

$("#sendChatBtn").addEventListener("click", async () => {
  const t = $("#chatInput").value.trim();
  if (!t || !state.chatWithVendorId) return showToast("Pilih pedagang dulu!");

  const cid = getChatId();
  const vid = state.chatWithVendorId;

  // 1. Simpan Pesan Detail
  await addDoc(collection(db, "chats", cid, "messages"), {
    text: t,
    from: state.user.id,
    ts: Date.now(),
  });

  // 2. WAJIB: Simpan Metadata di Dokumen Induk agar muncul di Seller App
  const v = state.vendors.find((x) => x.id === vid);
  await setDoc(
    doc(db, "chats", cid),
    {
      userId: state.user.id,
      userName: state.user.name,
      vendorId: vid,
      vendorName: v ? v.name : "Unknown",
      lastMessage: t,
      lastUpdate: Date.now(),
    },
    { merge: true }
  );

  $("#chatInput").value = "";
  // Auto-reply BOT DIHAPUS agar manual
});

$("#pickChatBtn").addEventListener("click", () => {
  $("#pickChatList").innerHTML = state.vendors
    .map(
      (v) =>
        `<div class="listItem" onclick="selectChat('${v.id}')"><b>${v.name}</b> <span class="price">Chat</span></div>`
    )
    .join("");
  openModal("pickChatModal");
});
window.selectChat = (id) => {
  state.chatWithVendorId = id;
  closeModal("pickChatModal");
  renderChat();
};

// --- UTILS ---
function showToast(m) {
  let c = $(".toast-container");
  if (!c) {
    c = document.createElement("div");
    c.className = "toast-container";
    document.body.appendChild(c);
  }
  const e = document.createElement("div");
  e.className = "toast";
  e.innerHTML = m;
  c.appendChild(e);
  setTimeout(() => e.remove(), 3000);
}
function initTheme() {
  const d = localStorage.getItem("pikul_theme") === "dark";
  if (d) document.body.setAttribute("data-theme", "dark");
  if ($("#themeSwitch")) $("#themeSwitch").checked = d;
  if ($("#themeSwitch"))
    $("#themeSwitch").addEventListener("change", (e) => {
      if (e.target.checked) {
        document.body.setAttribute("data-theme", "dark");
        localStorage.setItem("pikul_theme", "dark");
      } else {
        document.body.removeAttribute("data-theme");
        localStorage.setItem("pikul_theme", "light");
      }
    });
}
function hideSplash() {
  setTimeout(() => {
    $("#splash").style.opacity = "0";
    setTimeout(() => $("#splash").remove(), 500);
  }, 1500);
}
function showAuth() {
  $("#auth").classList.remove("hidden");
  $("#app").classList.add("hidden");
  hideSplash();
}
function showApp() {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  hideSplash();
}
async function initAuth() {
  const e = localStorage.getItem("pikul_email");
  if (e) await loginUser(e);
  else showAuth();
}
async function loginUser(email) {
  const q = query(collection(db, "users"), where("email", "==", email));
  const s = await getDocs(q);
  if (!s.empty) state.user = { id: s.docs[0].id, ...s.docs[0].data() };
  else {
    const n = { email, name: email.split("@")[0], wallet: 0 };
    const r = await addDoc(collection(db, "users"), n);
    state.user = { id: r.id, ...n };
  }
  localStorage.setItem("pikul_email", email);
  showApp();
  bootApp();
}
$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  loginUser($("#email").value.trim());
});
$("#logoutBtn").addEventListener("click", () => {
  if (confirm("Keluar?")) {
    localStorage.removeItem("pikul_email");
    location.reload();
  }
});

if ($("#mobileProfileLogout")) {
  $("#mobileProfileLogout").addEventListener("click", () => {
    if (confirm("Keluar dari akun?")) {
      localStorage.removeItem("pikul_email");
      location.reload();
    }
  });
}

function startGPS() {
  if (navigator.geolocation)
    navigator.geolocation.watchPosition((p) => {
      state.you = { ok: true, lat: p.coords.latitude, lon: p.coords.longitude };
      $("#gpsStatus").textContent = "GPS ON";
      $("#gpsStatus").className = "pill";
      if (state.map && state.userMarker)
        state.userMarker.setLatLng([state.you.lat, state.you.lon]);
    });
}
function distText(v) {
  if (!state.you.ok) return "? km";
  const d =
    Math.sqrt(
      Math.pow(v.lat - state.you.lat, 2) + Math.pow(v.lon - state.you.lon, 2)
    ) * 111;
  return d.toFixed(1) + " km";
}
function renderProfile() {
  if (state.user) {
    $("#pName").textContent = state.user.name;
    $("#pEmail").textContent = state.user.email;
    $("#wallet").textContent = rupiah(state.user.wallet);
  }
}
function openModal(id) {
  $("#" + id).classList.remove("hidden");
}
function closeModal(id) {
  $("#" + id).classList.add("hidden");
}
$$("[data-close]").forEach((el) =>
  el.addEventListener("click", () => closeModal(el.dataset.close))
);
window.go = (n) => {
  Object.values(screens).forEach((e) => e.classList.add("hidden"));
  screens[n].classList.remove("hidden");
  if (n === "Messages" && window.innerWidth < 768)
    $("#mainHeader").classList.add("hidden");
  else $("#mainHeader").classList.remove("hidden");
  $$(".nav").forEach((b) => b.classList.toggle("active", b.dataset.go === n));
  if (n === "Map") initMap();
  if (n === "Messages") renderChat();
};
$$(".nav").forEach((b) =>
  b.addEventListener("click", () => window.go(b.dataset.go))
);

initAuth();
