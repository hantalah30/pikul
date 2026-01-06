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
  autoReplies: [],
  selectedVendorId: null,
  chatWithVendorId: null,
  activeCategory: "Semua",
  firstLoad: true,
  unsubChats: null,
  activeOrderTab: "active",
};

// --- BOOT ---
async function bootApp() {
  $("#userName").textContent = state.user.name;
  initTheme();

  onSnapshot(collection(db, "vendors"), (s) => {
    state.vendors = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!state.vendors.length) seedVendors();
    else {
      renderHome();
      renderMap();
    }
  });

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

  onSnapshot(
    collection(db, "auto_replies"),
    (s) => (state.autoReplies = s.docs.map((d) => d.data().text))
  );
  renderProfile();
  window.go("Home");
  startGPS();
  updateFab(); // Cek keranjang awal
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
      <div class="vMeta"><b>${v.name}</b><div class="muted">⭐ ${
          v.rating ? v.rating.toFixed(1) : "New"
        } • ${
          v.busy
        }</div><div class="chips"><span class="chip">${v.type.toUpperCase()}</span><span class="chip">📍 ${distText(
          v
        )}</span></div></div>
      <b style="color:var(--orange)">Lihat</b>
    </div>
  `
      )
      .join("") || `<div class="card muted">Tidak ada pedagang.</div>`;
}
$("#search").addEventListener("input", renderVendors);

// --- MAP ---
function renderMap() {
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
}

// --- CART LOGIC (NEW & IMPROVED) ---

// 1. Add to Cart (From Menu)
window.addToCart = (vid, type, mid) => {
  const it = MENU[type].find((x) => x.id === mid);
  const ex = state.cart.find((x) => x.itemId === mid && x.vendorId === vid);

  if (ex) {
    ex.qty++;
  } else {
    // Jika menambah dari vendor berbeda, kita bisa reset atau append. Di sini kita append saja.
    state.cart.push({ ...it, vendorId: vid, itemId: mid, qty: 1 });
  }

  updateFab();
  showToast("Ditambahkan ke keranjang");
};

// 2. Update FAB & Badge
function updateFab() {
  const totalItems = state.cart.reduce((a, b) => a + b.qty, 0);
  $("#cartBadge").textContent = totalItems;
  if (totalItems > 0) $("#fabCart").classList.remove("hidden");
  else $("#fabCart").classList.add("hidden");
}

// 3. Open Global Cart (From FAB)
window.openGlobalCart = () => {
  if (!state.cart.length) return showToast("Keranjang kosong");
  renderCartModal();
  openModal("checkoutModal");
};

// 4. Render Cart Items with Edit Controls
function renderCartModal() {
  $("#checkoutItems").innerHTML = state.cart
    .map(
      (i, idx) => `
    <div class="cart-item-row">
      <div style="flex:1">
        <div style="font-weight:bold; font-size:14px">${i.name}</div>
        <div class="muted" style="font-size:12px">${rupiah(i.price)}</div>
      </div>
      <div class="cart-controls">
        <button class="ctrl-btn" onclick="updateCartQty(${idx}, -1)">-</button>
        <span class="ctrl-qty">${i.qty}</span>
        <button class="ctrl-btn add" onclick="updateCartQty(${idx}, 1)">+</button>
      </div>
      <button class="iconBtn" style="width:30px; height:30px; margin-left:10px; border-color:#fee; color:red; background:#fff5f5" onclick="deleteCartItem(${idx})">🗑</button>
    </div>
  `
    )
    .join("");

  const total = state.cart.reduce((a, b) => a + b.price * b.qty, 0);
  $("#checkoutTotal").textContent = rupiah(total);
}

// 5. Update Qty (+ / -)
window.updateCartQty = (idx, change) => {
  const item = state.cart[idx];
  item.qty += change;
  if (item.qty <= 0) {
    if (confirm("Hapus item ini?")) state.cart.splice(idx, 1);
    else item.qty = 1; // Revert if cancel
  }
  updateFab();
  if (state.cart.length === 0) closeModal("checkoutModal");
  else renderCartModal();
};

// 6. Delete Item
window.deleteCartItem = (idx) => {
  if (confirm("Hapus item ini dari keranjang?")) {
    state.cart.splice(idx, 1);
    updateFab();
    if (state.cart.length === 0) closeModal("checkoutModal");
    else renderCartModal();
  }
};

// 7. Place Order
$("#placeOrderBtn").addEventListener("click", async () => {
  if (!state.cart.length) return;
  const btn = $("#placeOrderBtn");
  btn.disabled = true;
  btn.textContent = "Memproses...";

  try {
    const total = state.cart.reduce((a, b) => a + b.price * b.qty, 0);
    // Ambil vendor dari item pertama (asumsi order per vendor, atau mixed)
    // Jika mixed vendor, ini akan mengambil vendor item pertama sebagai 'main vendor'
    const v = state.vendors.find((x) => x.id === state.cart[0].vendorId) || {
      id: "mixed",
      name: "Multiple Vendors",
    };

    await addDoc(collection(db, "orders"), {
      userId: state.user.id,
      userName: state.user.name,
      vendorId: v.id,
      vendorName: v.name,
      items: state.cart, // Simpan semua item
      total: total,
      note: $("#orderNote").value,
      status: "Diproses",
      createdAt: new Date().toISOString(),
    });

    state.cart = [];
    updateFab();
    closeModal("checkoutModal");
    window.go("Orders");
    showToast("Pesanan berhasil dibuat!");
  } catch (e) {
    alert("Gagal order: " + e.message);
  }
  btn.disabled = false;
  btn.textContent = "Pesan Sekarang";
});

// --- ORDERS & ACTIONS ---
window.switchOrderTab = (tabName) => {
  state.activeOrderTab = tabName;
  $$(".segment-btn").forEach((b) => b.classList.remove("active"));
  if (tabName === "active") $$(".segment-btn")[0].classList.add("active");
  else $$(".segment-btn")[1].classList.add("active");
  renderOrders();
};

function renderOrders() {
  const list = $("#ordersList");
  const filtered = state.orders.filter((o) => {
    if (state.activeOrderTab === "active") return o.status !== "Selesai";
    return o.status === "Selesai";
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">${
      state.activeOrderTab === "active" ? "🥘" : "🧾"
    }</span><p>Tidak ada pesanan.</p><button class="btn small primary" onclick="go('Home')">Mulai Jajan</button></div>`;
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
        statusDesc = "Menunggu konfirmasi...",
        actionButtons = "";

      if (o.status === "Diproses") {
        statusBadge = "blue";
        statusIcon = "👨‍🍳";
        statusDesc = "Sedang dimasak...";
      } else if (o.status === "Dalam perjalanan") {
        statusBadge = "orange";
        statusIcon = "🛵";
        statusDesc = "Driver menuju lokasi!";
        actionButtons = `<button class="btn small ghost" onclick="trackOrder('${o.vendorId}')" style="flex:1; border-color:var(--orange); color:var(--orange);">🗺️ Lacak Driver</button>`;
      } else if (o.status === "Selesai") {
        statusBadge = "green";
        statusIcon = "✅";
        statusDesc = "Selesai.";
        const rateBtn = !o.rating
          ? `<button class="btn small primary" onclick="rate('${o.id}','${o.vendorId}')" style="flex:1">⭐ Nilai</button>`
          : `<div class="pill" style="flex:1; text-align:center">Rating: ${o.rating}⭐</div>`;
        actionButtons = `${rateBtn}<button class="btn small ghost" onclick="reorder('${o.id}')" style="flex:1">🔄 Pesan Lagi</button>`;
      }

      return `
      <div class="order-card">
        <div class="oc-header"><div><b style="font-size:15px">${
          o.vendorName
        }</b><div class="muted" style="font-size:11px">${date}</div></div><span class="badge ${statusBadge}">${
        o.status
      }</span></div>
        <div class="oc-body"><div style="font-size:13px; margin-bottom:12px">${items}</div>
          ${
            state.activeOrderTab === "active"
              ? `<div class="step-compact"><div class="step-icon">${statusIcon}</div><div><b style="font-size:13px; display:block">${o.status}</b><span class="muted" style="font-size:11px">${statusDesc}</span></div></div>`
              : `<div class="rowBetween"><span class="muted" style="font-size:12px">Total Bayar</span><b style="font-size:16px">${rupiah(
                  o.total
                )}</b></div>`
          }
        </div>
        ${actionButtons ? `<div class="oc-footer">${actionButtons}</div>` : ""}
      </div>`;
    })
    .join("");
}

window.trackOrder = (vid) => {
  window.go("Map");
  setTimeout(() => window.openVendor(vid), 500);
  showToast("Melacak posisi driver...");
};
window.reorder = (orderId) => {
  const old = state.orders.find((x) => x.id === orderId);
  if (!old) return;
  state.cart = [];
  old.items.forEach((i) => state.cart.push({ ...i }));
  updateFab();
  showToast("Menu ditambahkan!");
  window.openGlobalCart();
};
window.rate = async (oid, vid) => {
  const s = prompt("Beri bintang (1-5):");
  if (!s) return;
  await updateDoc(doc(db, "orders", oid), { rating: parseInt(s) });
  showToast("Terima kasih!");
};

// --- CHAT ---
$("#chatVendorBtn").addEventListener("click", () => {
  if (state.selectedVendorId) {
    state.chatWithVendorId = state.selectedVendorId;
    closeModal("vendorModal");
    window.go("Messages");
  } else {
    showToast("Gagal memuat ID Pedagang");
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
      "<div class='muted' style='text-align:center; padding:20px'>Belum ada chat dipilih.</div>";
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
        const time = new Date(m.ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<div class="bubble ${isMe ? "me" : ""}">${
          m.text
        }<div class="msg-meta">${time} ${isMe ? "✓✓" : ""}</div></div>`;
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
  await addDoc(collection(db, "chats", cid, "messages"), {
    text: t,
    from: state.user.id,
    ts: Date.now(),
  });
  $("#chatInput").value = "";
  setTimeout(async () => {
    const r = state.autoReplies.length
      ? state.autoReplies[Math.floor(Math.random() * state.autoReplies.length)]
      : "Halo!";
    await addDoc(collection(db, "chats", cid, "messages"), {
      text: r,
      from: vid,
      ts: Date.now(),
    });
  }, 1500);
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
window.openVendor = (id) => {
  state.selectedVendorId = id;
  const v = state.vendors.find((x) => x.id === id);
  if (!v) return;
  $("#vTitle").textContent = v.name;
  $("#vMeta").textContent = v.type;
  $("#menuList").innerHTML = (MENU[v.type] || [])
    .map(
      (m) =>
        `<div class="listItem" onclick="addToCart('${id}','${v.type}','${
          m.id
        }')"><div><b>${m.name}</b><br><small>${rupiah(
          m.price
        )}</small></div><b style="color:var(--orange)">+</b></div>`
    )
    .join("");
  openModal("vendorModal");
};
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
if ($("#desktopLogout"))
  $("#desktopLogout").addEventListener("click", () => {
    if (confirm("Keluar?")) {
      localStorage.removeItem("pikul_email");
      location.reload();
    }
  });
if ($("#desktopLogout")) $("#desktopLogout").style.display = "flex";
function startGPS() {
  if (navigator.geolocation)
    navigator.geolocation.watchPosition((p) => {
      state.you = { ok: true, lat: p.coords.latitude, lon: p.coords.longitude };
      $("#gpsStatus").textContent = "GPS ON";
      $("#gpsStatus").className = "pill";
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
function seedVendors() {
  [
    [-0.002, 0.001, "Bakso Ujang", "bakso", "🍲"],
    [0.003, -0.001, "Kopi Dinda", "kopi", "☕"],
    [0.001, 0.002, "Nasi Goreng", "nasi", "🍳"],
  ].forEach(
    async (d) =>
      await addDoc(collection(db, "vendors"), {
        lat: -6.2 + d[0],
        lon: 106.81 + d[1],
        name: d[2],
        type: d[3],
        ico: d[4],
        rating: 4.5,
        busy: "Sepi",
      })
  );
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
  if (n === "Map") renderMap();
  if (n === "Messages") renderChat();
};
$$(".nav").forEach((b) =>
  b.addEventListener("click", () => window.go(b.dataset.go))
);

initAuth();
