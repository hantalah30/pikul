const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const LS = {
  admin: "pikul_admin",
  orders: "pikul_orders",
  vendors: "pikul_vendors",
  user: "pikul_user"
};

function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return fallback;
    return JSON.parse(raw);
  }catch{ return fallback; }
}
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

function rupiah(n){ return "Rp " + (n||0).toLocaleString("id-ID"); }
function uid(p="ID"){ return `${p}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }

let state = {
  admin: null,
  orders: [],
  vendors: [],
  selectedOrderId: null
};

/* ---------- AUTH ---------- */
function showAuth(){ $("#adminAuth").classList.remove("hidden"); $("#adminApp").classList.add("hidden"); }
function showApp(){ $("#adminAuth").classList.add("hidden"); $("#adminApp").classList.remove("hidden"); }

function initAuth(){
  const a = loadJSON(LS.admin, null);
  if(a){
    state.admin = a;
    showApp();
    boot();
  }else{
    showAuth();
  }
}

$("#adminLoginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const u = $("#adminUser").value.trim();
  const p = $("#adminPass").value.trim();
  if(u !== "admin" || p !== "admin123"){
    alert("Username/password salah. Demo: admin / admin123");
    return;
  }
  const admin = { id: uid("ADM"), username: "admin" };
  state.admin = admin;
  saveJSON(LS.admin, admin);
  showApp();
  boot();
});

$("#adminLogoutBtn").addEventListener("click", () => {
  if(confirm("Logout admin?")){
    localStorage.removeItem(LS.admin);
    state.admin = null;
    showAuth();
  }
});

/* ---------- NAV ---------- */
const tabs = {
  Dashboard: $("#tabDashboard"),
  Orders: $("#tabOrders"),
  Vendors: $("#tabVendors"),
  Settings: $("#tabSettings")
};

function setActiveTab(name){
  $$(".sbItem").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  Object.entries(tabs).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));

  $("#pageTitle").textContent = name;
  $("#pageSub").textContent =
    name === "Dashboard" ? "Ringkasan aktivitas PIKUL." :
    name === "Orders" ? "Kelola status pesanan." :
    name === "Vendors" ? "Daftar pedagang yang tampil di customer." :
    "Pengaturan & reset demo.";
}

$$(".sbItem").forEach(b => b.addEventListener("click", () => setActiveTab(b.dataset.tab)));

/* ---------- DATA ---------- */
function loadAll(){
  state.orders = loadJSON(LS.orders, []);
  state.vendors = loadJSON(LS.vendors, []);
}

function saveOrders(){
  saveJSON(LS.orders, state.orders);
}

/* ---------- DASHBOARD ---------- */
function renderDashboard(){
  const totalOrders = state.orders.length;
  const revenue = state.orders.reduce((s,o)=>s+(o.total||0),0);
  const process = state.orders.filter(o=>o.status==="Diproses").length;
  const done = state.orders.filter(o=>o.status==="Selesai").length;

  $("#kpiOrders").textContent = totalOrders;
  $("#kpiRevenue").textContent = rupiah(revenue);
  $("#kpiProcess").textContent = process;
  $("#kpiDone").textContent = done;

  const latest = state.orders.slice(0,6);
  const box = $("#latestOrders");
  if(!latest.length){
    box.innerHTML = `<div class="muted">Belum ada order.</div>`;
    return;
  }
  box.innerHTML = latest.map(o => `
    <div class="item" data-ord="${o.id}">
      <div>
        <b>${o.vendorName}</b>
        <div class="muted">${new Date(o.createdAt).toLocaleString("id-ID")} • ${o.userName}</div>
        <div class="muted">Status: <b>${o.status}</b></div>
      </div>
      <div class="price">${rupiah(o.total)}</div>
    </div>
  `).join("");

  box.querySelectorAll("[data-ord]").forEach(el => el.addEventListener("click", () => openOrder(el.dataset.ord)));
}

/* ---------- ORDERS TAB ---------- */
function renderOrdersTable(){
  const filter = $("#statusFilter").value;
  const orders = (filter === "ALL") ? state.orders : state.orders.filter(o => o.status === filter);

  const html = `
    <table>
      <thead>
        <tr>
          <th>Waktu</th>
          <th>User</th>
          <th>Vendor</th>
          <th>Total</th>
          <th>Status</th>
          <th>Metode</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(o => `
          <tr data-ord="${o.id}" style="cursor:pointer">
            <td>${new Date(o.createdAt).toLocaleString("id-ID")}</td>
            <td>${o.userName}</td>
            <td>${o.vendorName}</td>
            <td>${rupiah(o.total)}</td>
            <td><b>${o.status}</b></td>
            <td>${(o.method||"").toUpperCase()}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  $("#ordersTable").innerHTML = html;

  $("#ordersTable").querySelectorAll("[data-ord]").forEach(tr => {
    tr.addEventListener("click", () => openOrder(tr.dataset.ord));
  });
}

$("#statusFilter").addEventListener("change", () => {
  loadAll();
  renderOrdersTable();
});

/* ---------- ORDER MODAL ---------- */
function openModal(id){ $("#"+id).classList.remove("hidden"); }
function closeModal(id){ $("#"+id).classList.add("hidden"); }

document.body.addEventListener("click", (e) => {
  const c = e.target.getAttribute("data-close");
  if(c) closeModal(c);
});

function openOrder(id){
  state.selectedOrderId = id;
  const o = state.orders.find(x => x.id === id);
  if(!o) return;

  $("#ordTitle").textContent = `${o.vendorName} • ${o.id}`;
  $("#ordMeta").textContent = `${new Date(o.createdAt).toLocaleString("id-ID")} • ${o.userName} • ${rupiah(o.total)}`;

  $("#ordItems").innerHTML = (o.items||[]).map(it => `
    <div class="item">
      <div>
        <b>${it.name} × ${it.qty}</b>
        <div class="muted">${rupiah(it.price)} / item</div>
      </div>
      <div class="price">${rupiah(it.price * it.qty)}</div>
    </div>
  `).join("");

  $("#ordStatus").value = o.status || "Diproses";
  openModal("orderModal");
}

$("#saveStatusBtn").addEventListener("click", () => {
  const id = state.selectedOrderId;
  const status = $("#ordStatus").value;

  state.orders = state.orders.map(o => o.id === id ? { ...o, status } : o);
  saveOrders();
  closeModal("orderModal");

  loadAll();
  renderDashboard();
  renderOrdersTable();
});

/* ---------- VENDORS TAB ---------- */
function renderVendors(){
  const box = $("#vendorAdminList");
  if(!state.vendors.length){
    box.innerHTML = `<div class="muted">Belum ada vendor (seed dari customer akan muncul setelah dibuka).</div>`;
    return;
  }
  box.innerHTML = state.vendors.map(v => `
    <div class="item">
      <div>
        <b>${v.ico} ${v.name}</b>
        <div class="muted">${v.type.toUpperCase()} • Rating ${v.rating} • ${v.busy}</div>
      </div>
      <div class="muted">${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}</div>
    </div>
  `).join("");
}

$("#addVendorBtn").addEventListener("click", () => {
  // tambah vendor dummy cepat
  const v = {
    id: uid("V"),
    name: "Vendor Baru",
    type: "kopi",
    ico: "☕",
    rating: 4.4,
    busy: "Sedang",
    lat: -6.2 + (Math.random()-0.5)*0.01,
    lon: 106.81 + (Math.random()-0.5)*0.01,
  };
  state.vendors.unshift(v);
  saveJSON(LS.vendors, state.vendors);
  renderVendors();
  alert("Vendor dummy ditambahkan. (Buka customer → refresh vendor)");
});

/* ---------- SETTINGS ---------- */
$("#resetDataBtn").addEventListener("click", () => {
  if(confirm("Reset semua data localStorage? (orders/vendors/user)")){
    localStorage.removeItem(LS.orders);
    localStorage.removeItem(LS.vendors);
    localStorage.removeItem(LS.user);
    alert("Berhasil reset. Customer & Admin kembali kosong.");
    loadAll();
    renderDashboard();
    renderOrdersTable();
    renderVendors();
  }
});

$("#refreshAdminBtn").addEventListener("click", () => {
  loadAll();
  renderDashboard();
  renderOrdersTable();
  renderVendors();
});

/* ---------- BOOT ---------- */
function boot(){
  loadAll();
  setActiveTab("Dashboard");
  renderDashboard();
  renderOrdersTable();
  renderVendors();
}

initAuth();
