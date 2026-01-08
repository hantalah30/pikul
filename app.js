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
let state = {
  user: null,
  you: { ok: false, lat: -6.2, lon: 106.816666 },
  vendors: [],
  cart: [],
  orders: [],
  banners: [],
  selectedVendorId: null,
  chatWithVendorId: null,
  activeMapVendorId: null,
  activeCategory: "Semua",
  mapCategory: "Semua",
  firstLoad: true,
  unsubChats: null,
  activeOrderTab: "active",
  map: null,
  markers: {},
  userMarker: null,
  routeLine: null,
  trackingVendorId: null,
};

// --- AUTH LOGIC ---
window.switchAuthMode = (mode) => {
  const tabs = $$(".auth-tab");
  const forms = $$(".auth-form");
  if (mode === "login") {
    tabs[0].classList.add("active");
    tabs[1].classList.remove("active");
    forms[0].classList.remove("hidden");
    forms[1].classList.add("hidden");
  } else {
    tabs[1].classList.add("active");
    tabs[0].classList.remove("active");
    forms[1].classList.remove("hidden");
    forms[0].classList.add("hidden");
  }
};
window.requireLogin = () => {
  showToast("Silakan login terlebih dahulu.");
  showAuth();
};
window.closeAuth = () => {
  showApp();
};

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim(),
    pass = $("#loginPass").value,
    btn = e.target.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const s = await getDocs(q);
    if (s.empty) {
      alert("Email tidak ditemukan.");
      btn.disabled = false;
      btn.textContent = "Masuk";
      return;
    }
    const uData = s.docs[0].data();
    if (uData.password && uData.password !== pass) {
      alert("Password salah!");
      btn.disabled = false;
      btn.textContent = "Masuk";
      return;
    }
    state.user = { id: s.docs[0].id, ...uData };
    localStorage.setItem("pikul_user_id", state.user.id);
    showApp();
    bootApp();
  } catch (err) {
    alert("Error: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Masuk";
});
$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#regName").value.trim(),
    email = $("#regEmail").value.trim(),
    pass = $("#regPass").value,
    btn = e.target.querySelector("button");
  if (pass.length < 6) return alert("Password min 6 karakter");
  btn.disabled = true;
  btn.textContent = "Mendaftar...";
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const s = await getDocs(q);
    if (!s.empty) {
      alert("Email sudah terdaftar.");
      btn.disabled = false;
      btn.textContent = "Daftar";
      return;
    }
    const newUser = {
      name,
      email,
      password: pass,
      wallet: 0,
      createdAt: Date.now(),
    };
    const ref = await addDoc(collection(db, "users"), newUser);
    state.user = { id: ref.id, ...newUser };
    localStorage.setItem("pikul_user_id", ref.id);
    showApp();
    bootApp();
  } catch (err) {
    alert("Gagal daftar: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Daftar";
});
async function initAuth() {
  const uid = localStorage.getItem("pikul_user_id");
  if (uid) {
    try {
      const { getDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) state.user = { id: snap.id, ...snap.data() };
      else localStorage.removeItem("pikul_user_id");
    } catch (e) {
      state.user = null;
    }
  }
  showApp();
  bootApp();
}

// --- BOOT ---
async function bootApp() {
  $("#userName").textContent = state.user ? state.user.name : "Tamu";
  initTheme();

  onSnapshot(collection(db, "vendors"), (s) => {
    state.vendors = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!$("#screenHome").classList.contains("hidden")) renderVendors();
    if (!$("#screenMap").classList.contains("hidden") || state.trackingVendorId)
      updateMapMarkers();
  });

  onSnapshot(collection(db, "banners"), (s) => {
    state.banners = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!$("#screenHome").classList.contains("hidden")) renderHome();
  });

  if (state.user) {
    onSnapshot(
      query(collection(db, "orders"), where("userId", "==", state.user.id)),
      (s) => {
        let raw = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        state.orders = raw.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        state.firstLoad = false;
        renderOrders();
      }
    );
  } else {
    state.orders = [];
    renderOrders();
  }
  renderProfile();
  window.go("Home");
  startGPS();
  updateFab();
}

// --- HOME & VENDOR ---
let bannerInterval;
function renderHome() {
  let promoData =
    state.banners.length > 0
      ? state.banners
      : [
          {
            t: "Diskon 50%",
            d: "Pengguna Baru",
            c: "linear-gradient(135deg, #ff7a00, #ff4d00)",
            vid: null,
          },
        ];
  $("#promoList").innerHTML = promoData
    .map(
      (p) =>
        `<div class="promo-card" style="background: ${p.c};" onclick="${
          p.vid ? `openVendor('${p.vid}')` : ""
        }"><div class="promo-decor decor-1"></div><div class="promo-decor decor-2"></div><div class="promo-content">${
          p.vName
            ? `<div class="promo-tag">Promosi: ${p.vName}</div>`
            : `<div class="promo-tag">Info Promo</div>`
        }<h3 class="promo-title">${p.t}</h3><p class="promo-desc">${
          p.d
        }</p></div></div>`
    )
    .join("");
  $("#promoDots").innerHTML = promoData
    .map(
      (_, i) =>
        `<div class="dot ${i === 0 ? "active" : ""}" id="dot-${i}"></div>`
    )
    .join("");
  setupBannerScroll(promoData.length);
}
function setupBannerScroll(count) {
  const slider = $("#promoList");
  if (bannerInterval) clearInterval(bannerInterval);
  slider.addEventListener("scroll", () => {
    const activeIndex = Math.round(
      slider.scrollLeft / (slider.offsetWidth * 0.9)
    );
    for (let i = 0; i < count; i++) {
      const dot = $(`#dot-${i}`);
      if (dot)
        i === activeIndex
          ? dot.classList.add("active")
          : dot.classList.remove("active");
    }
  });
}
window.setCategory = (c) => {
  state.activeCategory = c;
  renderVendors();
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
        (v) =>
          `<div class="vendorCard" onclick="openVendor('${
            v.id
          }')"><div class="vIco">${v.ico}</div><div class="vMeta"><b>${
            v.name
          }</b><div class="muted">⭐ ${
            v.rating ? v.rating.toFixed(1) : "New"
          } • ${
            v.busy
          }</div><div class="chips"><span class="chip">${v.type.toUpperCase()}</span><span class="chip">📍 ${distText(
            v
          )}</span></div></div><b style="color:var(--orange)">Lihat</b></div>`
      )
      .join("") || `<div class="card muted">Tidak ada pedagang aktif.</div>`;
}
$("#search").addEventListener("input", renderVendors);

// --- MAP ---
function initMap() {
  if (state.map) return;
  if (!$("#map")) return;
  state.map = L.map("map", { zoomControl: false }).setView(
    [state.you.lat, state.you.lon],
    15
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OSM",
  }).addTo(state.map);
  const userIcon = L.divIcon({ className: "user-pulse", iconSize: [20, 20] });
  state.userMarker = L.marker([state.you.lat, state.you.lon], {
    icon: userIcon,
  }).addTo(state.map);
  L.circle([state.you.lat, state.you.lon], {
    color: "#3b82f6",
    fillColor: "#3b82f6",
    fillOpacity: 0.1,
    radius: 300,
    weight: 1,
  }).addTo(state.map);
  updateMapMarkers();
}
window.filterMap = (cat, el) => {
  state.mapCategory = cat;
  $$(".map-chip").forEach((c) => c.classList.remove("active"));
  el.classList.add("active");
  updateMapMarkers();
  closeMapCard();
};
function updateMapMarkers() {
  if (!state.map) return;
  const cat = state.mapCategory.toLowerCase();
  const filtered = state.vendors.filter(
    (v) => cat === "semua" || v.type.includes(cat)
  );
  $("#realtimeList").innerHTML = filtered
    .map(
      (v) =>
        `<div class="listItem" onclick="openVendor('${
          v.id
        }')" style="cursor:pointer"><div class="rowBetween"><div><b>${v.ico} ${
          v.name
        }</b><div class="muted" style="font-size:12px">(${v.lat.toFixed(
          4
        )}, ${v.lon.toFixed(
          4
        )})</div></div><div class="pill small">📍 ${distText(
          v
        )}</div></div></div>`
    )
    .join("");
  Object.keys(state.markers).forEach((id) => {
    const v = filtered.find((x) => x.id === id);
    if (!v) {
      state.map.removeLayer(state.markers[id]);
      delete state.markers[id];
    }
  });
  filtered.forEach((v) => {
    if (state.markers[v.id]) {
      state.markers[v.id].setLatLng([v.lat, v.lon]);
    } else {
      const html = `<div class="vendor-marker-custom" id="mark-${v.id}"><div class="vm-bubble">${v.ico}</div><div class="vm-arrow"></div></div>`;
      const icon = L.divIcon({
        className: "custom-div-icon",
        html: html,
        iconSize: [40, 50],
        iconAnchor: [20, 50],
      });
      const m = L.marker([v.lat, v.lon], { icon: icon }).addTo(state.map);
      m.on("click", () => selectVendorOnMap(v));
      state.markers[v.id] = m;
    }
  });
  if (state.activeMapVendorId) {
    const v = state.vendors.find((x) => x.id === state.activeMapVendorId);
    if (v) {
      $("#mvcDist").textContent = distText(v) + " dari Anda";
      if (state.routeLine && state.you.ok)
        state.routeLine.setLatLngs([
          [state.you.lat, state.you.lon],
          [v.lat, v.lon],
        ]);
    }
  }
  if (state.trackingVendorId) {
    const v = state.vendors.find((x) => x.id === state.trackingVendorId);
    if (v && state.markers[v.id]) {
      selectVendorOnMap(v);
      showToast(`Melacak ${v.name}...`);
    }
    state.trackingVendorId = null;
  }
}
function selectVendorOnMap(v) {
  state.activeMapVendorId = v.id;
  $$(".vm-bubble").forEach((b) => b.classList.remove("active"));
  const el = document.querySelector(`#mark-${v.id} .vm-bubble`);
  if (el) el.classList.add("active");
  $("#mvcIcon").textContent = v.ico;
  $("#mvcName").textContent = v.name;
  $("#mvcDist").textContent = distText(v) + " dari Anda";
  $("#mvcType").textContent = v.type.toUpperCase();
  $("#mvcBtn").onclick = () => openVendor(v.id);
  const card = $("#mapCard");
  card.classList.remove("hidden");
  void card.offsetWidth;
  card.classList.add("visible");
  if (state.routeLine) state.map.removeLayer(state.routeLine);
  if (state.you.ok) {
    state.routeLine = L.polyline(
      [
        [state.you.lat, state.you.lon],
        [v.lat, v.lon],
      ],
      {
        color: "#ff7a00",
        weight: 4,
        opacity: 0.7,
        dashArray: "10, 10",
        lineCap: "round",
      }
    ).addTo(state.map);
    state.map.fitBounds(state.routeLine.getBounds(), {
      padding: [50, 150],
      maxZoom: 16,
    });
  } else {
    state.map.setView([v.lat, v.lon], 16);
  }
}
window.closeMapCard = () => {
  state.activeMapVendorId = null;
  $("#mapCard").classList.remove("visible");
  if (state.routeLine) {
    state.map.removeLayer(state.routeLine);
    state.routeLine = null;
  }
  $$(".vm-bubble").forEach((b) => b.classList.remove("active"));
};
window.trackOrder = (vid) => {
  state.trackingVendorId = vid;
  state.mapCategory = "Semua";
  $$(".map-chip").forEach((c) => c.classList.remove("active"));
  if ($$(".map-chip")[0]) $$(".map-chip")[0].classList.add("active");
  window.go("Map");
};

// --- CHAT SYSTEM ---
window.toggleAttachMenu = () => {
  $("#attachMenu").classList.toggle("visible");
};
window.toggleSticker = () => {
  $("#attachMenu").classList.remove("visible");
  $("#stickerSheet").classList.toggle("visible");
  renderStickers("emoji");
};
window.triggerImage = () => {
  $("#attachMenu").classList.remove("visible");
  $("#imageInput").click();
};

window.handleImageUpload = (input) => {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      await sendMessage(e.target.result, "image");
      showToast("Foto terkirim!");
    };
    reader.readAsDataURL(input.files[0]);
  }
};

window.sendLocation = async () => {
  $("#attachMenu").classList.remove("visible");
  if (!state.you.ok) return showToast("GPS belum aktif");
  const mapsUrl = `https://www.google.com/maps?q=${state.you.lat},${state.you.lon}`;
  await sendMessage(mapsUrl, "location");
  showToast("Lokasi dikirim!");
};

window.renderStickers = (type) => {
  const grid = $("#stickerGrid");
  $$(".segment-btn").forEach((b) => b.classList.remove("active"));
  if (type === "emoji") {
    $$(".segment-btn")[0].classList.add("active");
    const emojis = [
      "😀",
      "😂",
      "😍",
      "😭",
      "😡",
      "👍",
      "👎",
      "🙏",
      "🔥",
      "❤️",
      "🎉",
      "👋",
      "🤔",
      "😴",
      "🤢",
      "🥳",
    ];
    grid.innerHTML = emojis
      .map(
        (e) =>
          `<div class="sticker-item" onclick="sendSticker('${e}', 'emoji')">${e}</div>`
      )
      .join("");
  } else {
    $$(".segment-btn")[1].classList.add("active");
    const stickers = [
      "🍔",
      "🍕",
      "🍜",
      "☕",
      "🛵",
      "✅",
      "❌",
      "⏳",
      "🏠",
      "💵",
      "😋",
      "🥡",
    ];
    grid.innerHTML = stickers
      .map(
        (s) =>
          `<div class="sticker-item" style="font-size:50px" onclick="sendSticker('${s}', 'sticker')">${s}</div>`
      )
      .join("");
  }
};
window.sendSticker = async (content, type) => {
  $("#stickerSheet").classList.remove("visible");
  await sendMessage(content, type === "emoji" ? "text" : "sticker");
};

async function sendMessage(content, type = "text") {
  if (!state.user) return requireLogin();
  if (!content || !state.chatWithVendorId) return;

  const cid = `${state.user.id}_${state.chatWithVendorId}`;
  const vid = state.chatWithVendorId;

  await addDoc(collection(db, "chats", cid, "messages"), {
    text: content,
    type: type,
    from: state.user.id,
    ts: Date.now(),
  });

  let preview =
    type === "text"
      ? content
      : type === "image"
      ? "📷 Foto"
      : type === "location"
      ? "📍 Lokasi"
      : "😊 Stiker";
  const v = state.vendors.find((x) => x.id === vid);
  await setDoc(
    doc(db, "chats", cid),
    {
      userId: state.user.id,
      userName: state.user.name,
      vendorId: vid,
      vendorName: v ? v.name : "Unknown",
      lastMessage: preview,
      lastUpdate: Date.now(),
    },
    { merge: true }
  );
}

$("#sendChatBtn").addEventListener("click", () => {
  const t = $("#chatInput").value.trim();
  if (t) {
    sendMessage(t, "text");
    $("#chatInput").value = "";
  }
});

async function renderChat() {
  const vid = state.chatWithVendorId;
  if (!vid) {
    $("#chatWith").textContent = "Pilih Pedagang";
    $("#chatBox").innerHTML =
      "<div class='muted' style='text-align:center; padding:20px'>Pilih pedagang dulu.</div>";
    return;
  }
  const v = state.vendors.find((x) => x.id === vid);
  $("#chatWith").textContent = v ? v.name : "Unknown";
  $("#chatBox").innerHTML = "";

  if (state.unsubChats) state.unsubChats();
  const q = query(
    collection(db, "chats", `${state.user.id}_${vid}`, "messages"),
    orderBy("ts", "asc")
  );

  state.unsubChats = onSnapshot(q, (s) => {
    $("#chatBox").innerHTML = s.docs
      .map((d) => {
        const m = d.data();
        const isMe = m.from === state.user.id;

        let contentHtml = "";
        if (m.type === "image") {
          contentHtml = `<div class="bubble image ${
            isMe ? "me" : "them"
          }"><img src="${m.text}" loading="lazy" /></div>`;
        } else if (m.type === "location") {
          contentHtml = `<a href="${
            m.text
          }" target="_blank" class="bubble location ${
            isMe ? "me" : "them"
          }" style="background:${isMe ? "#ff7a00" : "#fff"}; color:${
            isMe ? "white" : "black"
          }"><span>📍</span> <span>Lihat Lokasi</span></a>`;
        } else if (m.type === "sticker") {
          contentHtml = `<div class="bubble sticker ${isMe ? "me" : "them"}">${
            m.text
          }</div>`;
        } else {
          contentHtml = `<div class="bubble ${
            isMe ? "me" : "them"
          }" style="background:${isMe ? "#ff7a00" : "#f3f4f6"}; color:${
            isMe ? "white" : "black"
          }; padding:8px 12px; border-radius:12px;">${m.text}</div>`;
        }

        return `<div style="display:flex; justify-content:${
          isMe ? "flex-end" : "flex-start"
        }; margin-bottom:4px; max-width:85%; align-self:${
          isMe ? "flex-end" : "flex-start"
        }">${contentHtml}</div>`;
      })
      .join("");
    $("#chatBox").scrollTop = $("#chatBox").scrollHeight;
  });
}

window.openPickChat = () => {
  if (!state.user) return requireLogin();
  const list = state.vendors.length
    ? state.vendors
        .map(
          (v) =>
            `<div class="listItem" onclick="selectChat('${v.id}')" style="cursor:pointer"><div class="rowBetween"><div style="display:flex; align-items:center; gap:10px;"><div style="background:#f1f5f9; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:10px;">${v.ico}</div><b>${v.name}</b></div><button class="btn small ghost">Chat</button></div></div>`
        )
        .join("")
    : `<div class="empty-state-box">Belum ada pedagang aktif.</div>`;
  $("#pickChatList").innerHTML = list;
  openModal("pickChatModal");
};
$("#pickChatBtn").addEventListener("click", window.openPickChat);
window.selectChat = (id) => {
  state.chatWithVendorId = id;
  closeModal("pickChatModal");
  renderChat();
};

// --- MENU & CART ---
const MENU_DEFAULTS = {
  bakso: [{ id: "m1", name: "Bakso Urat", price: 15000 }],
  kopi: [{ id: "k1", name: "Kopi Susu", price: 12000 }],
  nasi: [{ id: "n1", name: "Nasi Goreng", price: 18000 }],
};
window.openVendor = (id) => {
  state.selectedVendorId = id;
  const v = state.vendors.find((x) => x.id === id);
  if (!v) return;
  $("#vTitle").textContent = v.name;
  $("#vMeta").textContent = v.type;
  let menuData =
    v.menu && v.menu.length > 0 ? v.menu : MENU_DEFAULTS[v.type] || [];
  $("#menuList").innerHTML = menuData
    .map(
      (m) =>
        `<div class="listItem"><div style="flex:1"><b>${
          m.name
        }</b><div class="muted">${rupiah(
          m.price
        )}</div></div><button class="btn small primary" onclick="addToCart('${id}', '${
          m.id
        }', '${m.name}', ${m.price})">+ Tambah</button></div>`
    )
    .join("");
  openModal("vendorModal");
};
window.addToCart = (vid, mid, mName, mPrice) => {
  if (!state.user) return requireLogin();
  const v = state.vendors.find((x) => x.id === vid);
  if (!mName) {
    const type = v ? v.type : "bakso";
    const item = MENU_DEFAULTS[type].find((x) => x.id === mid);
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
  t > 0
    ? $("#fabCart").classList.remove("hidden")
    : $("#fabCart").classList.add("hidden");
}
window.openGlobalCart = () => {
  if (!state.user) return requireLogin();
  if (!state.cart.length) return showToast("Keranjang kosong");

  renderCartModal();
  openModal("checkoutModal");
};

function renderCartModal() {
  $("#checkoutItems").innerHTML = state.cart
    .map(
      (i, idx) =>
        `<div class="cart-item-row"><div style="flex:1"><div style="font-weight:bold; font-size:14px">${
          i.name
        }</div><div class="muted" style="font-size:12px">${rupiah(i.price)} • ${
          i.vendorName
        }</div></div><div class="cart-controls"><button class="ctrl-btn" onclick="updateCartQty(${idx}, -1)">-</button><span class="ctrl-qty">${
          i.qty
        }</span><button class="ctrl-btn add" onclick="updateCartQty(${idx}, 1)">+</button></div><button class="iconBtn" style="width:30px; height:30px; margin-left:10px; border-color:#fee; color:red; background:#fff5f5" onclick="deleteCartItem(${idx})">🗑</button></div>`
    )
    .join("");
  $("#checkoutTotal").textContent = rupiah(
    state.cart.reduce((a, b) => a + b.price * b.qty, 0)
  );

  // --- LOGIC PEMBAYARAN DINAMIS ---
  const vendorId = state.cart[0].vendorId;
  const vendor = state.vendors.find((v) => v.id === vendorId);
  const paySelect = $("#payMethod");
  const qrisCont = $("#qrisContainer");
  const qrisImg = $("#qrisImageDisplay");

  // Reset
  paySelect.innerHTML = "";
  qrisCont.classList.add("hidden");

  if (vendor && vendor.paymentMethods) {
    if (vendor.paymentMethods.includes("cash")) {
      paySelect.innerHTML += `<option value="cash">💵 Tunai</option>`;
    }
    if (vendor.paymentMethods.includes("qris") && vendor.qrisImage) {
      paySelect.innerHTML += `<option value="qris">📱 QRIS</option>`;
    }
  } else {
    // Fallback jika data lama belum ada paymentMethods
    paySelect.innerHTML = `<option value="cash">💵 Tunai</option>`;
  }

  // Handle Perubahan Dropdown
  paySelect.onchange = () => {
    if (paySelect.value === "qris") {
      qrisImg.src = vendor.qrisImage;
      qrisCont.classList.remove("hidden");
    } else {
      qrisCont.classList.add("hidden");
    }
  };
}

// --- FIX DOUBLE ORDER: HANYA ADA SATU LISTENER ---
$("#placeOrderBtn").addEventListener("click", async () => {
  if (!state.user) return requireLogin();
  const btn = $("#placeOrderBtn");
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    const total = state.cart.reduce((a, b) => a + b.price * b.qty, 0);
    const vName = state.cart[0].vendorName;
    const vId = state.cart[0].vendorId;
    const payment = $("#payMethod").value; // Ambil metode bayar

    await addDoc(collection(db, "orders"), {
      userId: state.user.id,
      userName: state.user.name,
      vendorId: vId,
      vendorName: vName,
      items: state.cart,
      total: total,
      note: $("#orderNote").value,
      paymentMethod: payment, // Simpan metode bayar
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

// --- ORDERS & CHAT & PROFILE ---
window.switchOrderTab = (tab) => {
  state.activeOrderTab = tab;
  $$(".segment-btn").forEach((b) => b.classList.remove("active"));
  tab === "active"
    ? $$(".segment-btn")[0].classList.add("active")
    : $$(".segment-btn")[1].classList.add("active");
  renderOrders();
};
function renderOrders() {
  const list = $("#ordersList");
  if (!state.user) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">🔒</span><p>Login untuk melihat pesanan.</p><button class="btn small primary" onclick="requireLogin()">Login Disini</button></div>`;
    return;
  }
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
      }</b><div class="muted" style="font-size:11px">${new Date(
        o.createdAt
      ).toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}</div></div><span class="badge ${statusBadge}">${
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
$("#chatVendorBtn").addEventListener("click", () => {
  if (!state.user) return requireLogin();
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

window.go = (n) => {
  if ((n === "Orders" || n === "Messages") && !state.user) {
    requireLogin();
    return;
  }
  Object.values(screens).forEach((e) => e.classList.add("hidden"));
  screens[n].classList.remove("hidden");
  if (n === "Messages" && window.innerWidth < 768)
    $("#mainHeader").classList.add("hidden");
  else $("#mainHeader").classList.remove("hidden");
  $$(".nav").forEach((b) => b.classList.toggle("active", b.dataset.go === n));
  if (n === "Map") {
    initMap();
    setTimeout(() => state.map.invalidateSize(), 300);
  }
  if (n === "Messages") renderChat();
};
$$(".nav").forEach((b) =>
  b.addEventListener("click", () => window.go(b.dataset.go))
);
function renderProfile() {
  const container = $("#profileContent");
  if (state.user) {
    container.innerHTML = `<div class="card"><div class="rowBetween"><div style="display: flex; gap: 12px; align-items: center"><div style="width: 50px; height: 50px; background: #eee; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">👤</div><div><b id="pName" style="display: block">${
      state.user.name
    }</b><span id="pEmail" class="muted" style="font-size: 12px">${
      state.user.email
    }</span></div></div></div><hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;" /><div class="rowBetween" style="margin-bottom: 10px"><span class="muted">Saldo</span><b class="big" style="color: var(--orange)" id="wallet">${rupiah(
      state.user.wallet
    )}</b></div><button id="topupBtn" class="btn primary" onclick="doTopup()" style="width: 100%">Isi Saldo (+50k)</button></div>`;
    $("#mobileProfileLogout").textContent = "Keluar Akun";
    $("#mobileProfileLogout").onclick = () => {
      if (confirm("Keluar?")) {
        localStorage.removeItem("pikul_user_id");
        location.reload();
      }
    };
    $("#logoutBtn").style.display = "flex";
  } else {
    container.innerHTML = `<div class="card"><div style="text-align:center; padding:20px;"><div style="font-size:40px; margin-bottom:10px;">👋</div><b>Halo, Tamu!</b><p class="muted" style="margin:5px 0 20px;">Masuk untuk melihat saldo dan profil.</p><button class="btn primary full" onclick="requireLogin()">Masuk / Daftar</button></div></div>`;
    $("#mobileProfileLogout").style.display = "none";
    $("#logoutBtn").style.display = "none";
  }
}
window.doTopup = async () => {
  if (!state.user) return;
  await updateDoc(doc(db, "users", state.user.id), {
    wallet: (state.user.wallet || 0) + 50000,
  });
  state.user.wallet += 50000;
  renderProfile();
  showToast("Saldo bertambah!");
};
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
  if ($("#themeSwitch")) {
    $("#themeSwitch").checked = d;
    $("#themeSwitch").addEventListener("change", (e) => {
      e.target.checked
        ? (document.body.setAttribute("data-theme", "dark"),
          localStorage.setItem("pikul_theme", "dark"))
        : (document.body.removeAttribute("data-theme"),
          localStorage.setItem("pikul_theme", "light"));
    });
  }
}
function showAuth() {
  $("#auth").classList.remove("hidden");
  $("#app").classList.add("hidden");
}
function showApp() {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  setTimeout(() => $("#splash").remove(), 500);
}
function startGPS() {
  if (navigator.geolocation)
    navigator.geolocation.watchPosition((p) => {
      state.you = { ok: true, lat: p.coords.latitude, lon: p.coords.longitude };
      $("#gpsStatus").textContent = "GPS ON";
      $("#gpsStatus").className = "pill";
      if (state.map && state.userMarker) {
        state.userMarker.setLatLng([state.you.lat, state.you.lon]);
        updateMapMarkers();
      }
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
function openModal(id) {
  $("#" + id).classList.remove("hidden");
}
function closeModal(id) {
  $("#" + id).classList.add("hidden");
}
$$("[data-close]").forEach((el) =>
  el.addEventListener("click", () => closeModal(el.dataset.close))
);
initAuth();
