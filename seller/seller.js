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
  updateDoc,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
function rupiah(n) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

let state = {
  vendor: null,
  watchId: null,
  map: null,
  marker: null,
  locMode: "gps",
  activeChatId: null,
  unsubMsg: null,
  orders: [],
  editingMenuIndex: null,
};

// --- AUTH ---
async function login(email, password) {
  const q = query(collection(db, "vendors"), where("email", "==", email));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    state.vendor = { id: d.id, ...d.data() };
    if (state.vendor.password && state.vendor.password !== password)
      return alert("Password salah!");
  } else {
    const name = prompt("Nama Warung?");
    const type = prompt("Kategori? (bakso/kopi/nasi)");
    if (!name || !type) return;
    const newVendor = {
      email,
      password,
      name,
      type,
      ico: "🏪",
      rating: 5.0,
      busy: "Buka",
      lat: -6.2,
      lon: 106.8,
      menu: [],
      subscriptionExpiry: Date.now() - 1000,
      isLive: false,
      locationMode: "gps",
    };
    const ref = await addDoc(collection(db, "vendors"), newVendor);
    state.vendor = { id: ref.id, ...newVendor };
  }
  localStorage.setItem("pikul_seller", JSON.stringify(state.vendor));
  initApp();
}
$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  login($("#email").value, $("#password").value);
});
window.logout = () => {
  if (confirm("Keluar?")) {
    localStorage.removeItem("pikul_seller");
    location.reload();
  }
};

// --- INIT ---
function initApp() {
  const saved = localStorage.getItem("pikul_seller");
  if (!saved) return $("#auth").classList.remove("hidden");
  state.vendor = JSON.parse(saved);
  $("#auth").classList.add("hidden");
  $(".app-layout").classList.remove("hidden"); // FIX: .app-layout

  onSnapshot(doc(db, "vendors", state.vendor.id), (doc) => {
    if (doc.exists()) {
      state.vendor = { id: doc.id, ...doc.data() };
      renderUI();
    }
  });
  const qOrd = query(
    collection(db, "orders"),
    where("vendorId", "==", state.vendor.id)
  );
  onSnapshot(qOrd, (snap) => {
    state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrdersList();
    calculateStats();
  });
}

// --- UI RENDER ---
function renderUI() {
  $("#vName").textContent = state.vendor.name;
  const isExpired = state.vendor.subscriptionExpiry < Date.now();
  if (isExpired) {
    $("#subAlert").classList.remove("hidden");
    $("#subActive").classList.add("hidden");
    $("#statusToggle").disabled = true;
    $("#statusToggle").checked = false;
    $("#locationControls").classList.add("hidden");
    $("#statusText").textContent = "Bayar dulu";
    $("#statusText").className = "status-indicator offline";
    stopGPS();
  } else {
    $("#subAlert").classList.add("hidden");
    $("#subActive").classList.remove("hidden");
    $("#expDate").textContent = new Date(
      state.vendor.subscriptionExpiry
    ).toLocaleDateString();
    $("#statusToggle").disabled = false;
    $("#statusToggle").checked = state.vendor.isLive;
    if (state.vendor.isLive) {
      $("#statusText").textContent = "Toko Buka (Online)";
      $("#statusText").className = "status-indicator online";
      $("#locationControls").classList.remove("hidden");
      if (!state.map) initMap();
      state.locMode = state.vendor.locationMode || "gps";
      updateModeButtons();
      handleLocationLogic();
    } else {
      $("#statusText").textContent = "Toko Tutup (Offline)";
      $("#statusText").className = "status-indicator offline";
      $("#locationControls").classList.add("hidden");
      stopGPS();
    }
  }
  $("#menuList").innerHTML =
    (state.vendor.menu || [])
      .map(
        (m, idx) => `
    <div class="menu-card">
      <div><div style="font-weight:700">${
        m.name
      }</div><div style="color:var(--text-muted); font-size:13px;">${rupiah(
          m.price
        )}</div></div>
      <div class="menu-actions"><button class="btn-icon-action btn-edit" onclick="openEditMenu(${idx})">✎</button><button class="btn-icon-action btn-del" onclick="deleteMenu(${idx})">🗑</button></div>
    </div>`
      )
      .join("") || `<div class="empty-state-box">Belum ada menu.</div>`;
}

// --- NAVIGATION ---
window.goSeller = (screen) => {
  // Mobile Nav
  $$(".nav-item").forEach((n) => n.classList.remove("active"));
  // Desktop Nav
  $$(".sb-item").forEach((n) => n.classList.remove("active"));

  $("#sellerHome").classList.add("hidden");
  $("#sellerChat").classList.add("hidden");
  $("#sellerOrders").classList.add("hidden");

  if (screen === "Home") {
    $$(".nav-item")[0].classList.add("active");
    $$(".sb-item")[0].classList.add("active");
    $("#sellerHome").classList.remove("hidden");
  } else if (screen === "Orders") {
    $$(".nav-item")[1].classList.add("active");
    $$(".sb-item")[1].classList.add("active");
    $("#sellerOrders").classList.remove("hidden");
  } else {
    $$(".nav-item")[2].classList.add("active");
    $$(".sb-item")[2].classList.add("active");
    $("#sellerChat").classList.remove("hidden");
    loadChatList();
  }
};

// --- CHAT DESKTOP SUPPORT ---
function loadChatList() {
  const q = query(
    collection(db, "chats"),
    where("vendorId", "==", state.vendor.id)
  );
  onSnapshot(q, (snap) => {
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => b.lastUpdate - a.lastUpdate);
    $("#chatList").innerHTML =
      list
        .map(
          (c) => `
      <div class="chat-entry" onclick="openChat('${c.id}', '${c.userName}')">
        <div><b style="font-size:14px;">${
          c.userName
        }</b><div style="font-size:13px; color:#64748b; margin-top:2px;">${
            c.lastMessage
          }</div></div>
        <div style="font-size:11px; color:#94a3b8;">${new Date(
          c.lastUpdate || Date.now()
        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      </div>`
        )
        .join("") || '<div class="empty-state-box">Belum ada chat.</div>';
  });
}
window.openChat = (chatId, userName) => {
  state.activeChatId = chatId;

  // Mobile view logic
  if (window.innerWidth < 1024) $("#chatRoom").classList.remove("hidden");

  // Desktop view logic (hide placeholder)
  const ph = $("#chatPlaceholder");
  if (ph) ph.classList.add("hidden");
  $("#chatRoom").classList.remove("hidden");

  $("#chattingWith").textContent = userName;
  if (state.unsubMsg) state.unsubMsg();
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("ts", "asc")
  );
  state.unsubMsg = onSnapshot(q, (snap) => {
    $("#msgBox").innerHTML = snap.docs
      .map((d) => {
        const m = d.data();
        const isMe = m.from === state.vendor.id;
        return `<div style="display:flex; justify-content:${
          isMe ? "flex-end" : "flex-start"
        };"><div class="chat-bubble ${isMe ? "me" : "them"}">${
          m.text
        }</div></div>`;
      })
      .join("");
    $("#msgBox").scrollTop = $("#msgBox").scrollHeight;
  });
};
window.closeChat = () => {
  state.activeChatId = null;
  $("#chatRoom").classList.add("hidden");
  const ph = $("#chatPlaceholder");
  if (ph) ph.classList.remove("hidden"); // Show desktop placeholder
  if (state.unsubMsg) state.unsubMsg();
};
$("#sendReplyBtn").addEventListener("click", async () => {
  const txt = $("#replyInput").value.trim();
  if (!txt || !state.activeChatId) return;
  await addDoc(collection(db, "chats", state.activeChatId, "messages"), {
    text: txt,
    from: state.vendor.id,
    ts: Date.now(),
  });
  await updateDoc(doc(db, "chats", state.activeChatId), {
    lastMessage: "Anda: " + txt,
    lastUpdate: Date.now(),
  });
  $("#replyInput").value = "";
});

// --- ORDERS, MAP, MENU (Logic Inti Sama, diadaptasi sedikit) ---
function calculateStats() {
  const now = new Date();
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const w = new Date(now.setDate(now.getDate() - now.getDay())).setHours(
    0,
    0,
    0,
    0
  );
  const m = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).getTime();
  let today = 0,
    week = 0,
    month = 0,
    total = 0,
    itemCounts = {};
  state.orders.forEach((o) => {
    if (o.status === "Selesai") {
      const t = new Date(o.createdAt).getTime();
      const val = o.total || 0;
      if (t >= d) today += val;
      if (t >= w) week += val;
      if (t >= m) month += val;
      total += val;
      (o.items || []).forEach(
        (i) => (itemCounts[i.name] = (itemCounts[i.name] || 0) + i.qty)
      );
    }
  });
  $("#statToday").textContent = rupiah(today);
  $("#statWeek").textContent = rupiah(week);
  $("#statMonth").textContent = rupiah(month);
  $("#statTotal").textContent = rupiah(total);
  let bestName = "-",
    bestQty = 0;
  for (const [name, qty] of Object.entries(itemCounts)) {
    if (qty > bestQty) {
      bestName = name;
      bestQty = qty;
    }
  }
  $("#bestSellerName").textContent = bestName;
  $("#bestSellerCount").textContent = `${bestQty} Terjual`;
}
function renderOrdersList() {
  const list = state.orders.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const activeOrders = list.filter((o) => o.status !== "Selesai");
  const historyOrders = list.filter((o) => o.status === "Selesai");
  $("#incomingCount").textContent = activeOrders.length;
  const renderItem = (o, active) => {
    const items = (o.items || []).map((i) => `${i.qty}x ${i.name}`).join(", ");
    let stCls =
      o.status === "Diproses"
        ? "status-process"
        : o.status === "Dalam perjalanan"
        ? "status-deliv"
        : "status-done";
    let btn = active
      ? o.status === "Diproses"
        ? `<button class="btn primary full" onclick="updStat('${o.id}','Dalam perjalanan')">🍳 Proses & Antar</button>`
        : `<button class="btn full" style="background:#10b981; color:white;" onclick="updStat('${o.id}','Selesai')">✅ Selesaikan</button>`
      : "";
    return `<div class="order-item"><div class="ord-head"><div><b>${
      o.userName
    }</b> <span style="color:#94a3b8; font-size:12px;">• ${new Date(
      o.createdAt
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}</span></div><span class="ord-status ${stCls}">${
      o.status
    }</span></div><div class="ord-body"><p style="margin:0 0 10px 0; font-size:14px; line-height:1.5;">${items}</p>${
      o.note
        ? `<div style="background:#fff1f2; color:#be123c; padding:8px; border-radius:8px; font-size:12px; margin-bottom:10px;">📝 ${o.note}</div>`
        : ""
    }<div class="rowBetween"><span class="muted">Total</span><b style="font-size:16px;">${rupiah(
      o.total
    )}</b></div></div>${btn ? `<div class="ord-foot">${btn}</div>` : ""}</div>`;
  };
  $("#incomingOrdersList").innerHTML =
    activeOrders.map((o) => renderItem(o, true)).join("") ||
    `<div class="empty-state-box">Tidak ada pesanan aktif.</div>`;
  $("#historyOrdersList").innerHTML = historyOrders
    .map((o) => renderItem(o, false))
    .join("");
}
window.updStat = async (oid, st) => {
  if (confirm("Update status?"))
    await updateDoc(doc(db, "orders", oid), { status: st });
};
$("#addMenuBtn").addEventListener("click", () => {
  state.editingMenuIndex = null;
  $("#menuModalTitle").textContent = "Tambah Menu";
  $("#mName").value = "";
  $("#mPrice").value = "";
  $("#menuModal").classList.remove("hidden");
});
window.openEditMenu = (idx) => {
  state.editingMenuIndex = idx;
  const item = state.vendor.menu[idx];
  $("#menuModalTitle").textContent = "Edit Menu";
  $("#mName").value = item.name;
  $("#mPrice").value = item.price;
  $("#menuModal").classList.remove("hidden");
};
window.closeModal = () => $("#menuModal").classList.add("hidden");
$("#menuForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#mName").value,
    price = parseInt($("#mPrice").value);
  let updMenu = [...(state.vendor.menu || [])];
  if (state.editingMenuIndex !== null)
    updMenu[state.editingMenuIndex] = {
      ...updMenu[state.editingMenuIndex],
      name,
      price,
    };
  else updMenu.push({ id: "m" + Date.now(), name, price });
  await updateDoc(doc(db, "vendors", state.vendor.id), { menu: updMenu });
  closeModal();
});
window.deleteMenu = async (idx) => {
  if (confirm("Hapus?")) {
    const upd = [...state.vendor.menu];
    upd.splice(idx, 1);
    await updateDoc(doc(db, "vendors", state.vendor.id), { menu: upd });
  }
};
function initMap() {
  if (state.map) return;
  state.map = L.map("sellerMap").setView(
    [state.vendor.lat, state.vendor.lon],
    15
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OSM",
  }).addTo(state.map);
  const icon = L.divIcon({
    className: "vendor-pin",
    html: `<div style="background:white; padding:4px; border-radius:8px; border:2px solid #ff7a00; font-size:20px; text-align:center; width:40px;">${
      state.vendor.ico || "🏪"
    }</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });
  state.marker = L.marker([state.vendor.lat, state.vendor.lon], {
    icon: icon,
    draggable: false,
  }).addTo(state.map);
  state.marker.on("dragend", async (e) => {
    const { lat, lng } = e.target.getLatLng();
    await updateDoc(doc(db, "vendors", state.vendor.id), {
      lat: lat,
      lon: lng,
    });
  });
}
window.setLocMode = async (mode) => {
  state.locMode = mode;
  updateModeButtons();
  await updateDoc(doc(db, "vendors", state.vendor.id), { locationMode: mode });
  handleLocationLogic();
};
function updateModeButtons() {
  $$(".mode-tab").forEach((b) => b.classList.remove("active"));
  if (state.locMode === "gps") $$(".mode-tab")[0].classList.add("active");
  else $$(".mode-tab")[1].classList.add("active");
  $("#manualHint").classList.toggle("hidden", state.locMode !== "manual");
}
function handleLocationLogic() {
  if (!state.map || !state.marker) return;
  if (state.locMode === "gps") {
    state.marker.dragging.disable();
    startGPS();
  } else {
    stopGPS();
    state.marker.dragging.enable();
  }
}
function startGPS() {
  if (!navigator.geolocation) return;
  if (state.watchId) return;
  state.watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      await updateDoc(doc(db, "vendors", state.vendor.id), { lat, lon });
      if (state.marker) state.marker.setLatLng([lat, lon]);
      if (state.map) state.map.setView([lat, lon], 16);
    },
    null,
    { enableHighAccuracy: true }
  );
}
function stopGPS() {
  if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
}
$("#statusToggle").addEventListener("change", async (e) => {
  await updateDoc(doc(db, "vendors", state.vendor.id), {
    isLive: e.target.checked,
  });
});
$("#payBtn").addEventListener("click", async () => {
  if (confirm("Bayar 5rb?"))
    await updateDoc(doc(db, "vendors", state.vendor.id), {
      subscriptionExpiry: Date.now() + 2592000000,
    });
});

initApp();
