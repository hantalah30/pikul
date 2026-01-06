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
// Pastikan path ini sesuai dengan struktur folder kamu
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
  selectedOrderId: null,
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
    alert("Salah. (admin/admin123)");
  }
});
$("#adminLogoutBtn").addEventListener("click", () => location.reload());

// --- TAB NAVIGATION ---
$$(".sbItem").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".sbItem").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab" + b.dataset.tab).classList.remove("hidden");

    // Update Title di Header Desktop
    const title = $("#pageTitle");
    if (title) title.textContent = b.dataset.tab;
  })
);

// --- BOOT & LISTENERS ---
function boot() {
  // Orders
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderDashboard();
    renderOrdersTable();
  });

  // Vendors
  onSnapshot(collection(db, "vendors"), (snap) => {
    state.vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderVendors();
  });

  // Replies
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
    <div class="item" onclick="openOrd('${o.id}')" style="cursor:pointer">
      <div>
        <div style="font-weight:700">${o.vendorName}</div>
        <div class="muted" style="font-size:12px">${new Date(
          o.createdAt
        ).toLocaleTimeString()} • ${o.userName}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700; color:var(--orange)">${rupiah(
          o.total
        )}</div>
        <small class="pill">${o.status}</small>
      </div>
    </div>
  `
    )
    .join("");
}

// --- ORDERS ---
function renderOrdersTable() {
  $("#ordersTable").innerHTML = `
    <table>
      <thead><tr><th>Waktu</th><th>User</th><th>Vendor</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${state.orders
          .map(
            (o) => `
          <tr>
            <td>${new Date(o.createdAt).toLocaleString()}</td>
            <td>${o.userName}</td>
            <td>${o.vendorName}</td>
            <td><b>${rupiah(o.total)}</b></td>
            <td><span class="pill">${o.status}</span></td>
            <td>
              <button class="btn small ghost" onclick="openOrd('${
                o.id
              }')">Edit</button>
              <button class="btn small" onclick="deleteOrd('${
                o.id
              }')" style="color:red; border-color:#fee; background:#fff5f5">🗑</button>
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
  $("#ordItems").innerHTML =
    o.items
      .map(
        (i) => `
    <div class="rowBetween" style="margin-bottom:6px">
      <span>${i.name} <small>x${i.qty}</small></span>
      <span>${rupiah(i.price * i.qty)}</span>
    </div>
  `
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
  if (confirm("Hapus history order ini?"))
    await deleteDoc(doc(db, "orders", id));
};

// --- VENDORS ---
function renderVendors() {
  $("#vendorAdminList").innerHTML = state.vendors
    .map(
      (v) => `
    <div class="item">
      <div>
        <div style="font-weight:700">${v.name}</div>
        <div class="muted" style="font-size:12px">${v.type.toUpperCase()} • Rating ${
        v.rating ? v.rating.toFixed(1) : 0
      }</div>
      </div>
      <div class="muted" style="font-size:12px">${v.lat.toFixed(4)}</div>
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

// --- REPLIES ---
function renderReplies() {
  $("#replyList").innerHTML = state.replies
    .map(
      (r) => `
    <div class="item">
      <div style="flex:1">"${r.text}"</div>
      <button class="btn small" onclick="deleteReply('${r.id}')" style="color:red; border-color:#fee">Hapus</button>
    </div>
  `
    )
    .join("");
}

$("#addReplyBtn").addEventListener("click", async () => {
  const txt = prompt("Kata-kata balasan:");
  if (txt) await addDoc(collection(db, "auto_replies"), { text: txt });
});

window.deleteReply = async (id) => {
  if (confirm("Hapus?")) await deleteDoc(doc(db, "auto_replies", id));
};

// --- UTILS ---
$$("[data-close]").forEach((b) =>
  b.addEventListener("click", () =>
    $("#" + b.dataset.close).classList.add("hidden")
  )
);
