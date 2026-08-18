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
  to: { label: "Toma", glyph: "🤱", color: "#e08a9b", soft: "#3a222a" },
  bi: { label: "Biberón", glyph: "🍼", color: "#b79ce8", soft: "#2a2338" },
  pp: { label: "Pipí", glyph: "💧", color: "#e8b45c", soft: "#3a2f22" },
  ka: { label: "Popó", glyph: "💩", color: "#a97c5a", soft: "#34291f" },
  ba: { label: "Baño", glyph: "🛁", color: "#6fb8b0", soft: "#1e332f" },
};

// Types that count toward the "next feeding" countdown
const FEED_TYPES = ["to", "bi"];
const INTERVAL_KEY_DEFAULT = 3; // hours, in-memory only (no localStorage)
let feedIntervalHours = INTERVAL_KEY_DEFAULT;

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

function renderCountdown(){
  const feeds = events.filter(e => FEED_TYPES.includes(e.type))
    .sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at));
  const timeEl = $("#countdownTime");
  const subEl = $("#countdownSub");
  const labelEl = $("#countdownLabel");

  if (feeds.length === 0){
    timeEl.textContent = "—";
    timeEl.classList.remove("overdue");
    $("#countdownCard").classList.remove("overdue-alert");
    subEl.textContent = "Registra una toma o biberón para empezar";
    labelEl.textContent = "Próxima toma";
    return;
  }

  const last = new Date(feeds[0].occurred_at);
  const next = new Date(last.getTime() + feedIntervalHours * 3600000);
  const now = new Date();
  const diffMs = next - now;
  labelEl.textContent = "Próxima toma";

  if (diffMs <= 0){
    const overdueMin = Math.round(-diffMs/60000);
    timeEl.textContent = overdueMin < 60 ? `+${overdueMin} min` : `+${Math.floor(overdueMin/60)}h ${overdueMin%60}m`;
    timeEl.classList.add("overdue");
    $("#countdownCard").classList.add("overdue-alert");
    subEl.textContent = `Toca ya · cada ${feedIntervalHours}h · toca para ajustar`;
  } else {
    const mins = Math.round(diffMs/60000);
    const h = Math.floor(mins/60), m = mins%60;
    timeEl.textContent = h > 0 ? `${h}h ${m}m` : `${m} min`;
    timeEl.classList.remove("overdue");
    $("#countdownCard").classList.remove("overdue-alert");
    subEl.textContent = `Cada ${feedIntervalHours}h · toca para ajustar`;
  }
}

let logExpanded = false;

function renderLog(){
  const log = $("#log");
  const sorted = [...events].sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at));
  const toggleBtn = $("#btnToggleLog");
  if (sorted.length === 0){
    if (loadError){
      log.innerHTML = `<div class="empty">No se pudieron cargar los registros.<br/>Revisa el aviso de arriba.</div>`;
    } else {
      log.innerHTML = `<div class="empty">Aún no hay registros.<br/>Toca un botón de arriba para empezar.</div>`;
    }
    toggleBtn.style.display = "none";
    return;
  }

  const visible = logExpanded ? sorted : sorted.slice(0, 5);
  log.innerHTML = visible.map(e => {
    const meta = TYPES[e.type];
    const noteHtml = e.notes ? `<div class="n">${escapeHtml(e.notes)}</div>` : "";
    const durationHtml = e.duration_seconds ? ` · ${fmtClock(e.duration_seconds)}` : "";
    const mlHtml = e.ml_amount != null ? ` · ${e.ml_amount}ml` : "";
    return `<div class="entry" data-id="${e.id}">
      <span class="tag" style="background:${meta.soft};color:${meta.color}">${meta.glyph}</span>
      <div class="info">
        <div class="t">${meta.label}</div>
        <div class="d">${fmtEntryDate(e.occurred_at)}${durationHtml}${mlHtml}</div>
        ${noteHtml}
      </div>
      <div class="ago">${relTime(e.occurred_at)}</div>
    </div>`;
  }).join("");

  log.querySelectorAll('.entry').forEach(el => {
    el.addEventListener('click', () => openSheetForEdit(el.dataset.id));
  });

  if (sorted.length > 5){
    toggleBtn.style.display = "block";
    toggleBtn.textContent = logExpanded ? "Ver menos" : `Ver todos (${sorted.length})`;
  } else {
    toggleBtn.style.display = "none";
  }
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAll(){
  renderLastByType();
  renderLog();
  renderCountdown();
  const now = new Date();
  renderTimeline(new Date(now.getTime() - 7*86400000), now);
}

$("#btnToggleLog").addEventListener('click', () => {
  logExpanded = !logExpanded;
  renderLog();
});

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
  $("#fDurationRow").style.display = "none";
  $("#fMlRow").style.display = "none";
  const now = new Date();
  const parts = toLocalInputParts(now);
  $("#fDate").value = parts.date;
  $("#fTime").value = parts.time;
  $("#fNotes").value = "";
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
  $("#fNotes").value = e.notes || "";
  if (FEED_TYPES.includes(e.type)){
    $("#fDurationRow").style.display = "block";
    $("#fDurationLabel").textContent = e.type === "bi" ? "Duración (minutos, opcional)" : "Duración (minutos)";
    $("#fDuration").value = e.duration_seconds ? Math.round(e.duration_seconds/60) : "";
  } else {
    $("#fDurationRow").style.display = "none";
  }
  if (e.type === "bi"){
    $("#fMlRow").style.display = "block";
    $("#fMl").value = e.ml_amount != null ? e.ml_amount : "";
  } else {
    $("#fMlRow").style.display = "none";
  }
  overlay.classList.add("show");
}

function closeSheet(){
  overlay.classList.remove("show");
  editingId = null;
  pendingType = null;
}

document.querySelectorAll('.btn-track').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    if (FEED_TYPES.includes(type)){
      openTimerForNew(type);
    } else {
      openSheetForNew(type);
    }
  });
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
  const notes = $("#fNotes").value.trim();
  let durationSeconds = null;
  let mlAmount = null;
  if (editingId && FEED_TYPES.includes(pendingType)){
    const mins = parseFloat($("#fDuration").value);
    durationSeconds = (!isNaN(mins) && mins >= 0) ? Math.round(mins * 60) : null;
  }
  if (editingId && pendingType === "bi"){
    const ml = parseFloat($("#fMl").value);
    if (isNaN(ml) || ml < 0){ showToast("Indica la cantidad en ml"); return; }
    mlAmount = Math.round(ml);
  }

  if (editingId){
    await updateEvent(editingId, iso, notes, durationSeconds, mlAmount);
    showToast("Registro actualizado");
  } else {
    await createEvent(pendingType, iso, notes);
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

/* ---------- timer (start/stop) for Toma & Biberón ---------- */

const timerOverlay = $("#timerOverlay");
let timerState = null; // { type, startDate, tickId }
let pendingTimerType = null;
let manualMode = false;

function fmtClock(totalSeconds){
  const h = Math.floor(totalSeconds/3600);
  const m = Math.floor((totalSeconds%3600)/60);
  const s = totalSeconds%60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function openTimerForNew(type){
  timerState = null;
  pendingTimerType = type;
  manualMode = false;
  const meta = TYPES[type];
  $("#timerTag").textContent = meta.glyph;
  $("#timerTag").style.background = meta.soft;
  $("#timerTag").style.color = meta.color;
  $("#timerTitle").textContent = meta.label;
  $("#timerSub").textContent = "Elige la hora de inicio";
  $("#timerStartFields").style.display = "flex";
  $("#timerMlRow").style.display = type === "bi" ? "block" : "none";
  $("#timerManualDurationRow").style.display = "none";
  $("#timerDisplay").style.display = "none";
  $("#timerReviewRow").style.display = "none";
  $("#timerNotesRow").style.display = "block";
  $("#btnTimerManualToggle").style.display = "block";
  $("#btnTimerManualToggle").textContent = "Ya terminó · añadir duración manualmente";
  $("#btnTimerStart").style.display = "block";
  $("#btnTimerStart").textContent = "Iniciar";
  $("#btnTimerStop").style.display = "none";
  $("#btnTimerSaveReview").style.display = "none";
  $("#btnTimerCancel").textContent = "Cancelar";
  $("#tNotes").value = "";
  $("#tManualDuration").value = "";
  $("#tManualDurationLabel").textContent = type === "bi" ? "Duración (minutos, opcional)" : "Duración (minutos)";
  $("#tMl").value = "";

  const now = new Date();
  const parts = toLocalInputParts(now);
  $("#tStartDate").value = parts.date;
  $("#tStartTime").value = parts.time;

  timerOverlay.classList.add("show");
}

$("#btnTimerManualToggle").addEventListener('click', () => {
  manualMode = !manualMode;
  if (manualMode){
    $("#timerManualDurationRow").style.display = "block";
    $("#btnTimerManualToggle").textContent = "Volver al cronómetro en vivo";
    $("#btnTimerStart").textContent = "Guardar";
  } else {
    $("#timerManualDurationRow").style.display = "none";
    $("#btnTimerManualToggle").textContent = "Ya terminó · añadir duración manualmente";
    $("#btnTimerStart").textContent = "Iniciar";
  }
});

function tickTimer(){
  if (!timerState) return;
  const elapsedSec = Math.max(0, Math.round((Date.now() - timerState.startDate.getTime())/1000));
  $("#timerClock").textContent = fmtClock(elapsedSec);
}

function readMl(type){
  if (type !== "bi") return null;
  const val = parseFloat($("#tMl").value);
  if (isNaN(val) || val < 0) return undefined; // undefined = invalid/missing
  return Math.round(val);
}

$("#btnTimerStart").addEventListener('click', async () => {
  const dateStr = $("#tStartDate").value;
  const timeStr = $("#tStartTime").value;
  if (!dateStr || !timeStr){ showToast("Falta fecha u hora de inicio"); return; }
  const startDate = fromLocalInputParts(dateStr, timeStr);
  const type = pendingTimerType;

  const ml = readMl(type);
  if (type === "bi" && ml === undefined){ showToast("Indica la cantidad en ml"); return; }

  if (manualMode){
    const minsRaw = $("#tManualDuration").value;
    let durationSeconds = null;
    if (minsRaw.trim() !== ""){
      const mins = parseFloat(minsRaw);
      if (isNaN(mins) || mins < 0){ showToast("Duración inválida"); return; }
      durationSeconds = Math.round(mins * 60);
    } else if (type !== "bi"){
      showToast("Indica la duración en minutos");
      return;
    }
    const notes = $("#tNotes").value.trim();
    await createEvent(type, startDate.toISOString(), notes, durationSeconds, ml);
    const durLabel = durationSeconds != null ? ` · ${fmtClock(durationSeconds)}` : "";
    showToast(`${TYPES[type].label} registrado${durLabel}`);
    timerOverlay.classList.remove("show");
    renderAll();
    return;
  }

  timerState = { type, startDate, ml, tickId: null };
  $("#timerStartFields").style.display = "none";
  $("#timerMlRow").style.display = "none";
  $("#btnTimerManualToggle").style.display = "none";
  $("#timerDisplay").style.display = "block";
  $("#timerNotesRow").style.display = "block";
  $("#timerStartedAt").textContent = `Inicio: ${startDate.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}`;
  $("#btnTimerStart").style.display = "none";
  $("#btnTimerStop").style.display = "block";
  $("#btnTimerCancel").textContent = "Descartar";
  tickTimer();
  timerState.tickId = setInterval(tickTimer, 1000);
});

$("#btnTimerStop").addEventListener('click', () => {
  if (!timerState) return;
  clearInterval(timerState.tickId);
  const durationSeconds = Math.max(0, Math.round((Date.now() - timerState.startDate.getTime())/1000));
  timerState.finalDurationSeconds = durationSeconds;

  $("#timerSub").textContent = "Revisa la duración antes de guardar";
  $("#timerClock").textContent = fmtClock(durationSeconds);
  $("#timerReviewRow").style.display = "block";
  $("#tReviewDurationLabel").textContent = timerState.type === "bi"
    ? "Duración (minutos, opcional) · ajustar si hace falta"
    : "Duración (minutos) · ajustar si hace falta";
  $("#tReviewDuration").value = Math.round(durationSeconds/60);
  $("#btnTimerStop").style.display = "none";
  $("#btnTimerSaveReview").style.display = "block";
  $("#btnTimerCancel").textContent = "Descartar";
});

$("#btnTimerSaveReview").addEventListener('click', async () => {
  if (!timerState) return;
  const raw = $("#tReviewDuration").value;
  let durationSeconds;
  if (raw.trim() === "" && timerState.type === "bi"){
    durationSeconds = null;
  } else {
    const mins = parseFloat(raw);
    durationSeconds = (!isNaN(mins) && mins >= 0)
      ? Math.round(mins * 60)
      : timerState.finalDurationSeconds;
  }
  const type = timerState.type;
  const startDate = timerState.startDate;
  const notes = $("#tNotes").value.trim();
  const ml = timerState.ml ?? null;

  await createEvent(type, startDate.toISOString(), notes, durationSeconds, ml);
  const durLabel = durationSeconds != null ? ` · ${fmtClock(durationSeconds)}` : "";
  showToast(`${TYPES[type].label} registrado${durLabel}`);
  timerState = null;
  timerOverlay.classList.remove("show");
  renderAll();
});

$("#btnTimerCancel").addEventListener('click', () => {
  if (timerState) clearInterval(timerState.tickId);
  timerState = null;
  timerOverlay.classList.remove("show");
});

timerOverlay.addEventListener('click', (e) => {
  if (e.target === timerOverlay && !timerState){
    timerOverlay.classList.remove("show");
  }
});

/* ---------- interval editor ---------- */

const intervalOverlay = $("#intervalOverlay");

$("#countdownCard").addEventListener('click', () => {
  $("#intervalInput").value = feedIntervalHours;
  intervalOverlay.classList.add("show");
});
$("#btnIntervalCancel").addEventListener('click', () => intervalOverlay.classList.remove("show"));
intervalOverlay.addEventListener('click', (e) => { if (e.target === intervalOverlay) intervalOverlay.classList.remove("show"); });
$("#btnIntervalSave").addEventListener('click', () => {
  const v = parseFloat($("#intervalInput").value);
  if (!isNaN(v) && v > 0){
    feedIntervalHours = v;
    renderCountdown();
    showToast("Intervalo actualizado");
  }
  intervalOverlay.classList.remove("show");
});

/* ---------- report ---------- */

const reportOverlay = $("#reportOverlay");
const RANGE_LABELS = {
  today: "Hoy",
  yesterday: "Ayer",
  "6h": "Últimas 6 horas",
  "12h": "Últimas 12 horas",
  "24h": "Últimas 24 horas",
  all: "Informe completo"
};

function rangeStartEnd(rangeKey){
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rangeKey === "today"){
    return [startOfToday, new Date(startOfToday.getTime() + 86400000)];
  }
  if (rangeKey === "yesterday"){
    const start = new Date(startOfToday.getTime() - 86400000);
    return [start, startOfToday];
  }
  if (rangeKey === "6h"){
    return [new Date(now.getTime() - 6*3600000), now];
  }
  if (rangeKey === "12h"){
    return [new Date(now.getTime() - 12*3600000), now];
  }
  if (rangeKey === "24h"){
    return [new Date(now.getTime() - 24*3600000), now];
  }
  return [new Date(0), new Date(8640000000000000)]; // all
}

let currentReportRange = "today";

function renderReport(rangeKey){
  currentReportRange = rangeKey;
  const [start, end] = rangeStartEnd(rangeKey);
  $("#reportRangeLabel").textContent = RANGE_LABELS[rangeKey];

  $("#rangeList").querySelectorAll('.range-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === rangeKey);
  });

  const counts = {};
  Object.keys(TYPES).forEach(t => counts[t] = 0);
  events.forEach(e => {
    const t = new Date(e.occurred_at);
    if (t >= start && t < end) counts[e.type] = (counts[e.type] || 0) + 1;
  });

  const grid = $("#reportGrid");
  grid.innerHTML = Object.keys(TYPES).map(t => {
    const meta = TYPES[t];
    return `<div class="report-cell" data-type="${t}">
      <span class="tag" style="background:${meta.soft};color:${meta.color}">${meta.glyph}</span>
      <div>
        <div class="count">${counts[t]}</div>
        <div class="label">${meta.label}</div>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll('.report-cell').forEach(cell => {
    cell.addEventListener('click', () => openTypeDetail(cell.dataset.type));
  });
}

function dayKey(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function renderTimeline(start, end){
  const legend = $("#timelineLegend");
  legend.innerHTML = Object.keys(TYPES).map(t => {
    const meta = TYPES[t];
    return `<span class="item"><span class="dot" style="background:${meta.color}"></span>${meta.label}</span>`;
  }).join("");

  // Cap the number of day-rows shown for readability
  const MAX_DAYS = 14;
  const effectiveEnd = end > new Date() ? new Date() : end;
  let clampedStart = start;
  const spanDays = Math.ceil((effectiveEnd - start) / 86400000);
  if (spanDays > MAX_DAYS){
    clampedStart = new Date(effectiveEnd.getTime() - MAX_DAYS * 86400000);
  }

  const inRange = events.filter(e => {
    const t = new Date(e.occurred_at);
    return t >= clampedStart && t < end;
  });

  const daysMap = {}; // dayKey -> [events]
  inRange.forEach(e => {
    const d = new Date(e.occurred_at);
    const key = dayKey(d);
    if (!daysMap[key]) daysMap[key] = [];
    daysMap[key].push(e);
  });

  const dayKeys = Object.keys(daysMap).sort().reverse();
  const container = $("#timelineDays");

  if (dayKeys.length === 0){
    container.innerHTML = `<div class="timeline-empty">No hay eventos en este rango.</div>`;
    return;
  }

  const capNote = spanDays > MAX_DAYS
    ? `<div class="timeline-empty" style="padding:0 0 10px;">Mostrando los últimos ${MAX_DAYS} días</div>`
    : "";

  container.innerHTML = capNote + dayKeys.map(key => {
    const dayEvents = daysMap[key];
    const dLabel = new Date(key + "T00:00:00").toLocaleDateString('es-ES', { day:'2-digit', month:'short' });
    const marks = dayEvents.map(e => {
      const t = new Date(e.occurred_at);
      const minutesOfDay = t.getHours()*60 + t.getMinutes();
      const leftPct = (minutesOfDay / 1440) * 100;
      const meta = TYPES[e.type];
      if (FEED_TYPES.includes(e.type) && e.duration_seconds){
        const widthPct = Math.max((e.duration_seconds/60) / 1440 * 100, 0.6);
        return `<div class="timeline-mark" style="left:${leftPct}%; width:${widthPct}%; background:${meta.color};" title="${meta.label}"></div>`;
      }
      return `<div class="timeline-mark dot-mark" style="left:${leftPct}%; background:${meta.color};" title="${meta.label}"></div>`;
    }).join("");
    return `<div class="timeline-day">
      <div class="timeline-day-label">${dLabel}</div>
      <div class="timeline-track">${marks}</div>
    </div>`;
  }).join("");
}

$("#btnReport").addEventListener('click', () => {
  renderReport(currentReportRange);
  reportOverlay.classList.add("show");
});
$("#btnReportClose").addEventListener('click', () => reportOverlay.classList.remove("show"));
reportOverlay.addEventListener('click', (e) => { if (e.target === reportOverlay) reportOverlay.classList.remove("show"); });
$("#rangeList").querySelectorAll('.range-item').forEach(btn => {
  btn.addEventListener('click', () => renderReport(btn.dataset.range));
});

/* ---------- type detail (full list for one event type in current range) ---------- */

const typeDetailOverlay = $("#typeDetailOverlay");

function openTypeDetail(type){
  const meta = TYPES[type];
  const [start, end] = rangeStartEnd(currentReportRange);
  const filtered = events
    .filter(e => e.type === type && new Date(e.occurred_at) >= start && new Date(e.occurred_at) < end)
    .sort((a,b) => new Date(b.occurred_at) - new Date(a.occurred_at));

  $("#typeDetailTag").textContent = meta.glyph;
  $("#typeDetailTag").style.background = meta.soft;
  $("#typeDetailTag").style.color = meta.color;
  $("#typeDetailTitle").textContent = meta.label;
  $("#typeDetailSub").textContent = `${RANGE_LABELS[currentReportRange]} · ${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;

  const log = $("#typeDetailLog");
  if (filtered.length === 0){
    log.innerHTML = `<div class="empty">No hay registros de ${meta.label.toLowerCase()} en este rango.</div>`;
  } else {
    log.innerHTML = filtered.map(e => {
      const noteHtml = e.notes ? `<div class="n">${escapeHtml(e.notes)}</div>` : "";
      const durationHtml = e.duration_seconds ? ` · ${fmtClock(e.duration_seconds)}` : "";
      const mlHtml = e.ml_amount != null ? ` · ${e.ml_amount}ml` : "";
      return `<div class="entry" data-id="${e.id}">
        <span class="tag" style="background:${meta.soft};color:${meta.color}">${meta.glyph}</span>
        <div class="info">
          <div class="t">${meta.label}</div>
          <div class="d">${fmtEntryDate(e.occurred_at)}${durationHtml}${mlHtml}</div>
          ${noteHtml}
        </div>
        <div class="ago">${relTime(e.occurred_at)}</div>
      </div>`;
    }).join("");

    log.querySelectorAll('.entry').forEach(el => {
      el.addEventListener('click', () => {
        typeDetailOverlay.classList.remove("show");
        reportOverlay.classList.remove("show");
        openSheetForEdit(el.dataset.id);
      });
    });
  }

  typeDetailOverlay.classList.add("show");
}

$("#btnTypeDetailClose").addEventListener('click', () => typeDetailOverlay.classList.remove("show"));
typeDetailOverlay.addEventListener('click', (e) => { if (e.target === typeDetailOverlay) typeDetailOverlay.classList.remove("show"); });

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

let loadError = null;

/* ---------- weight tracking ---------- */

const WEIGHT_TABLE = "toma_weights";
const weightOverlay = $("#weightOverlay");
let weights = [];

function renderWeightChart(sorted){
  const wrap = $("#weightChartWrap");
  const svg = $("#weightChart");
  if (sorted.length < 2){
    wrap.style.display = "none";
    svg.innerHTML = "";
    return;
  }
  wrap.style.display = "block";
  const kgs = sorted.map(w => w.weight_kg);
  const min = Math.min(...kgs), max = Math.max(...kgs);
  const range = (max - min) || 1;
  const w = 300, h = 90, pad = 8;
  const points = sorted.map((wt, i) => {
    const x = pad + (i / (sorted.length - 1)) * (w - pad*2);
    const y = h - pad - ((wt.weight_kg - min) / range) * (h - pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const dots = sorted.map((wt, i) => {
    const [x, y] = points[i].split(',');
    return `<circle cx="${x}" cy="${y}" r="2.6" fill="#e8b45c" />`;
  }).join("");
  svg.innerHTML = `
    <polyline points="${points.join(' ')}" fill="none" stroke="#e8b45c" stroke-width="2" />
    ${dots}
  `;
}

function renderWeightList(){
  const sorted = [...weights].sort((a,b) => new Date(a.weighed_at) - new Date(b.weighed_at));
  renderWeightChart(sorted);

  const latest = sorted[sorted.length - 1];
  $("#weightSub").textContent = latest
    ? `Última: ${latest.weight_kg} kg · ${new Date(latest.weighed_at).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })}`
    : "Aún no hay registros";

  const list = $("#weightList");
  const reversed = [...sorted].reverse();
  if (reversed.length === 0){
    list.innerHTML = `<div class="question-empty">Aún no hay pesos guardados.</div>`;
    return;
  }
  list.innerHTML = reversed.map((wt, i) => {
    const prev = reversed[i+1];
    let deltaHtml = "";
    if (prev){
      const delta = wt.weight_kg - prev.weight_kg;
      const cls = delta >= 0 ? "up" : "down";
      const sign = delta >= 0 ? "+" : "";
      deltaHtml = `<span class="wi-delta ${cls}">${sign}${delta.toFixed(2)} kg</span>`;
    }
    const dateStr = new Date(wt.weighed_at).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
    const notesHtml = wt.notes ? `<div class="wi-notes">${escapeHtml(wt.notes)}</div>` : "";
    return `<div class="weight-item" data-id="${wt.id}">
      <div class="wi-left">
        <div class="wi-kg">${wt.weight_kg} kg</div>
        <div class="wi-date">${dateStr}</div>
        ${notesHtml}
      </div>
      ${deltaHtml}
    </div>`;
  }).join("");

  list.querySelectorAll('.weight-item').forEach(el => {
    el.addEventListener('click', () => deleteWeightPrompt(el.dataset.id));
  });
}

async function loadWeights(){
  if (!HAS_SUPABASE){ weights = []; return; }
  try{
    const rows = await sbRequest(`${WEIGHT_TABLE}?select=id,weighed_at,weight_kg,notes,created_at&order=weighed_at.desc&limit=200`);
    weights = rows || [];
  } catch(err){
    console.error(err);
    showToast("No se pudieron cargar los pesos");
  }
}

async function addWeight(dateStr, kg, notes){
  const local = { id: 'tmp-' + Date.now(), weighed_at: dateStr, weight_kg: kg, notes: notes || null, created_at: new Date().toISOString() };
  weights.push(local);
  renderWeightList();
  if (!HAS_SUPABASE) return;
  try{
    const rows = await sbRequest(WEIGHT_TABLE, {
      method: "POST",
      body: JSON.stringify([{ weighed_at: dateStr, weight_kg: kg, notes: notes || null }])
    });
    const idx = weights.findIndex(w => w.id === local.id);
    if (idx >= 0 && rows && rows[0]) weights[idx] = rows[0];
    renderWeightList();
  } catch(err){
    console.error(err);
    showToast("Guardado local (sin conexión)");
  }
}

async function deleteWeight(id){
  weights = weights.filter(w => w.id !== id);
  renderWeightList();
  if (!HAS_SUPABASE || id.startsWith('tmp-')) return;
  try{
    await sbRequest(`${WEIGHT_TABLE}?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
  } catch(err){
    console.error(err);
    showToast("No se pudo eliminar en el servidor");
  }
}

function deleteWeightPrompt(id){
  if (confirm("¿Eliminar este registro de peso?")){
    deleteWeight(id);
  }
}

$("#btnWeight").addEventListener('click', async () => {
  const now = new Date();
  const parts = toLocalInputParts(now);
  $("#wDate").value = parts.date;
  $("#wKg").value = "";
  $("#wNotes").value = "";
  weightOverlay.classList.add("show");
  renderWeightList();
  await loadWeights();
  renderWeightList();
});
$("#btnWeightClose").addEventListener('click', () => weightOverlay.classList.remove("show"));
weightOverlay.addEventListener('click', (e) => { if (e.target === weightOverlay) weightOverlay.classList.remove("show"); });

$("#btnWeightAdd").addEventListener('click', () => {
  const dateStr = $("#wDate").value;
  const kg = parseFloat($("#wKg").value);
  if (!dateStr){ showToast("Falta la fecha"); return; }
  if (isNaN(kg) || kg <= 0){ showToast("Indica un peso válido en kg"); return; }
  const notes = $("#wNotes").value.trim();
  addWeight(dateStr, kg, notes);
  $("#wKg").value = "";
  $("#wNotes").value = "";
});

/* ---------- pediatrician questions ---------- */

const QUESTIONS_TABLE = "toma_questions";
const questionsOverlay = $("#questionsOverlay");
let questions = [];

function renderQuestions(){
  const list = $("#questionList");
  if (questions.length === 0){
    list.innerHTML = `<div class="question-empty">Aún no hay preguntas guardadas.</div>`;
    return;
  }
  const sorted = [...questions].sort((a,b) => {
    if (a.is_checked !== b.is_checked) return a.is_checked ? 1 : -1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  list.innerHTML = sorted.map(q => {
    const dateStr = new Date(q.created_at).toLocaleDateString('es-ES', { day:'2-digit', month:'short' });
    const answerHtml = q.answer
      ? `<div class="question-answer">${escapeHtml(q.answer)}</div>`
      : `<button class="question-answer-add" data-id="${q.id}">+ Añadir respuesta</button>`;
    return `<div class="question-item ${q.is_checked ? 'checked' : ''}" data-id="${q.id}">
      <span class="question-check">✓</span>
      <div style="flex:1;">
        <div class="question-text">${escapeHtml(q.text)}</div>
        <div class="question-date">${dateStr}</div>
        ${answerHtml}
      </div>
      <button class="question-delete" data-id="${q.id}">✕</button>
    </div>`;
  }).join("");

  list.querySelectorAll('.question-check, .question-text').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.target.closest('.question-item').dataset.id;
      toggleQuestion(id);
    });
  });
  list.querySelectorAll('.question-delete').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteQuestion(el.dataset.id);
    });
  });
  list.querySelectorAll('.question-answer').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.target.closest('.question-item').dataset.id;
      openAnswerEditor(id);
    });
  });
  list.querySelectorAll('.question-answer-add').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openAnswerEditor(el.dataset.id);
    });
  });
}

function openAnswerEditor(id){
  const q = questions.find(x => x.id === id);
  if (!q) return;
  const item = document.querySelector(`.question-item[data-id="${id}"]`);
  const existing = item.querySelector('.question-answer, .question-answer-add');
  const wrap = document.createElement('div');
  wrap.className = 'question-answer-edit';
  wrap.innerHTML = `
    <textarea rows="2" placeholder="Respuesta del pediatra…">${q.answer ? escapeHtml(q.answer) : ''}</textarea>
    <div class="question-answer-actions">
      <button class="qa-cancel">Cancelar</button>
      <button class="qa-save">Guardar</button>
    </div>
  `;
  existing.replaceWith(wrap);
  const textarea = wrap.querySelector('textarea');
  textarea.focus();

  wrap.querySelector('.qa-cancel').addEventListener('click', () => renderQuestions());
  wrap.querySelector('.qa-save').addEventListener('click', () => {
    const val = textarea.value.trim();
    saveAnswer(id, val);
  });
}

async function loadQuestions(){
  if (!HAS_SUPABASE){ questions = []; return; }
  try{
    const rows = await sbRequest(`${QUESTIONS_TABLE}?select=id,text,answer,is_checked,created_at&order=created_at.desc&limit=200`);
    questions = rows || [];
  } catch(err){
    console.error(err);
    showToast("No se pudieron cargar las preguntas");
  }
}

async function addQuestion(text){
  const local = { id: 'tmp-' + Date.now(), text, is_checked: false, created_at: new Date().toISOString() };
  questions.push(local);
  renderQuestions();
  if (!HAS_SUPABASE) return;
  try{
    const rows = await sbRequest(QUESTIONS_TABLE, {
      method: "POST",
      body: JSON.stringify([{ text, is_checked: false }])
    });
    const idx = questions.findIndex(q => q.id === local.id);
    if (idx >= 0 && rows && rows[0]) questions[idx] = rows[0];
    renderQuestions();
  } catch(err){
    console.error(err);
    showToast("Guardado local (sin conexión)");
  }
}

async function toggleQuestion(id){
  const q = questions.find(x => x.id === id);
  if (!q) return;
  q.is_checked = !q.is_checked;
  renderQuestions();
  if (!HAS_SUPABASE || id.startsWith('tmp-')) return;
  try{
    await sbRequest(`${QUESTIONS_TABLE}?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_checked: q.is_checked })
    });
  } catch(err){
    console.error(err);
    showToast("No se pudo sincronizar");
  }
}

async function saveAnswer(id, answer){
  const q = questions.find(x => x.id === id);
  if (!q) return;
  q.answer = answer || null;
  renderQuestions();
  if (!HAS_SUPABASE || id.startsWith('tmp-')) return;
  try{
    await sbRequest(`${QUESTIONS_TABLE}?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ answer: q.answer })
    });
  } catch(err){
    console.error(err);
    showToast("No se pudo sincronizar la respuesta");
  }
}

async function deleteQuestion(id){
  questions = questions.filter(q => q.id !== id);
  renderQuestions();
  if (!HAS_SUPABASE || id.startsWith('tmp-')) return;
  try{
    await sbRequest(`${QUESTIONS_TABLE}?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
  } catch(err){
    console.error(err);
    showToast("No se pudo eliminar en el servidor");
  }
}

$("#btnQuestions").addEventListener('click', async () => {
  questionsOverlay.classList.add("show");
  renderQuestions();
  await loadQuestions();
  renderQuestions();
});
$("#btnQuestionsClose").addEventListener('click', () => questionsOverlay.classList.remove("show"));
questionsOverlay.addEventListener('click', (e) => { if (e.target === questionsOverlay) questionsOverlay.classList.remove("show"); });

$("#btnQuestionAdd").addEventListener('click', () => {
  const input = $("#qNewText");
  const text = input.value.trim();
  if (!text) return;
  addQuestion(text);
  input.value = "";
});
$("#qNewText").addEventListener('keydown', (e) => {
  if (e.key === 'Enter'){
    e.preventDefault();
    $("#btnQuestionAdd").click();
  }
});

async function loadEvents(){
  loadError = null;
  if (!HAS_SUPABASE){
    events = [];
    return;
  }
  try{
    const rows = await sbRequest(`${TABLE}?select=id,type,occurred_at,notes,duration_seconds,ml_amount&order=occurred_at.desc&limit=200`);
    events = rows || [];
  } catch(err){
    console.error(err);
    loadError = err.message || String(err);
    showToast("No se pudo conectar a Supabase");
  }
}

async function createEvent(type, iso, notes, durationSeconds, mlAmount){
  const local = { id: 'tmp-' + Date.now(), type, occurred_at: iso, notes: notes || null, duration_seconds: durationSeconds ?? null, ml_amount: mlAmount ?? null };
  events.push(local);
  if (!HAS_SUPABASE) return;
  try{
    const rows = await sbRequest(TABLE, {
      method: "POST",
      body: JSON.stringify([{ type, occurred_at: iso, notes: notes || null, duration_seconds: durationSeconds ?? null, ml_amount: mlAmount ?? null }])
    });
    const idx = events.findIndex(e => e.id === local.id);
    if (idx >= 0 && rows && rows[0]) events[idx] = rows[0];
  } catch(err){
    console.error(err);
    showToast("Guardado local (sin conexión)");
  }
}

async function updateEvent(id, iso, notes, durationSeconds, mlAmount){
  const idx = events.findIndex(e => e.id === id);
  if (idx >= 0){
    events[idx].occurred_at = iso;
    events[idx].notes = notes || null;
    if (durationSeconds !== undefined) events[idx].duration_seconds = durationSeconds;
    if (mlAmount !== undefined) events[idx].ml_amount = mlAmount;
  }
  if (!HAS_SUPABASE || id.startsWith('tmp-')) return;
  try{
    const patch = { occurred_at: iso, notes: notes || null };
    if (durationSeconds !== undefined) patch.duration_seconds = durationSeconds;
    if (mlAmount !== undefined) patch.ml_amount = mlAmount;
    await sbRequest(`${TABLE}?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
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

  if (loadError){
    note.innerHTML = `<div class="setup-note error-note">
      No se pudieron cargar los registros desde Supabase — no se ha perdido
      nada, pero la app no puede leer la tabla ahora mismo. Causa más común:
      falta aplicar una migración reciente en <code>supabase/</code>
      (revisa <code>schema_02.sql</code>, <code>schema_03.sql</code>,
      <code>schema_04.sql</code>). Detalle técnico: ${escapeHtml(loadError)}
    </div>`;
    dot.classList.add('off');
    label.textContent = 'error de carga';
    return;
  }

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
    note.innerHTML = "";
    dot.classList.remove('off');
    label.textContent = 'sincronizado';
  }
}

(async function boot(){
  fmtDateHeader();
  await loadEvents();
  renderSetupNote();
  renderAll();
  setInterval(renderAll, 60000);
})();
