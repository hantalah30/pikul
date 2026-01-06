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
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// --- INIT FIREBASE ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper
const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
function rupiah(n) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

const screens = {
  Home: $("#screenHome"),
  Map: $("#screenMap"),
  Orders: $("#screenOrders"),
  Messages: $("#screenMessages"),
  Profile: $("#screenProfile"),
};

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
  you: { ok: false, lat: null, lon: null },
  vendors: [],
  cart: [],
  orders: [],
  autoReplies: [], // Menyimpan daftar balasan dari DB
  selectedVendorId: null,
  chatWithVendorId: null,
  unsubOrders: null,
  unsubChats: null,
};

// --- AUTH ---
function showAuth() {
  $("#auth").classList.remove("hidden");
  $("#app").classList.add("hidden");
}
function showApp() {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
}

async function initAuth() {
  const savedEmail = localStorage.getItem("pikul_email");
  if (savedEmail) {
    await loginUser(savedEmail);
  } else {
    showAuth();
  }
}

async function loginUser(email) {
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const d = snap.docs[0];
      state.user = { id: d.id, ...d.data() };
    } else {
      const name = email.split("@")[0];
      const newUser = {
        email,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        wallet: 0,
        createdAt: new Date().toISOString(),
      };
      const ref = await addDoc(collection(db, "users"), newUser);
      state.user = { id: ref.id, ...newUser };
    }

    localStorage.setItem("pikul_email", email);
    showApp();
    bootApp();
  } catch (e) {
    alert("Gagal login: " + e.message);
    console.error(e);
  }
}

$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("#email").value.trim();
  if (!email.includes("@")) return alert("Email valid diperlukan");
  loginUser(email);
});

$("#logoutBtn").addEventListener("click", () => {
  if (confirm("Keluar?")) {
    localStorage.removeItem("pikul_email");
    location.reload();
  }
});

// --- BOOT ---
async function bootApp() {
  $("#userName").textContent = state.user.name;

  // Listen Vendors
  onSnapshot(collection(db, "vendors"), (snap) => {
    state.vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (state.vendors.length === 0) seedVendors();
    else {
      renderHome();
      if (!screens.Map.classList.contains("hidden")) renderMap();
    }
  });

  // Listen Orders
  if (state.unsubOrders) state.unsubOrders();
  const qOrd = query(
    collection(db, "orders"),
    where("userId", "==", state.user.id)
  );
  state.unsubOrders = onSnapshot(qOrd, (snap) => {
    let rawOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.orders = rawOrders.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    renderOrders();
  });

  // Listen Auto Replies (BARU: Ambil database balasan)
  onSnapshot(collection(db, "auto_replies"), (snap) => {
    state.autoReplies = snap.docs.map((d) => d.data().text); // Ambil teksnya saja
  });

  renderProfile();
  go("Home");
  startGPS();
}

// --- GPS ---
function startGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      state.you = {
        ok: true,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };
      $("#gpsStatus").textContent = "GPS Aktif";
      $("#gpsStatus").classList.remove("warn");
      $("#youCoord").textContent = `${state.you.lat.toFixed(
        4
      )}, ${state.you.lon.toFixed(4)}`;
      renderVendorCards();
      if (!screens.Map.classList.contains("hidden")) renderMap();
    },
    (err) => console.log(err)
  );
}

// --- VENDORS ---
async function seedVendors() {
  const baseLat = -6.2;
  const baseLon = 106.816666;
  const dummies = [
    {
      name: "Bakso Mang Ujang",
      type: "bakso",
      ico: "🍲",
      rating: 4.7,
      busy: "Sedang",
      lat: baseLat - 0.002,
      lon: baseLon + 0.001,
    },
    {
      name: "Kopi Dinda",
      type: "kopi",
      ico: "☕",
      rating: 4.8,
      busy: "Ramai",
      lat: baseLat + 0.003,
      lon: baseLon - 0.001,
    },
    {
      name: "Nasi Goreng Pak De",
      type: "nasi",
      ico: "🍳",
      rating: 4.6,
      busy: "Lengang",
      lat: baseLat + 0.001,
      lon: baseLon + 0.002,
    },
  ];
  for (let v of dummies) await addDoc(collection(db, "vendors"), v);
}

function distKm(v) {
  if (!state.you.ok) return null;
  const R = 6371;
  const dLat = ((v.lat - state.you.lat) * Math.PI) / 180;
  const dLon = ((v.lon - state.you.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((state.you.lat * Math.PI) / 180) *
      Math.cos((v.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function distText(v) {
  const d = distKm(v);
  if (d === null) return "GPS?";
  return d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(2) + " km";
}

// --- RENDER HOME ---
function renderHome() {
  renderVendorCards();
  renderCart();
}

function renderVendorCards() {
  const q = ($("#search").value || "").toLowerCase();
  const list = state.vendors.filter((v) => v.name.toLowerCase().includes(q));

  $("#vendorList").innerHTML =
    list
      .map(
        (v) => `
    <div class="vendorCard" data-id="${v.id}">
      <div class="vIco">${v.ico}</div>
      <div class="vMeta">
        <b>${v.name}</b>
        <div class="muted">⭐ ${v.rating} • ${v.busy}</div>
        <div class="chips">
          <span class="chip">${v.type.toUpperCase()}</span>
          <span class="chip">📍 ${distText(v)}</span>
        </div>
      </div>
      <div class="price">Lihat</div>
    </div>
  `
      )
      .join("") || `<div class="card muted">Tidak ada pedagang.</div>`;

  $$(".vendorCard").forEach((el) =>
    el.addEventListener("click", () => openVendor(el.dataset.id))
  );
}

$("#search").addEventListener("input", renderVendorCards);

// --- MODALS ---
function openModal(id) {
  $("#" + id).classList.remove("hidden");
}
function closeModal(id) {
  $("#" + id).classList.add("hidden");
}
$$("[data-close]").forEach((el) =>
  el.addEventListener("click", () => closeModal(el.dataset.close))
);

function openVendor(id) {
  state.selectedVendorId = id;
  const v = state.vendors.find((x) => x.id === id);
  if (!v) return;

  $("#vTitle").textContent = v.name;
  $("#vMeta").textContent = `📍 ${distText(v)} • ${v.type}`;

  const menu = MENU[v.type] || [];
  $("#menuList").innerHTML = menu
    .map(
      (m) => `
    <div class="listItem" data-mid="${m.id}">
      <div><b>${m.name}</b><div class="muted">${rupiah(m.price)}</div></div>
      <div class="price">Tambah</div>
    </div>
  `
    )
    .join("");

  $$("#menuList .listItem").forEach((el) =>
    el.addEventListener("click", () => addToCart(id, v.type, el.dataset.mid))
  );
  openModal("vendorModal");
}

function addToCart(vId, type, mId) {
  const item = MENU[type].find((x) => x.id === mId);
  const ex = state.cart.find((x) => x.vendorId === vId && x.itemId === mId);
  if (ex) ex.qty++;
  else
    state.cart.push({
      vendorId: vId,
      itemId: mId,
      name: item.name,
      price: item.price,
      qty: 1,
    });
  renderCart();
}

// --- CART ---
function renderCart() {
  const count = state.cart.reduce((a, c) => a + c.qty, 0);
  $("#cartBadge").textContent = count + " item";

  if (!state.cart.length)
    return ($(
      "#cartBox"
    ).innerHTML = `<div class="muted">Keranjang kosong.</div>`);

  const total = state.cart.reduce((a, c) => a + c.price * c.qty, 0);
  $("#cartBox").innerHTML = `
    ${state.cart
      .map(
        (it, idx) => `
      <div class="rowBetween" style="border-bottom:1px dashed #eee; padding:5px 0">
        <div><b>${it.name}</b> <small>x${it.qty}</small></div>
        <div style="display:flex; gap:5px">
          <button class="iconBtn" style="width:24px;height:24px" data-dec="${idx}">-</button>
          <button class="iconBtn" style="width:24px;height:24px" data-inc="${idx}">+</button>
        </div>
      </div>
    `
      )
      .join("")}
    <div class="rowBetween" style="margin-top:10px">
      <b>Total ${rupiah(total)}</b>
      <button id="checkoutBtn" class="btn primary small">Checkout</button>
    </div>
  `;

  $$("[data-inc]").forEach((b) =>
    b.addEventListener("click", () => {
      state.cart[b.dataset.inc].qty++;
      renderCart();
    })
  );
  $$("[data-dec]").forEach((b) =>
    b.addEventListener("click", () => {
      state.cart[b.dataset.dec].qty--;
      if (state.cart[b.dataset.dec].qty <= 0)
        state.cart.splice(b.dataset.dec, 1);
      renderCart();
    })
  );
  $("#checkoutBtn").addEventListener("click", openCheckout);
}

function openCheckout() {
  if (!state.cart.length) return;
  const total = state.cart.reduce((a, c) => a + c.price * c.qty, 0);
  $("#checkoutItems").innerHTML = state.cart
    .map(
      (i) =>
        `<div class="rowBetween"><span>${i.name} x${i.qty}</span> <b>${rupiah(
          i.price * i.qty
        )}</b></div>`
    )
    .join("");
  $("#checkoutTotal").textContent = rupiah(total);
  openModal("checkoutModal");
}

$("#placeOrderBtn").addEventListener("click", async () => {
  const btn = $("#placeOrderBtn");
  btn.textContent = "Loading...";
  btn.disabled = true;

  try {
    const v = state.vendors.find((x) => x.id === state.cart[0].vendorId);
    const orderData = {
      userId: state.user.id,
      userName: state.user.name,
      vendorId: v?.id || "unknown",
      vendorName: v?.name || "Unknown",
      items: state.cart,
      total: state.cart.reduce((a, c) => a + c.price * c.qty, 0),
      note: $("#orderNote").value,
      method: $("#payMethod").value,
      status: "Diproses",
      createdAt: new Date().toISOString(),
    };

    await addDoc(collection(db, "orders"), orderData);

    state.cart = [];
    $("#orderNote").value = "";
    closeModal("checkoutModal");
    closeModal("vendorModal");
    renderCart();
    go("Orders");
    alert("Pesanan masuk ke Database!");
  } catch (e) {
    alert("Gagal order: " + e.message);
  }
  btn.textContent = "Buat Pesanan";
  btn.disabled = false;
});

// --- ORDERS LIST ---
function renderOrders() {
  const list = $("#ordersList");
  if (!state.orders.length)
    return (list.innerHTML = `<div class="card muted">Belum ada pesanan.</div>`);

  list.innerHTML = state.orders
    .map((o) => {
      const items = o.items || [];
      const itemSummary = items.map((i) => `${i.qty}x ${i.name}`).join(", ");

      return `
      <div class="listItem" style="display:block;">
        <div class="rowBetween">
          <b>${o.vendorName}</b>
          <div class="price">${rupiah(o.total)}</div>
        </div>
        <div class="muted" style="margin-top:4px; font-size:13px; color:#444;">
          ${itemSummary || "-"}
        </div>
        <div class="rowBetween" style="margin-top:8px;">
          <div class="muted" style="font-size:12px;">${new Date(
            o.createdAt
          ).toLocaleString()}</div>
          <div class="pill ${o.status === "Selesai" ? "warn" : ""}">${
        o.status
      }</div>
        </div>
      </div>
    `;
    })
    .join("");
}

// --- CHAT ---
$("#chatVendorBtn").addEventListener("click", () => {
  if (!state.selectedVendorId) return;
  state.chatWithVendorId = state.selectedVendorId;
  closeModal("vendorModal");
  go("Messages");
});

function getChatId() {
  return `${state.user.id}_${state.chatWithVendorId}`;
}

async function renderChat() {
  const vId = state.chatWithVendorId;
  const v = state.vendors.find((x) => x.id === vId);
  $("#chatWith").textContent = v ? v.name : "Pilih Pedagang";
  $("#chatBox").innerHTML = "";

  if (!vId) return;

  if (state.unsubChats) state.unsubChats();

  const chatId = getChatId();
  const msgsRef = collection(db, "chats", chatId, "messages");
  const q = query(msgsRef, orderBy("ts", "asc"));

  state.unsubChats = onSnapshot(q, (snap) => {
    const html = snap.docs
      .map((d) => {
        const m = d.data();
        return `<div class="bubble ${m.from == state.user.id ? "me" : ""}">${
          m.text
        }</div>`;
      })
      .join("");
    $("#chatBox").innerHTML = html;
    $("#chatBox").scrollTop = $("#chatBox").scrollHeight;
  });
}

// KIRIM PESAN + DYNAMIC AUTO REPLY
$("#sendChatBtn").addEventListener("click", async () => {
  const txt = $("#chatInput").value.trim();
  if (!txt || !state.chatWithVendorId) return;

  const chatId = getChatId();
  const currentVendorId = state.chatWithVendorId;

  // 1. Pesan User
  await addDoc(collection(db, "chats", chatId, "messages"), {
    text: txt,
    from: state.user.id,
    ts: Date.now(),
  });
  $("#chatInput").value = "";

  // 2. Auto Reply Bot
  setTimeout(async () => {
    // Ambil jawaban acak dari state.autoReplies yang sudah disync dengan DB
    let replyText = "Halo kak! (Default)";

    if (state.autoReplies.length > 0) {
      replyText =
        state.autoReplies[Math.floor(Math.random() * state.autoReplies.length)];
    } else {
      replyText =
        "Halo, pesan diterima. (Belum ada auto-reply diset oleh admin)";
    }

    await addDoc(collection(db, "chats", chatId, "messages"), {
      text: replyText,
      from: currentVendorId,
      ts: Date.now(),
    });
  }, 1500);
});

$("#pickChatBtn").addEventListener("click", () => {
  $("#pickChatList").innerHTML = state.vendors
    .map(
      (v) => `
    <div class="listItem" onclick="selectChat('${v.id}')">
      <b>${v.name}</b> <span class="price">Chat</span>
    </div>
  `
    )
    .join("");
  openModal("pickChatModal");
});

window.selectChat = (vid) => {
  state.chatWithVendorId = vid;
  closeModal("pickChatModal");
  renderChat();
};

// --- MAP & PROFILE ---
function renderMap() {
  const pins = $("#pins");
  pins.innerHTML = "";
  state.vendors.forEach((v) => {
    const el = document.createElement("div");
    el.className = "pin";
    const dx = (v.lon - 106.816666) * 8000;
    const dy = (v.lat - -6.2) * -8000;
    el.style.left = 150 + dx + "px";
    el.style.top = 130 + dy + "px";
    el.textContent = v.ico;
    pins.appendChild(el);
  });

  $("#realtimeList").innerHTML = state.vendors
    .map(
      (v) => `
    <div class="listItem">
      <div><b>${v.name}</b> <small>(${v.lat.toFixed(4)}, ${v.lon.toFixed(
        4
      )})</small></div>
    </div>
  `
    )
    .join("");
}

function renderProfile() {
  if (state.user) {
    $("#pName").textContent = state.user.name;
    $("#pEmail").textContent = state.user.email;
    $("#wallet").textContent = rupiah(state.user.wallet);
  }
}

$("#topupBtn").addEventListener("click", async () => {
  const newBal = (state.user.wallet || 0) + 50000;
  await updateDoc(doc(db, "users", state.user.id), { wallet: newBal });
  state.user.wallet = newBal;
  renderProfile();
  alert("Topup berhasil (DB Updated)");
});

// --- NAVIGATION ---
$$(".nav").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
function go(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  $$(".nav").forEach((b) =>
    b.classList.toggle("active", b.dataset.go === name)
  );

  if (name === "Map") renderMap();
  if (name === "Messages") renderChat();
}

initAuth();
