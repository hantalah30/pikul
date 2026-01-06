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
  selectedOrderId: null,
  firstLoad: true,
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
function playSound() {
  new Audio(
    "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"
  )
    .play()
    .catch((e) => {});
}

$("#adminLoginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (
    $("#adminUser").value === "admin" &&
    $("#adminPass").value === "admin123"
  ) {
    $("#adminAuth").classList.add("hidden");
    $("#adminApp").classList.remove("hidden");
    boot();
  } else alert("Salah");
});
$("#adminLogoutBtn").addEventListener("click", () => location.reload());

function boot() {
  onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc")),
    (snap) => {
      if (!state.firstLoad) {
        snap.docChanges().forEach((c) => {
          if (c.type === "added") {
            showToast(`🔔 Order Baru: ${c.doc.data().vendorName}`, "success");
            playSound();
          }
        });
      }
      state.firstLoad = false;
      state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderDashboard();
      renderOrdersTable();
    }
  );
  onSnapshot(collection(db, "vendors"), (s) => {
    state.vendors = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderVendors();
  });
  onSnapshot(collection(db, "auto_replies"), (s) => {
    state.replies = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderReplies();
  });
}

function renderDashboard() {
  $("#kpiOrders").textContent = state.orders.length;
  $("#kpiRevenue").textContent = rupiah(
    state.orders.reduce((a, b) => a + (b.total || 0), 0)
  );
  $("#latestOrders").innerHTML = state.orders
    .slice(0, 5)
    .map(
      (o) =>
        `<div class="item"><div><b>${
          o.vendorName
        }</b><div class="muted">${new Date(
          o.createdAt
        ).toLocaleTimeString()} • ${
          o.userName
        }</div></div><div><div class="price">${rupiah(
          o.total
        )}</div><small class="pill">${o.status}</small></div></div>`
    )
    .join("");
}

function renderOrdersTable() {
  const formatItems = (items) =>
    (items || []).map((i) => `${i.qty}x ${i.name}`).join(", ");
  $("#ordersTable").innerHTML = `
    <table style="width:100%; border-collapse: collapse;">
      <thead><tr style="background:#f5f5f5; text-align:left;"><th style="padding:10px;">Waktu & User</th><th style="padding:10px;">Vendor</th><th style="padding:10px;">Menu</th><th style="padding:10px;">Total</th><th style="padding:10px;">Status</th><th style="padding:10px;">Aksi</th></tr></thead>
      <tbody>${state.orders
        .map(
          (o) => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px;"><div>${new Date(
            o.createdAt
          ).toLocaleString()}</div><small class="muted">${
            o.userName
          }</small></td>
          <td style="padding:10px;">${o.vendorName}</td>
          <td style="padding:10px;"><div style="font-size:13px; color:#444; max-width:250px;">${formatItems(
            o.items
          )}</div>${
            o.note
              ? `<div style="font-size:11px;color:orange">Note: ${o.note}</div>`
              : ""
          }${
            o.rating
              ? `<div style="font-size:11px;color:#10b981">⭐ ${o.rating}</div>`
              : ""
          }</td>
          <td style="padding:10px;"><b>${rupiah(o.total)}</b></td>
          <td style="padding:10px;"><span class="pill">${o.status}</span></td>
          <td style="padding:10px;"><div style="display:flex; gap:6px;">
            <button class="btn small ghost" onclick="openOrd('${
              o.id
            }')">Edit</button>
            <button class="btn small" onclick="printOrd('${
              o.id
            }')" style="background:#eef; color:#33d; border:1px solid #ccf;">Print</button>
            <button class="btn small" onclick="deleteOrd('${
              o.id
            }')" style="background:#fff0f0; color:red; border:1px solid #fcc;">Hapus</button>
          </div></td>
        </tr>`
        )
        .join("")}</tbody>
    </table>
  `;
}

window.openOrd = (id) => {
  state.selectedOrderId = id;
  const o = state.orders.find((x) => x.id === id);
  $("#ordStatus").value = o.status;
  $("#ordItems").innerHTML = o.items
    .map(
      (i) =>
        `<div class="rowBetween"><span>${i.name} x${i.qty}</span><span>${rupiah(
          i.price * i.qty
        )}</span></div>`
    )
    .join("");
  $("#orderModal").classList.remove("hidden");
};
$("#saveStatusBtn").addEventListener("click", async () => {
  await updateDoc(doc(db, "orders", state.selectedOrderId), {
    status: $("#ordStatus").value,
  });
  $("#orderModal").classList.add("hidden");
  showToast("Updated", "success");
});
window.deleteOrd = async (id) => {
  if (confirm("Hapus?")) await deleteDoc(doc(db, "orders", id));
};

// --- FUNGSI PRINT STRUK ---
window.printOrd = (id) => {
  const o = state.orders.find((x) => x.id === id);
  const win = window.open("", "Print", "width=400,height=600");
  const itemsHtml = o.items
    .map(
      (i) => `
    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
      <span>${i.qty}x ${i.name}</span> <span>${rupiah(i.price * i.qty)}</span>
    </div>
  `
    )
    .join("");

  win.document.write(`
    <html><head><title>Struk - ${o.id}</title></head>
    <body style="font-family:monospace; padding:20px; max-width:300px; margin:0 auto;">
      <h2 style="text-align:center; margin-bottom:0;">PIKUL</h2>
      <p style="text-align:center; margin-top:0;">Struk Pesanan</p>
      <hr style="border-top:1px dashed #000;"/>
      <div><b>Vendor:</b> ${o.vendorName}</div>
      <div><b>Customer:</b> ${o.userName}</div>
      <div><b>Waktu:</b> ${new Date(o.createdAt).toLocaleString()}</div>
      <hr style="border-top:1px dashed #000;"/>
      ${itemsHtml}
      <hr style="border-top:1px dashed #000;"/>
      <div style="display:flex; justify-content:space-between; font-size:18px;">
        <b>TOTAL</b> <b>${rupiah(o.total)}</b>
      </div>
      <p style="text-align:center; margin-top:20px; font-size:12px;">Terima kasih!</p>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 500);
};

// --- VENDORS & REPLIES ---
function renderVendors() {
  $("#vendorAdminList").innerHTML = state.vendors
    .map(
      (v) =>
        `<div class="item"><div><b>${v.name}</b><div class="muted">${
          v.type
        }</div></div><div style="text-align:right"><div class="muted">Rating ${
          v.rating ? v.rating.toFixed(1) : 0
        }</div></div></div>`
    )
    .join("");
}
$("#addVendorBtn").addEventListener("click", async () => {
  const n = prompt("Nama:");
  if (n)
    await addDoc(collection(db, "vendors"), {
      name: n,
      type: "bakso",
      ico: "🥘",
      rating: 0,
      countRating: 0,
      busy: "Sepi",
      lat: -6.2 + Math.random() * 0.01,
      lon: 106.81 + Math.random() * 0.01,
    });
});
function renderReplies() {
  $("#replyList").innerHTML = state.replies
    .map(
      (r) =>
        `<div class="item"><div style="flex:1">"${r.text}"</div><div style="display:flex; gap:6px"><button class="btn small ghost" onclick="editReply('${r.id}','${r.text}')">Edit</button><button class="btn small" onclick="deleteReply('${r.id}')" style="color:red;border-color:#fcc">Hapus</button></div></div>`
    )
    .join("");
}
$("#addReplyBtn").addEventListener("click", async () => {
  const t = prompt("Balasan:");
  if (t) await addDoc(collection(db, "auto_replies"), { text: t });
});
window.editReply = async (id, old) => {
  const n = prompt("Edit:", old);
  if (n && n !== old) await updateDoc(doc(db, "auto_replies", id), { text: n });
};
window.deleteReply = async (id) => {
  if (confirm("Hapus?")) await deleteDoc(doc(db, "auto_replies", id));
};

$$("[data-close]").forEach((b) =>
  b.addEventListener("click", () =>
    $("#" + b.dataset.close).classList.add("hidden")
  )
);
$$(".sbItem").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".sbItem").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab" + b.dataset.tab).classList.remove("hidden");
    $("#pageTitle").textContent = b.dataset.tab;
  })
);
