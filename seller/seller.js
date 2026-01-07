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
};

// --- AUTH (Sama) ---
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
$("#logoutBtn").addEventListener("click", () => {
  if (confirm("Keluar?")) {
    localStorage.removeItem("pikul_seller");
    location.reload();
  }
});

// --- INIT ---
function initApp() {
  const saved = localStorage.getItem("pikul_seller");
  if (!saved) return $("#auth").classList.remove("hidden");
  state.vendor = JSON.parse(saved);
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  onSnapshot(doc(db, "vendors", state.vendor.id), (doc) => {
    if (doc.exists()) {
      state.vendor = { id: doc.id, ...doc.data() };
      renderUI();
    }
  });
}

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
    stopGPS();
  } else {
    $("#subAlert").classList.add("hidden");
    $("#subActive").classList.remove("hidden");
    $("#expDate").textContent =
      "s/d " + new Date(state.vendor.subscriptionExpiry).toLocaleDateString();
    $("#statusToggle").disabled = false;
    $("#statusToggle").checked = state.vendor.isLive;
    if (state.vendor.isLive) {
      $("#statusText").textContent = "Sedang Jualan (Online)";
      $("#statusText").style.color = "#059669";
      $("#locationControls").classList.remove("hidden");
      if (!state.map) initMap();
      state.locMode = state.vendor.locationMode || "gps";
      updateModeButtons();
      handleLocationLogic();
    } else {
      $("#statusText").textContent = "Toko Tutup (Offline)";
      $("#statusText").style.color = "#6b6b6b";
      $("#locationControls").classList.add("hidden");
      stopGPS();
    }
  }
  $("#menuList").innerHTML =
    (state.vendor.menu || [])
      .map(
        (m, idx) =>
          `<div class="menu-item"><div><b>${m.name}</b><div class="muted">Rp ${m.price}</div></div><button class="btn ghost small" style="color:red; border-color:#fee" onclick="deleteMenu(${idx})">Hapus</button></div>`
      )
      .join("") ||
    `<div class="muted" style="text-align:center">Belum ada menu</div>`;
}

// --- ORDERS SYSTEM (BARU) ---
function loadOrders() {
  // Query orders untuk vendor ini
  const q = query(
    collection(db, "orders"),
    where("vendorId", "==", state.vendor.id)
  );

  onSnapshot(q, (snap) => {
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort manual desc (terbaru diatas)
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const activeOrders = list.filter((o) => o.status !== "Selesai");
    const historyOrders = list.filter((o) => o.status === "Selesai");

    renderOrderList("#incomingOrdersList", activeOrders, true);
    renderOrderList("#historyOrdersList", historyOrders, false);
  });
}

function renderOrderList(selector, data, isActive) {
  const el = $(selector);
  if (data.length === 0) {
    el.innerHTML = `<div class="muted" style="text-align:center; padding:10px; font-size:12px;">Tidak ada pesanan.</div>`;
    return;
  }

  el.innerHTML = data
    .map((o) => {
      const items = (o.items || [])
        .map((i) => `${i.qty}x ${i.name}`)
        .join(", ");
      const time = new Date(o.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Logika Tombol Aksi
      let actionBtn = "";
      if (isActive) {
        if (o.status === "Diproses") {
          actionBtn = `<button class="btn primary small" style="width:100%" onclick="updateStatus('${o.id}', 'Dalam perjalanan')">🍳 Siap & Antar</button>`;
        } else if (o.status === "Dalam perjalanan") {
          actionBtn = `<button class="btn small" style="width:100%; background:#dcfce7; color:#166534; border:1px solid #bbf7d0" onclick="updateStatus('${o.id}', 'Selesai')">✅ Selesaikan Order</button>`;
        }
      } else {
        actionBtn = `<div class="pill" style="font-size:11px; background:#eee">Selesai</div>`;
      }

      return `
      <div class="order-card">
        <div class="ord-head">
          <div><b>${
            o.userName
          }</b> <span class="muted" style="font-size:11px">(${time})</span></div>
          <span class="pill">${o.status}</span>
        </div>
        <div class="ord-body">
          <div style="font-size:13px; line-height:1.4; margin-bottom:8px;">${items}</div>
          ${
            o.note
              ? `<div style="font-size:12px; color:#e11d48; background:#fff1f2; padding:4px 8px; border-radius:6px; display:inline-block; margin-bottom:8px;">📝 Note: ${o.note}</div>`
              : ""
          }
          <div class="rowBetween">
            <span class="muted" style="font-size:12px">Total</span>
            <b style="font-size:15px">${rupiah(o.total)}</b>
          </div>
        </div>
        ${actionBtn ? `<div class="ord-foot">${actionBtn}</div>` : ""}
      </div>
    `;
    })
    .join("");
}

window.updateStatus = async (orderId, newStatus) => {
  if (confirm(`Ubah status jadi "${newStatus}"?`)) {
    await updateDoc(doc(db, "orders", orderId), { status: newStatus });
  }
};

// --- MAP & LOCATION ---
function initMap() {
  if (state.map) return;
  state.map = L.map("sellerMap").setView(
    [state.vendor.lat, state.vendor.lon],
    15
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OSM",
  }).addTo(state.map);
  const vendorIcon = L.divIcon({
    className: "vendor-pin",
    html: `<div style="background:white; padding:4px; border-radius:8px; border:2px solid #ff7a00; font-size:20px; text-align:center; width:40px;">${
      state.vendor.ico || "🏪"
    }</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });
  state.marker = L.marker([state.vendor.lat, state.vendor.lon], {
    icon: vendorIcon,
    draggable: false,
  }).addTo(state.map);
  state.marker.on("dragend", async function (e) {
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
  $$(".mode-btn").forEach((b) => b.classList.remove("active"));
  if (state.locMode === "gps") $$(".mode-btn")[0].classList.add("active");
  else $$(".mode-btn")[1].classList.add("active");
  if (state.locMode === "manual") $("#manualHint").classList.remove("hidden");
  else $("#manualHint").classList.add("hidden");
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
  if (!navigator.geolocation) return alert("HP tidak dukung GPS");
  if (state.watchId) return;
  state.watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      await updateDoc(doc(db, "vendors", state.vendor.id), { lat, lon });
      if (state.marker) state.marker.setLatLng([lat, lon]);
      if (state.map) state.map.setView([lat, lon], 16);
    },
    (err) => console.log(err),
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
  if (confirm("Bayar 5rb?")) {
    await updateDoc(doc(db, "vendors", state.vendor.id), {
      subscriptionExpiry: Date.now() + 2592000000,
    });
    alert("Lunas!");
  }
});

// --- MENU ---
$("#addMenuBtn").addEventListener("click", () =>
  $("#menuModal").classList.remove("hidden")
);
window.closeModal = () => $("#menuModal").classList.add("hidden");
$("#menuForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const m = {
    id: "m" + Date.now(),
    name: $("#mName").value,
    price: parseInt($("#mPrice").value),
  };
  const upd = [...(state.vendor.menu || []), m];
  await updateDoc(doc(db, "vendors", state.vendor.id), { menu: upd });
  $("#mName").value = "";
  $("#mPrice").value = "";
  closeModal();
});
window.deleteMenu = async (idx) => {
  if (confirm("Hapus?")) {
    const upd = [...state.vendor.menu];
    upd.splice(idx, 1);
    await updateDoc(doc(db, "vendors", state.vendor.id), { menu: upd });
  }
};

// --- NAVIGATION (UPDATED) ---
window.goSeller = (screen) => {
  const navs = document.querySelectorAll(".nav");
  navs.forEach((n) => n.classList.remove("active"));
  $("#sellerHome").classList.add("hidden");
  $("#sellerChat").classList.add("hidden");
  $("#sellerOrders").classList.add("hidden");

  if (screen === "Home") {
    navs[0].classList.add("active");
    $("#sellerHome").classList.remove("hidden");
  } else if (screen === "Orders") {
    navs[1].classList.add("active");
    $("#sellerOrders").classList.remove("hidden");
    loadOrders(); // Load Order Data
  } else {
    navs[2].classList.add("active");
    $("#sellerChat").classList.remove("hidden");
    loadChatList();
  }
};

// --- CHAT SYSTEM ---
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
            `<div class="chat-item" onclick="openChat('${c.id}', '${
              c.userName
            }')" style="background:white; padding:12px; border:1px solid #eee; border-radius:12px; margin-bottom:8px; cursor:pointer;"><div class="rowBetween"><b>${
              c.userName
            }</b><span class="muted" style="font-size:10px">${new Date(
              c.lastUpdate || Date.now()
            ).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}</span></div><div class="muted" style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${
              c.lastMessage || "Pesan baru"
            }</div></div>`
        )
        .join("") ||
      '<div class="muted" style="text-align:center; padding:20px;">Belum ada pesan masuk.</div>';
  });
}
window.openChat = (chatId, userName) => {
  state.activeChatId = chatId;
  $("#chatList").classList.add("hidden");
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
        }; margin-bottom:6px;"><div class="bubble ${
          isMe ? "me" : "them"
        }" style="background:${isMe ? "#ff7a00" : "#f3f4f6"}; color:${
          isMe ? "white" : "black"
        }; padding:8px 12px; border-radius:12px; max-width:80%; font-size:13px;">${
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
  $("#chatList").classList.remove("hidden");
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

initApp();
