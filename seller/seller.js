import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  orderBy,
  setDoc,
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

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#email").value.trim(),
    password = $("#password").value,
    btn = e.target.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    const q = query(collection(db, "vendors"), where("email", "==", email));
    const snap = await getDocs(q);
    if (snap.empty) {
      alert("Email tidak ditemukan.");
      btn.disabled = false;
      btn.textContent = "Masuk";
      return;
    }
    const vData = snap.docs[0].data();
    if (vData.password && vData.password !== password) {
      alert("Password salah!");
      btn.disabled = false;
      btn.textContent = "Masuk";
      return;
    }
    state.vendor = { id: snap.docs[0].id, ...vData };
    localStorage.setItem("pikul_seller_id", state.vendor.id);
    initApp();
  } catch (err) {
    alert("Error: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Masuk Dashboard";
});

$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#regName").value.trim(),
    type = $("#regType").value,
    email = $("#regEmail").value.trim(),
    password = $("#regPass").value,
    btn = e.target.querySelector("button");
  if (password.length < 6) return alert("Password minimal 6 karakter");
  btn.disabled = true;
  btn.textContent = "Mendaftar...";
  try {
    const q = query(collection(db, "vendors"), where("email", "==", email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      alert("Email sudah terdaftar.");
      btn.disabled = false;
      btn.textContent = "Daftar";
      return;
    }
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
      subscriptionExpiry: Date.now() + 2592000000,
      isLive: false,
      locationMode: "gps",
      paymentMethods: ["cash"],
      qrisImage: null,
    };
    const ref = await addDoc(collection(db, "vendors"), newVendor);
    state.vendor = { id: ref.id, ...newVendor };
    localStorage.setItem("pikul_seller_id", state.vendor.id);
    initApp();
  } catch (err) {
    alert("Gagal daftar: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Daftar Sekarang";
});
window.logout = () => {
  if (confirm("Keluar dari Mitra?")) {
    localStorage.removeItem("pikul_seller_id");
    location.reload();
  }
};

// --- INIT APP ---
async function initApp() {
  const vid = localStorage.getItem("pikul_seller_id");
  if (!vid) return $("#auth").classList.remove("hidden");
  try {
    const docSnap = await getDoc(doc(db, "vendors", vid));
    if (!docSnap.exists()) {
      localStorage.removeItem("pikul_seller_id");
      return $("#auth").classList.remove("hidden");
    }
    state.vendor = { id: docSnap.id, ...docSnap.data() };
    $("#auth").classList.add("hidden");
    $(".app-layout").classList.remove("hidden");

    // Listen Self (Profile & Settings)
    onSnapshot(doc(db, "vendors", state.vendor.id), (doc) => {
      if (doc.exists()) {
        state.vendor = { id: doc.id, ...doc.data() };
        renderUI();
        renderPaymentSettings(); // Update UI Payment
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
  } catch (e) {
    console.error(e);
    $("#auth").classList.remove("hidden");
  }
}

function renderUI() {
  if (!state.vendor) return;
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
    // Fix: Pastikan tombol enable jika tidak expired
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
        (m, idx) =>
          `<div class="menu-card"><div><div style="font-weight:700">${
            m.name
          }</div><div style="color:var(--text-muted); font-size:13px;">${rupiah(
            m.price
          )}</div></div><div class="menu-actions"><button class="btn-icon-action btn-edit" onclick="openEditMenu(${idx})">✎</button><button class="btn-icon-action btn-del" onclick="deleteMenu(${idx})">🗑</button></div></div>`
      )
      .join("") || `<div class="empty-state-box">Belum ada menu.</div>`;
}

// --- PAYMENT METHOD LOGIC (FIXED: ATTACH TO WINDOW) ---
function renderPaymentSettings() {
  const methods = state.vendor.paymentMethods || ["cash"];
  const hasQris = methods.includes("qris");

  // Update Checkbox UI
  $("#chkCash").checked = methods.includes("cash");
  $("#chkQris").checked = hasQris;

  // UI QRIS Area
  const qrisConfig = $("#qrisConfig");
  const qrisStatus = $("#qrisStatus");
  const qrisImg = $("#qrisImg");
  const qrisPh = $("#qrisPlaceholder");

  if (hasQris) {
    qrisConfig.classList.remove("hidden");
    if (state.vendor.qrisImage) {
      qrisStatus.textContent = "✅ Aktif";
      qrisStatus.style.color = "#10b981";
      qrisImg.src = state.vendor.qrisImage;
      qrisImg.classList.remove("hidden");
      qrisPh.classList.add("hidden");
      $(".qris-preview").classList.add("has-image");
    } else {
      qrisStatus.textContent = "⚠️ Upload Gambar";
      qrisStatus.style.color = "#f59e0b";
      qrisImg.classList.add("hidden");
      qrisPh.classList.remove("hidden");
      $(".qris-preview").classList.remove("has-image");
    }
  } else {
    qrisConfig.classList.add("hidden");
    qrisStatus.textContent = "Belum Aktif";
    qrisStatus.style.color = "#94a3b8";
  }
}

// EXPOSE TO GLOBAL WINDOW
window.updatePaymentMethod = async () => {
  const cash = $("#chkCash").checked;
  const qris = $("#chkQris").checked;

  let newMethods = [];
  if (cash) newMethods.push("cash");
  if (qris) newMethods.push("qris");

  if (newMethods.length === 0) {
    alert("Minimal satu metode pembayaran aktif.");
    $("#chkCash").checked = true;
    return;
  }
  await updateDoc(doc(db, "vendors", state.vendor.id), {
    paymentMethods: newMethods,
  });
};

window.triggerQrisUpload = () => {
  $("#qrisInput").click();
};

window.handleQrisUpload = (input) => {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      await updateDoc(doc(db, "vendors", state.vendor.id), {
        qrisImage: base64,
      });
      alert("QRIS berhasil diupload!");
    };
    reader.readAsDataURL(input.files[0]);
  }
};

// --- CHAT SYSTEM ---
window.openChat = (chatId, userName) => {
  state.activeChatId = chatId;
  $("#chatRoom").classList.add("active");
  $("#chattingWith").textContent = userName;
  $$(".chat-entry").forEach((el) => el.classList.remove("active"));
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
        let contentHtml = "";
        if (m.type === "image")
          contentHtml = `<div class="bubble image ${
            isMe ? "me" : "them"
          }"><img src="${m.text}" loading="lazy" /></div>`;
        else if (m.type === "location")
          contentHtml = `<a href="${
            m.text
          }" target="_blank" class="bubble location ${
            isMe ? "me" : "them"
          }"><span>📍</span> Lacak Lokasi</a>`;
        else if (m.type === "sticker")
          contentHtml = `<div class="bubble sticker ${isMe ? "me" : "them"}">${
            m.text
          }</div>`;
        else
          contentHtml = `<div class="bubble ${isMe ? "me" : "them"}">${
            m.text
          }</div>`;
        return `<div style="display:flex; justify-content:${
          isMe ? "flex-end" : "flex-start"
        }; margin-bottom: 6px;">${contentHtml}</div>`;
      })
      .join("");
    $("#msgBox").scrollTop = $("#msgBox").scrollHeight;
  });
};

window.goSeller = (screen) => {
  $$(".nav-item").forEach((n) => n.classList.remove("active"));
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
          (c) =>
            `<div class="chat-entry" onclick="openChat('${c.id}', '${
              c.userName
            }')"><div style="width:40px; height:40px; background:#f1f5f9; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px;">👤</div><div style="flex:1; min-width:0;"><div style="display:flex; justify-content:space-between; margin-bottom:2px;"><b style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${
              c.userName
            }</b><span style="font-size:11px; color:#94a3b8;">${new Date(
              c.lastUpdate || Date.now()
            ).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}</span></div><div style="font-size:13px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${
              c.lastMessage
            }</div></div></div>`
        )
        .join("") ||
      '<div style="text-align:center; padding:40px; color:#94a3b8;"><div style="font-size:40px; margin-bottom:10px;">💬</div>Belum ada chat.</div>';
  });
}
window.closeChat = () => {
  state.activeChatId = null;
  $("#chatRoom").classList.remove("active");
  if (state.unsubMsg) state.unsubMsg();
};
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
    };
    reader.readAsDataURL(input.files[0]);
  }
};
window.sendLocation = async () => {
  $("#attachMenu").classList.remove("visible");
  const lat = state.vendor.lat;
  const lon = state.vendor.lon;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
  await sendMessage(mapsUrl, "location");
};
window.renderStickers = (type) => {
  const grid = $("#stickerGrid");
  if (type === "emoji") {
    const emojis = [
      "😀",
      "😂",
      "😍",
      "👍",
      "🙏",
      "🔥",
      "❤️",
      "🎉",
      "👋",
      "📦",
      "🥘",
      "🚲",
    ];
    grid.innerHTML = emojis
      .map(
        (e) =>
          `<div class="sticker-item" onclick="sendSticker('${e}', 'emoji')">${e}</div>`
      )
      .join("");
  } else {
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
  if (!state.activeChatId || !content) return;
  await addDoc(collection(db, "chats", state.activeChatId, "messages"), {
    text: content,
    type: type,
    from: state.vendor.id,
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
  await updateDoc(doc(db, "chats", state.activeChatId), {
    lastMessage: "Anda: " + preview,
    lastUpdate: Date.now(),
  });
}
$("#sendReplyBtn").addEventListener("click", () => {
  const t = $("#replyInput").value.trim();
  if (t) {
    sendMessage(t, "text");
    $("#replyInput").value = "";
  }
});
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
$$("[data-close]").forEach((b) =>
  b.addEventListener("click", window.closeModal)
);
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
    attribution: "© OSM",
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
  state.locMode === "gps"
    ? $$(".mode-tab")[0].classList.add("active")
    : $$(".mode-tab")[1].classList.add("active");
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
