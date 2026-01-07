import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  orderBy,
  query,
  deleteDoc,
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
  orders: [],
  vendors: [],
  replies: [],
  banners: [],
  selectedOrderId: null,
  selectedVendorId: null,
  firstLoad: true,
};

// --- AUTH ---
$("#adminLoginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (
    $("#adminUser").value === "admin" &&
    $("#adminPass").value === "admin123"
  ) {
    $("#adminAuth").classList.add("hidden");
    $("#adminApp").classList.remove("hidden");
    boot();
  } else {
    alert("Salah.");
  }
});
$("#adminLogoutBtn").addEventListener("click", () => location.reload());

// --- TABS ---
$$(".sbItem").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".sbItem").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab" + b.dataset.tab).classList.remove("hidden");
    const title = $("#pageTitle");
    if (title) title.textContent = b.dataset.tab;
  })
);

// --- BOOT ---
function boot() {
  onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc")),
    (snap) => {
      state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderDashboard();
      renderOrdersTable();
    }
  );
  onSnapshot(collection(db, "vendors"), (snap) => {
    state.vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderVendors();
    renderVendorDropdown(); // Update dropdown di modal banner
  });
  onSnapshot(collection(db, "auto_replies"), (snap) => {
    state.replies = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderReplies();
  });
  // Listen Banners
  onSnapshot(collection(db, "banners"), (snap) => {
    state.banners = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBanners();
  });
}

// --- DASHBOARD & ORDERS ---
function renderDashboard() {
  $("#kpiOrders").textContent = state.orders.length;
  $("#kpiRevenue").textContent = rupiah(
    state.orders.reduce((a, b) => a + (b.total || 0), 0)
  );
  $("#latestOrders").innerHTML = state.orders
    .slice(0, 5)
    .map(
      (o) =>
        `<div class="item"><div><div style="font-weight:700">${
          o.vendorName
        }</div><div class="muted" style="font-size:12px">${new Date(
          o.createdAt
        ).toLocaleTimeString()} • ${
          o.userName
        }</div></div><div style="text-align:right"><div style="font-weight:700; color:var(--orange)">${rupiah(
          o.total
        )}</div><small class="pill">${o.status}</small></div></div>`
    )
    .join("");
}
function renderOrdersTable() {
  $(
    "#ordersTable"
  ).innerHTML = `<table><thead><tr><th>Waktu</th><th>User</th><th>Vendor</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${state.orders
    .map(
      (o) =>
        `<tr><td>${new Date(o.createdAt).toLocaleString()}</td><td>${
          o.userName
        }</td><td>${o.vendorName}</td><td><b>${rupiah(
          o.total
        )}</b></td><td><span class="pill">${
          o.status
        }</span></td><td><button class="btn small ghost" onclick="openOrd('${
          o.id
        }')">Edit</button> <button class="btn small" onclick="deleteOrd('${
          o.id
        }')" style="color:red; border-color:#fee">🗑</button></td></tr>`
    )
    .join("")}</tbody></table>`;
}
window.openOrd = (id) => {
  state.selectedOrderId = id;
  const o = state.orders.find((x) => x.id === id);
  $("#ordStatus").value = o.status;
  $("#ordItems").innerHTML =
    o.items
      .map(
        (i) =>
          `<div class="rowBetween" style="margin-bottom:6px"><span>${
            i.name
          } <small>x${i.qty}</small></span><span>${rupiah(
            i.price * i.qty
          )}</span></div>`
      )
      .join("") +
    `<hr style="margin:10px 0; border:none; border-top:1px dashed #ccc"><div class="rowBetween"><b>Total</b><b>${rupiah(
      o.total
    )}</b></div>`;
  $("#orderModal").classList.remove("hidden");
};
$("#saveStatusBtn").addEventListener("click", async () => {
  await updateDoc(doc(db, "orders", state.selectedOrderId), {
    status: $("#ordStatus").value,
  });
  $("#orderModal").classList.add("hidden");
});
window.deleteOrd = async (id) => {
  if (confirm("Hapus?")) await deleteDoc(doc(db, "orders", id));
};

// --- VENDORS ---
function renderVendors() {
  $("#vendorAdminList").innerHTML = state.vendors
    .map(
      (v) =>
        `<div class="item"><div><div style="font-weight:700">${
          v.name
        }</div><div class="muted" style="font-size:12px">${v.type.toUpperCase()} • Rating ${
          v.rating || 0
        }</div></div><div style="display:flex; gap:6px;"><button class="btn small ghost" onclick="openEditVendor('${
          v.id
        }')">Edit</button><button class="btn small" style="color:red; border:1px solid #fee" onclick="deleteVendor('${
          v.id
        }')">Hapus</button></div></div>`
    )
    .join("");
}
$("#addVendorBtn").addEventListener("click", async () => {
  const n = prompt("Nama Vendor:");
  if (n)
    await addDoc(collection(db, "vendors"), {
      name: n,
      type: "bakso",
      ico: "🥘",
      rating: 4.5,
      busy: "Sepi",
      lat: -6.2,
      lon: 106.8,
    });
});
window.openEditVendor = (id) => {
  state.selectedVendorId = id;
  const v = state.vendors.find((x) => x.id === id);
  if (!v) return;
  $("#evName").value = v.name;
  $("#evType").value = v.type;
  $("#evRating").value = v.rating || 0;
  $("#editVendorModal").classList.remove("hidden");
};
$("#editVendorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await updateDoc(doc(db, "vendors", state.selectedVendorId), {
    name: $("#evName").value,
    type: $("#evType").value,
    rating: parseFloat($("#evRating").value),
  });
  $("#editVendorModal").classList.add("hidden");
  showToast("Vendor updated!", "success");
});
window.deleteVendor = async (id) => {
  if (confirm("Yakin hapus vendor?")) await deleteDoc(doc(db, "vendors", id));
};

// --- BANNERS (BARU) ---
function renderVendorDropdown() {
  $("#bnVendor").innerHTML =
    `<option value="">-- Info Umum (Tanpa Link) --</option>` +
    state.vendors
      .map((v) => `<option value="${v.id}">${v.name}</option>`)
      .join("");
}

function renderBanners() {
  $("#bannerList").innerHTML = state.banners
    .map(
      (b) => `
    <div style="border-radius:16px; overflow:hidden; border:1px solid #eee; position:relative; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
      <div style="background:${
        b.c
      }; padding:16px; color:white; height:120px; display:flex; flex-direction:column; justify-content:center;">
        <span style="font-size:10px; background:rgba(0,0,0,0.2); width:fit-content; padding:2px 8px; border-radius:10px; margin-bottom:4px;">
          ${b.vName || "Info Umum"}
        </span>
        <h3 style="margin:0; font-size:18px;">${b.t}</h3>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9">${b.d}</p>
      </div>
      <button onclick="deleteBanner('${
        b.id
      }')" style="position:absolute; top:10px; right:10px; background:white; color:red; border:none; width:28px; height:28px; border-radius:50%; cursor:pointer; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.2);">✕</button>
    </div>
  `
    )
    .join("");
}

// 3. Open Modal
$("#addBannerBtn").addEventListener("click", () => {
  renderVendorDropdown();
  $("#bannerModal").classList.remove("hidden");
  // Reset Preview ke default
  $("#bnTitle").value = "";
  $("#bnDesc").value = "";
  $("#bnVendor").value = "";
  updatePreviewText();
});

// --- INTERACTIVE PREVIEW LOGIC ---

// Update Teks Preview saat mengetik
window.updatePreviewText = () => {
  const t = $("#bnTitle").value || "Judul Promo";
  const d = $("#bnDesc").value || "Keterangan singkat...";
  const vId = $("#bnVendor").value;

  $("#prevTitle").textContent = t;
  $("#prevDesc").textContent = d;

  if (vId) {
    const v = state.vendors.find((x) => x.id === vId);
    $("#prevVendor").textContent = "Promosi: " + (v ? v.name : "Vendor");
  } else {
    $("#prevVendor").textContent = "Info Promo";
  }
};

// Switch Tab (Template vs Custom)
window.switchColorTab = (mode) => {
  const tabs = $$(".tab-btn");
  if (mode === "template") {
    tabs[0].classList.add("active");
    tabs[1].classList.remove("active");
    $("#tabColorTemplate").classList.remove("hidden");
    $("#tabColorCustom").classList.add("hidden");
  } else {
    tabs[1].classList.add("active");
    tabs[0].classList.remove("active");
    $("#tabColorTemplate").classList.add("hidden");
    $("#tabColorCustom").classList.remove("hidden");
    // Apply current custom colors
    updateCustomGradient();
  }
};

// Handle Preset Click
window.selectPreset = (el) => {
  const bg = el.style.background;
  $("#bannerPreview").style.background = bg;
  $("#finalColor").value = bg; // Simpan ke hidden input

  // Visual feedback border
  $$(".preset-item").forEach((i) => (i.style.border = "2px solid transparent"));
  el.style.border = "2px solid #333";
};

// Handle Custom Color Input
window.updateCustomGradient = () => {
  const c1 = $("#color1").value;
  const c2 = $("#color2").value;
  const grad = `linear-gradient(135deg, ${c1}, ${c2})`;

  $("#bannerPreview").style.background = grad;
  $("#finalColor").value = grad;
};

// 4. Submit Form
$("#bannerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const vid = $("#bnVendor").value;
  const v = state.vendors.find((x) => x.id === vid);

  await addDoc(collection(db, "banners"), {
    t: $("#bnTitle").value,
    d: $("#bnDesc").value,
    c: $("#finalColor").value, // Ambil dari hidden input yg diupdate preview
    vid: vid || null,
    vName: v ? v.name : null,
    createdAt: Date.now(),
  });

  $("#bannerModal").classList.add("hidden");
  showToast("Banner aktif!", "success");
});

window.deleteBanner = async (id) => {
  if (confirm("Hapus iklan ini?")) await deleteDoc(doc(db, "banners", id));
};

// --- REPLIES & UTILS ---
function renderReplies() {
  $("#replyList").innerHTML = state.replies
    .map(
      (r) =>
        `<div class="item"><div style="flex:1">"${r.text}"</div><button class="btn small" onclick="deleteReply('${r.id}')" style="color:red; border-color:#fee">Hapus</button></div>`
    )
    .join("");
}
$("#addReplyBtn").addEventListener("click", async () => {
  const t = prompt("Kata-kata:");
  if (t) await addDoc(collection(db, "auto_replies"), { text: t });
});
window.deleteReply = async (id) => {
  if (confirm("Hapus?")) await deleteDoc(doc(db, "auto_replies", id));
};
function showToast(msg, type = "info") {
  let c = $(".toast-container");
  if (!c) {
    c = document.createElement("div");
    c.className = "toast-container";
    document.body.appendChild(c);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
$$("[data-close]").forEach((b) =>
  b.addEventListener("click", () =>
    $("#" + b.dataset.close).classList.add("hidden")
  )
);
