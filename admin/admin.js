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
  replies: [], // State baru untuk reply
  selectedOrderId: null,
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
    alert("Salah. (admin/admin123)");
  }
});
$("#adminLogoutBtn").addEventListener("click", () => location.reload());

// --- DATA LISTENER ---
function boot() {
  // Listen Orders
  const qOrd = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  onSnapshot(qOrd, (snap) => {
    state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderDashboard();
    renderOrdersTable();
  });

  // Listen Vendors
  onSnapshot(collection(db, "vendors"), (snap) => {
    state.vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderVendors();
  });

  // Listen Auto Replies (BARU)
  onSnapshot(collection(db, "auto_replies"), (snap) => {
    state.replies = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderReplies();
  });
}

// --- DASHBOARD ---
function renderDashboard() {
  $("#kpiOrders").textContent = state.orders.length;
  $("#kpiRevenue").textContent = rupiah(
    state.orders.reduce((a, b) => a + (b.total || 0), 0)
  );

  const latest = state.orders.slice(0, 5);
  $("#latestOrders").innerHTML = latest
    .map(
      (o) => `
    <div class="item">
      <div>
        <b>${o.vendorName}</b>
        <div class="muted">${new Date(o.createdAt).toLocaleTimeString()} • ${
        o.userName
      }</div>
      </div>
      <div>
        <div class="price">${rupiah(o.total)}</div>
        <small class="pill">${o.status}</small>
      </div>
    </div>
  `
    )
    .join("");
}

// --- ORDERS ---
function renderOrdersTable() {
  const formatItems = (items) => {
    if (!items || !items.length) return "-";
    return items.map((i) => `${i.qty}x ${i.name}`).join(", ");
  };

  $("#ordersTable").innerHTML = `
    <table style="width:100%; border-collapse: collapse;">
      <thead>
        <tr style="background:#f5f5f5; text-align:left;">
          <th style="padding:10px;">Waktu & User</th>
          <th style="padding:10px;">Vendor</th>
          <th style="padding:10px;">Menu Pesanan</th>
          <th style="padding:10px;">Total</th>
          <th style="padding:10px;">Status</th>
          <th style="padding:10px;">Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${state.orders
          .map(
            (o) => `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px;">
              <div>${new Date(o.createdAt).toLocaleString()}</div>
              <small class="muted">${o.userName}</small>
            </td>
            <td style="padding:10px;">${o.vendorName}</td>
            <td style="padding:10px;">
              <div style="font-size:13px; color:#444; max-width:250px; line-height:1.4;">
                ${formatItems(o.items)}
              </div>
              ${
                o.note
                  ? `<div style="font-size:11px; color:orange; margin-top:4px;">Catatan: ${o.note}</div>`
                  : ""
              }
            </td>
            <td style="padding:10px;"><b>${rupiah(o.total)}</b></td>
            <td style="padding:10px;"><span class="pill">${o.status}</span></td>
            <td style="padding:10px;">
              <div style="display:flex; gap:6px;">
                <button class="btn small ghost" onclick="openOrd('${
                  o.id
                }')">Status</button>
                <button class="btn small" onclick="deleteOrd('${
                  o.id
                }')" style="background:#fff0f0; border:1px solid #ffcccc; color:red;">Hapus</button>
              </div>
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

window.openOrd = (id) => {
  state.selectedOrderId = id;
  const o = state.orders.find((x) => x.id === id);
  $("#ordStatus").value = o.status;

  $("#ordItems").innerHTML = `
    <div style="background:#fafafa; padding:10px; border-radius:8px;">
      ${o.items
        .map(
          (i) => `
        <div class="rowBetween" style="margin-bottom:6px;">
          <span>${i.name} <small>x${i.qty}</small></span>
          <span>${rupiah(i.price * i.qty)}</span>
        </div>
      `
        )
        .join("")}
      <hr style="border:none; border-top:1px dashed #ddd; margin:8px 0;">
      <div class="rowBetween">
        <b>Total</b>
        <b>${rupiah(o.total)}</b>
      </div>
    </div>
  `;
  $("#orderModal").classList.remove("hidden");
};

window.deleteOrd = async (id) => {
  if (confirm("Yakin ingin menghapus order ini selamanya?")) {
    await deleteDoc(doc(db, "orders", id));
  }
};

$("#saveStatusBtn").addEventListener("click", async () => {
  const st = $("#ordStatus").value;
  await updateDoc(doc(db, "orders", state.selectedOrderId), { status: st });
  $("#orderModal").classList.add("hidden");
});

$$("[data-close]").forEach((b) =>
  b.addEventListener("click", () =>
    $("#" + b.dataset.close).classList.add("hidden")
  )
);

// --- VENDORS ---
function renderVendors() {
  $("#vendorAdminList").innerHTML = state.vendors
    .map(
      (v) => `
    <div class="item">
      <div><b>${v.name}</b> <div class="muted">${v.type}</div></div>
      <div class="muted">${v.lat.toFixed(4)}</div>
    </div>
  `
    )
    .join("");
}

$("#addVendorBtn").addEventListener("click", async () => {
  const name = prompt("Nama Vendor:");
  if (name) {
    await addDoc(collection(db, "vendors"), {
      name,
      type: "bakso",
      ico: "🥘",
      rating: 4.5,
      busy: "Sepi",
      lat: -6.2 + Math.random() * 0.01,
      lon: 106.81 + Math.random() * 0.01,
    });
  }
});

// --- AUTO REPLIES (FUNGSI BARU) ---
function renderReplies() {
  const list = $("#replyList");
  if (!state.replies.length) {
    list.innerHTML = `<div class="muted">Belum ada kata-kata balasan. Tambahkan dulu.</div>`;
    return;
  }
  list.innerHTML = state.replies
    .map(
      (r) => `
    <div class="item">
      <div style="flex:1">"${r.text}"</div>
      <div style="display:flex; gap:6px;">
        <button class="btn small ghost" onclick="editReply('${r.id}', '${r.text}')">Edit</button>
        <button class="btn small" onclick="deleteReply('${r.id}')" style="color:red; border-color:#ffcccc;">Hapus</button>
      </div>
    </div>
  `
    )
    .join("");
}

$("#addReplyBtn").addEventListener("click", async () => {
  const txt = prompt("Masukkan kalimat balasan otomatis:");
  if (txt) {
    await addDoc(collection(db, "auto_replies"), { text: txt });
  }
});

window.editReply = async (id, oldText) => {
  const newTxt = prompt("Edit balasan:", oldText);
  if (newTxt && newTxt !== oldText) {
    await updateDoc(doc(db, "auto_replies", id), { text: newTxt });
  }
};

window.deleteReply = async (id) => {
  if (confirm("Hapus balasan ini?")) {
    await deleteDoc(doc(db, "auto_replies", id));
  }
};

// Tab Switching
$$(".sbItem").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".sbItem").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab" + b.dataset.tab).classList.remove("hidden");
    $("#pageTitle").textContent =
      b.dataset.tab === "Replies" ? "Auto Reply Settings" : b.dataset.tab;
  })
);
