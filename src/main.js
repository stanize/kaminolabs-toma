/* =========================================================
   Supabase config comes from Vercel environment variables:
     VITE_SUPABASE_URL
     VITE_SUPABASE_ANON_KEY
   Set these in your Vercel project settings — no secrets live
   in this file. The anon key is safe to expose client-side;
   access is controlled by Postgres RLS policies (see schema.sql).
========================================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const TABLE = "toma_events";

const HAS_SUPABASE = SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

const TYPES = {
  pp: { label: "Pipí", glyph: "💧", color: "#e8b45c", soft: "#3a2f22" },
  ka: { label: "Popó", glyph: "💩", color: "#a97c5a", soft: "#34291f" },
  to: { label: "Toma", glyph: "🤱", color: "#e08a9b", soft: "#3a222a" },
  ba: { label: "Baño", glyph: "🛁", color: "#6fb8b0", soft: "#1e332f" },
};

let events = [];
let editingId = null;
let pendingType = null;

const $ = (sel) => document.querySelector(sel);
const overlay = $("#overlay");
const toast = $("#toast");

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1600);
}

function fmtDateHeader(){
  const d = new Date();
  $("#dateToday").textContent = d.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
}

function pad(n){ return String(n).padStart(2,'0'); }

function toLocalInputParts(date){
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function fromLocalInputParts(dateStr, timeStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  const [hh,mm] = timeStr.split(':').map(Number);
  return new Date(y, m-1, d, hh, mm, 0, 0);
}

function relTime(iso){
  const now = new Date();
  const then = new Date(iso);
  const diffMs = now - then;
  const mins = Math.round(diffMs/60000);
  if (mins < 1) return "justo ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `hace ${hrs} h ${mins%60}m`;
  const days = Math.floor(hrs/24);
  return `hace ${days} d`;
}

function fmtEntryDate(iso){
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const timeStr = d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
  if (isToday) return `Hoy · ${timeStr}`;
  return `${d.toLocaleDateString('es-ES', { day:'2-digit', month:'short' })} · ${timeStr}`;
}

function renderLastByType(){
  Object.keys(TYPES).forEach(t => {
    const el = document.getElementById('last' + t[0].toUpperCase() + t.slice(1));
    const latest = events.filter(e => e.type === t).sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at))[0];
    el.textContent = latest ? relTime(latest.occurred_at) : "Sin registros";
  });
}

function renderLog(){
  const log = $("#log");
  const sorted = [...events].sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at));
  if (sorted.length === 0){
    log.innerHTML = `<div class="empty">Aún no hay registros.<br/>Toca un botón de arriba para empezar.</div>`;
    return;
  }
  log.innerHTML = sorted.slice(0, 60).map(e => {
    const meta = TYPES[e.type];
    return `<div class="entry" data-id="${e.id}">
      <span class="tag" style="background:${meta.soft};color:${meta.color}">${meta.glyph}</span>
      <div class="info">
        <div class="t">${meta.label}</div>
        <div class="d">${fmtEntryDate(e.occurred_at)}</div>
      </div>
      <div class="ago">${relTime(e.occurred_at)}</div>
    </div>`;
  }).join("");

  log.querySelectorAll('.entry').forEach(el => {
    el.addEventListener('click', () => openSheetForEdit(el.dataset.id));
  });
}

function renderAll(){ renderLastByType(); renderLog(); }

function openSheetForNew(type){
  editingId = null;
  pendingType = type;
  const meta = TYPES[type];
  $("#sheetTag").textContent = meta.glyph;
  $("#sheetTag").style.background = meta.soft;
  $("#sheetTag").style.color = meta.color;
  $("#sheetTitle").textContent = meta.label;
  $("#sheetSub").textContent = "Ajusta la fecha y hora si hace falta";
  $("#btnDelete").style.display = "none";
  const now = new Date();
  const parts = toLocalInputParts(now);
  $("#fDate").value = parts.date;
  $("#fTime").value = parts.time;
  overlay.classList.add("show");
}

function openSheetForEdit(id){
  const e = events.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  pendingType = e.type;
  const meta = TYPES[e.type];
  $("#sheetTag").textContent = meta.glyph;
  $("#sheetTag").style.background = meta.soft;
  $("#sheetTag").style.color = meta.color;
  $("#sheetTitle").textContent = meta.label;
  $("#sheetSub").textContent = "Editar registro";
  $("#btnDelete").style.display = "block";
  const parts = toLocalInputParts(new Date(e.occurred_at));
  $("#fDate").value = parts.date;
  $("#fTime").value = parts.time;
  overlay.classList.add("show");
}

function closeSheet(){
  overlay.classList.remove("show");
  editingId = null;
  pendingType = null;
}

document.querySelectorAll('.btn-track').forEach(btn => {
  btn.addEventListener('click', () => openSheetForNew(btn.dataset.type));
});

$("#btnCancel").addEventListener('click', closeSheet);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });

document.querySelectorAll('.quick').forEach(q => {
  q.addEventListener('click', () => {
    const mins = parseInt(q.dataset.mins, 10);
    const d = new Date(Date.now() + mins*60000);
    const parts = toLocalInputParts(d);
    $("#fDate").value = parts.date;
    $("#fTime").value = parts.time;
  });
});

$("#btnConfirm").addEventListener('click', async () => {
  const dateStr = $("#fDate").value;
  const timeStr = $("#fTime").value;
  if (!dateStr || !timeStr){ showToast("Falta fecha u hora"); return; }
  const occurred = fromLocalInputParts(dateStr, timeStr);
  const iso = occurred.toISOString();

  if (editingId){
    await updateEvent(editingId, iso);
    showToast("Registro actualizado");
  } else {
    await createEvent(pendingType, iso);
    showToast(`${TYPES[pendingType].label} registrado`);
  }
  closeSheet();
  renderAll();
});

$("#btnDelete").addEventListener('click', async () => {
  if (!editingId) return;
  await deleteEvent(editingId);
  showToast("Registro eliminado");
  closeSheet();
  renderAll();
});

async function sbRequest(path, options = {}){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {})
    }
  });
  if (!res.ok){
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadEvents(){
  if (!HAS_SUPABASE){
    events = [];
    return;
  }
  try{
    const rows = await sbRequest(`${TABLE}?select=id,type,occurred_at&order=occurred_at.desc&limit=200`);
    events = rows || [];
  } catch(err){
    console.error(err);
    showToast("No se pudo conectar a Supabase");
  }
}

async function createEvent(type, iso){
  const local = { id: 'tmp-' + Date.now(), type, occurred_at: iso };
  events.push(local);
  if (!HAS_SUPABASE) return;
  try{
    const rows = await sbRequest(TABLE, {
      method: "POST",
      body: JSON.stringify([{ type, occurred_at: iso }])
    });
    const idx = events.findIndex(e => e.id === local.id);
    if (idx >= 0 && rows && rows[0]) events[idx] = rows[0];
  } catch(err){
    console.error(err);
    showToast("Guardado local (sin conexión)");
  }
}

async function updateEvent(id, iso){
  const idx = events.findIndex(e => e.id === id);
  if (idx >= 0) events[idx].occurred_at = iso;
  if (!HAS_SUPABASE || id.startsWith('tmp-')) return;
  try{
    await sbRequest(`${TABLE}?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ occurred_at: iso })
    });
  } catch(err){
    console.error(err);
    showToast("No se pudo sincronizar el cambio");
  }
}

async function deleteEvent(id){
  events = events.filter(e => e.id !== id);
  if (!HAS_SUPABASE || id.startsWith('tmp-')) return;
  try{
    await sbRequest(`${TABLE}?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
  } catch(err){
    console.error(err);
    showToast("No se pudo eliminar en el servidor");
  }
}

function renderSetupNote(){
  const note = document.getElementById('setupNote');
  const dot = document.getElementById('connDot');
  const label = document.getElementById('connLabel');
  if (!HAS_SUPABASE){
    note.innerHTML = `<div class="setup-note">
      Falta configurar Supabase: define <code>VITE_SUPABASE_URL</code> y
      <code>VITE_SUPABASE_ANON_KEY</code> en las variables de entorno de
      Vercel (Project Settings → Environment Variables) y vuelve a
      desplegar. Mientras tanto, los registros solo viven en esta sesión.
    </div>`;
    dot.classList.add('off');
    label.textContent = 'sin conectar';
  } else {
    note.remove();
    label.textContent = 'sincronizado';
  }
}

(async function boot(){
  fmtDateHeader();
  renderSetupNote();
  await loadEvents();
  renderAll();
  setInterval(renderAll, 60000);
})();
