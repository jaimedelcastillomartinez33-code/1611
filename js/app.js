import { estimateMeal, coachMeal, scoreWorkout } from "./ai.js";
import { searchFoods, foodMacros } from "./foods.js";

// ---------- Datos ----------
const load = (k, d) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const state = {
  tab: "hoy",
  date: todayStr(),
  meals: load("fit.meals", []),
  workouts: load("fit.workouts", []),
  profile: load("fit.profile", { sexo: "h", edad: 25, peso: 75, altura: 178, actividad: 1.55, objetivo: "mantener", manual: null }),
  draft: null, // comida estimada pendiente de guardar
};

function todayStr(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r0 = (x) => Math.round(x || 0);
const $ = (sel) => document.querySelector(sel);

function targets() {
  const p = state.profile;
  if (p.manual) return p.manual;
  const bmr = 10 * p.peso + 6.25 * p.altura - 5 * p.edad + (p.sexo === "h" ? 5 : -161);
  let kcal = bmr * p.actividad;
  if (p.objetivo === "perder") kcal *= 0.85;
  if (p.objetivo === "ganar") kcal *= 1.1;
  const proteina = 2 * p.peso;
  const grasa = Math.max(0.8 * p.peso, (kcal * 0.25) / 9);
  const carbohidratos = Math.max(0, (kcal - proteina * 4 - grasa * 9) / 4);
  return { kcal: r0(kcal), proteina: r0(proteina), carbohidratos: r0(carbohidratos), grasa: r0(grasa) };
}

const sumItems = (items) => items.reduce(
  (a, i) => ({ kcal: a.kcal + (+i.kcal || 0), proteina: a.proteina + (+i.proteina || 0), carbohidratos: a.carbohidratos + (+i.carbohidratos || 0), grasa: a.grasa + (+i.grasa || 0) }),
  { kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 },
);
const mealsOf = (date) => state.meals.filter((m) => m.date === date);
const dayTotals = (date) => sumItems(mealsOf(date).flatMap((m) => m.items));
const OBJ = { perder: "perder grasa", mantener: "mantener peso", ganar: "ganar músculo" };
const MEAL_TYPES = ["Desayuno", "Almuerzo", "Comida", "Merienda", "Cena", "Snack"];

function defaultMealType() {
  const h = new Date().getHours();
  if (h < 11) return "Desayuno";
  if (h < 13) return "Almuerzo";
  if (h < 17) return "Comida";
  if (h < 20) return "Merienda";
  return "Cena";
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 3500);
}

async function withBusy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Pensando…';
  try { await fn(); } catch (e) { toast(e.message || String(e)); } finally { btn.disabled = false; btn.innerHTML = label; }
}

// ---------- Vistas ----------
function bar(label, val, goal, unit, cls) {
  const pct = goal ? Math.min(100, (val / goal) * 100) : 0;
  const over = goal && val > goal * 1.05;
  return `<div class="bar ${cls}">
    <div class="bar-top"><span>${label}</span><span class="${over ? "over" : ""}">${r0(val)} / ${goal} ${unit}</span></div>
    <div class="track"><div class="fill" style="width:${pct}%"></div></div>
  </div>`;
}

function macroLine(m) {
  return `<span class="kcal">${r0(m.kcal)} kcal</span> · P ${r0(m.proteina)} · C ${r0(m.carbohidratos)} · G ${r0(m.grasa)}`;
}

function viewHoy() {
  const t = targets();
  const tot = dayTotals(state.date);
  const left = Math.max(0, t.kcal - tot.kcal);
  const isToday = state.date === todayStr();
  const meals = mealsOf(state.date);
  const dateLabel = isToday ? "Hoy" : new Date(state.date + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });

  return `
  <div class="daynav">
    <button class="icon-btn" data-act="day" data-d="-1" aria-label="Día anterior">‹</button>
    <h1>${esc(dateLabel)}</h1>
    <button class="icon-btn" data-act="day" data-d="1" aria-label="Día siguiente" ${isToday ? "disabled" : ""}>›</button>
  </div>

  <section class="card summary">
    <div class="ring-row">
      <div class="big"><b>${r0(left)}</b><small>kcal restantes</small></div>
      <div class="big muted"><b>${r0(tot.kcal)}</b><small>de ${t.kcal}</small></div>
    </div>
    ${bar("Proteína", tot.proteina, t.proteina, "g", "p")}
    ${bar("Carbohidratos", tot.carbohidratos, t.carbohidratos, "g", "c")}
    ${bar("Grasa", tot.grasa, t.grasa, "g", "g")}
  </section>

  <section class="card">
    <h2>Añadir comida</h2>
    <select id="mealType">${MEAL_TYPES.map((x) => `<option ${x === (state.draft?.type || defaultMealType()) ? "selected" : ""}>${x}</option>`).join("")}</select>
    <textarea id="mealText" rows="2" placeholder="Ej: 150 g de pollo con patatas y una ensalada"></textarea>
    <div class="row">
      <button class="btn primary" data-act="estimate">✨ Calcular con IA</button>
      <button class="btn ghost" data-act="toggle-manual">Buscar / manual</button>
    </div>
    <div id="manual" class="hidden">
      <input id="foodSearch" placeholder="Buscar alimento (sin conexión)" autocomplete="off">
      <div id="foodResults"></div>
      <details><summary>Introducir macros a mano</summary>
        <input id="mName" placeholder="Nombre">
        <div class="grid4">
          <input id="mK" type="number" inputmode="decimal" placeholder="kcal">
          <input id="mP" type="number" inputmode="decimal" placeholder="Prot">
          <input id="mC" type="number" inputmode="decimal" placeholder="Carb">
          <input id="mG" type="number" inputmode="decimal" placeholder="Grasa">
        </div>
        <button class="btn" data-act="add-manual">Añadir al borrador</button>
      </details>
    </div>
    ${viewDraft()}
  </section>

  <section>
    ${meals.length ? "" : '<p class="empty">Aún no hay comidas este día.</p>'}
    ${MEAL_TYPES.map((type) => {
      const ms = meals.filter((m) => m.type === type);
      if (!ms.length) return "";
      return `<h3 class="group">${type} <span>${macroLine(sumItems(ms.flatMap((m) => m.items)))}</span></h3>` +
        ms.map((m) => `
        <div class="card meal">
          <div class="meal-head"><b>${esc(m.desc)}</b><button class="icon-btn small" data-act="del-meal" data-id="${m.id}" aria-label="Borrar">✕</button></div>
          ${m.items.map((i) => `<div class="item"><span>${esc(i.nombre)} <em>${r0(i.gramos)} g</em></span><span>${macroLine(i)}</span></div>`).join("")}
        </div>`).join("");
    }).join("")}
  </section>`;
}

function viewDraft() {
  const d = state.draft;
  if (!d) return "";
  const tot = sumItems(d.items);
  return `<div class="draft">
    <h3>Revisa y corrige</h3>
    ${d.nota ? `<p class="note">${esc(d.nota)}</p>` : ""}
    ${d.items.map((i, idx) => `
      <div class="draft-item">
        <div class="di-head"><input value="${esc(i.nombre)}" data-di="${idx}" data-f="nombre"><button class="icon-btn small" data-act="del-di" data-i="${idx}">✕</button></div>
        <div class="grid5">
          <label>g<input type="number" inputmode="decimal" value="${r0(i.gramos)}" data-di="${idx}" data-f="gramos"></label>
          <label>kcal<input type="number" inputmode="decimal" value="${r0(i.kcal)}" data-di="${idx}" data-f="kcal"></label>
          <label>P<input type="number" inputmode="decimal" value="${r0(i.proteina)}" data-di="${idx}" data-f="proteina"></label>
          <label>C<input type="number" inputmode="decimal" value="${r0(i.carbohidratos)}" data-di="${idx}" data-f="carbohidratos"></label>
          <label>G<input type="number" inputmode="decimal" value="${r0(i.grasa)}" data-di="${idx}" data-f="grasa"></label>
        </div>
      </div>`).join("")}
    <p class="total">Total: ${macroLine(tot)}</p>
    <p class="hint">Si cambias los gramos, los macros se ajustan solos.</p>
    <div class="row">
      <button class="btn primary" data-act="save-meal">Guardar comida</button>
      <button class="btn ghost" data-act="discard">Descartar</button>
    </div>
  </div>`;
}

function viewEntreno() {
  const list = [...state.workouts].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  return `
  <h1>Entrenos</h1>
  <section class="card">
    <h2>Nuevo entreno</h2>
    <div class="row">
      <input id="wDate" type="date" value="${todayStr()}">
      <input id="wDur" type="number" inputmode="numeric" placeholder="Minutos">
    </div>
    <input id="wTitle" placeholder="Ej: Pecho y tríceps / Pierna / Correr 5 km">
    <textarea id="wText" rows="6" placeholder="Press banca: 4x8 con 80 kg&#10;Press inclinado mancuernas: 3x10 con 28 kg&#10;Fondos: 3 al fallo (12, 10, 8)&#10;Descansos de 2 min, acabé reventado"></textarea>
    <button class="btn primary" data-act="save-workout">Guardar y puntuar con IA</button>
    <p class="hint">Cuanto más detalle (series, repes, kilos, cómo te sentiste), mejor la nota.</p>
  </section>
  ${list.length ? "" : '<p class="empty">Aún no hay entrenos.</p>'}
  ${list.map((w) => `
    <div class="card workout">
      <div class="meal-head">
        <div><b>${esc(w.title || "Entreno")}</b><div class="sub">${new Date(w.date + "T12:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}${w.duration ? ` · ${w.duration} min` : ""}</div></div>
        ${w.score ? `<div class="score s${Math.floor(w.score.nota)}">${w.score.nota}</div>` : ""}
      </div>
      <pre>${esc(w.text)}</pre>
      ${w.score ? `
        <p>${esc(w.score.resumen)}</p>
        ${w.score.bien.length ? `<ul class="good">${w.score.bien.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${w.score.mejorar.length ? `<ul class="bad">${w.score.mejorar.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}` : ""}
      <div class="row">
        <button class="btn ghost small" data-act="rescore" data-id="${w.id}">${w.score ? "Volver a puntuar" : "Puntuar con IA"}</button>
        <button class="btn ghost small danger" data-act="del-workout" data-id="${w.id}">Borrar</button>
      </div>
    </div>`).join("")}`;
}

function viewCoach() {
  const t = targets();
  const tot = dayTotals(todayStr());
  const last = state.coach;
  const V = { si: ["Sí", "ok"], ajusta: ["Con ajustes", "mid"], no: ["Mejor no", "ko"] };
  return `
  <h1>Coach IA</h1>
  <section class="card">
    <p class="sub">Hoy llevas ${macroLine(tot)}<br>Te faltan <b>${r0(Math.max(0, t.kcal - tot.kcal))} kcal</b> y <b>${r0(Math.max(0, t.proteina - tot.proteina))} g de proteína</b>.</p>
    <textarea id="coachQ" rows="3" placeholder="Ej: ¿Está bien cenar una pizza mediana? / Para cenar, ¿tortilla francesa con pan?"></textarea>
    <div class="row">
      <button class="btn primary" data-act="ask-coach">Preguntar</button>
      <button class="btn ghost" data-act="suggest">¿Qué ceno?</button>
    </div>
  </section>
  ${last ? `
  <section class="card verdict ${V[last.veredicto][1]}">
    <div class="v-head"><span class="badge">${V[last.veredicto][0]}</span><span class="q">${esc(last.q)}</span></div>
    <p>${esc(last.respuesta)}</p>
    <p class="sub">Lo que propones: ${macroLine(last.estimacion)}</p>
    ${last.alternativa ? `<div class="alt"><b>Mejor:</b> ${esc(last.alternativa)}</div>` : ""}
  </section>` : ""}`;
}

function viewAjustes() {
  const p = state.profile;
  const t = targets();
  const m = p.manual;
  const hasKey = !!localStorage.getItem("fit.apiKey");
  return `
  <h1>Ajustes</h1>
  <section class="card">
    <h2>Clave de IA</h2>
    <p class="sub">${hasKey ? "✅ Clave guardada en este móvil." : "Necesaria para calcular comidas, el coach y las notas. Sácala en console.anthropic.com → API Keys."}</p>
    <input id="apiKey" type="password" placeholder="sk-ant-…" autocomplete="off">
    <div class="row">
      <button class="btn primary" data-act="save-key">Guardar clave</button>
      ${hasKey ? '<button class="btn ghost danger" data-act="del-key">Quitar</button>' : ""}
    </div>
  </section>

  <section class="card">
    <h2>Tu perfil</h2>
    <div class="grid2">
      <label>Sexo<select id="pSexo"><option value="h" ${p.sexo === "h" ? "selected" : ""}>Hombre</option><option value="m" ${p.sexo === "m" ? "selected" : ""}>Mujer</option></select></label>
      <label>Edad<input id="pEdad" type="number" inputmode="numeric" value="${p.edad}"></label>
      <label>Peso (kg)<input id="pPeso" type="number" inputmode="decimal" value="${p.peso}"></label>
      <label>Altura (cm)<input id="pAltura" type="number" inputmode="numeric" value="${p.altura}"></label>
    </div>
    <label>Actividad<select id="pAct">
      ${[[1.2, "Sedentario"], [1.375, "Ligera (1-3 días)"], [1.55, "Moderada (3-5 días)"], [1.725, "Alta (6-7 días)"], [1.9, "Muy alta (trabajo físico + entreno)"]]
        .map(([v, l]) => `<option value="${v}" ${p.actividad == v ? "selected" : ""}>${l}</option>`).join("")}
    </select></label>
    <label>Objetivo<select id="pObj">
      ${Object.entries(OBJ).map(([v, l]) => `<option value="${v}" ${p.objetivo === v ? "selected" : ""}>${l[0].toUpperCase() + l.slice(1)}</option>`).join("")}
    </select></label>
    <label class="check"><input id="pManual" type="checkbox" ${m ? "checked" : ""}> Poner mis objetivos a mano</label>
    <div class="grid4 ${m ? "" : "hidden"}" id="manualTargets">
      <label>kcal<input id="tK" type="number" value="${t.kcal}"></label>
      <label>Prot<input id="tP" type="number" value="${t.proteina}"></label>
      <label>Carb<input id="tC" type="number" value="${t.carbohidratos}"></label>
      <label>Grasa<input id="tG" type="number" value="${t.grasa}"></label>
    </div>
    <button class="btn primary" data-act="save-profile">Guardar perfil</button>
    <p class="sub">Objetivo diario: ${t.kcal} kcal · P ${t.proteina} g · C ${t.carbohidratos} g · G ${t.grasa} g</p>
  </section>

  <section class="card">
    <h2>Copia de seguridad</h2>
    <p class="sub">Los datos se guardan solo en este móvil. Exporta de vez en cuando.</p>
    <div class="row">
      <button class="btn" data-act="export">Exportar</button>
      <label class="btn">Importar<input id="importFile" type="file" accept="application/json" hidden></label>
    </div>
  </section>`;
}

const VIEWS = { hoy: viewHoy, entreno: viewEntreno, coach: viewCoach, ajustes: viewAjustes };

function render() {
  $("#view").innerHTML = VIEWS[state.tab]();
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
}

// ---------- Contexto para la IA ----------
function coachContext() {
  const t = targets();
  const d = todayStr();
  const tot = dayTotals(d);
  const meals = mealsOf(d);
  const wk = state.workouts.filter((w) => w.date === d);
  const p = state.profile;
  return [
    `Perfil: ${p.sexo === "h" ? "hombre" : "mujer"}, ${p.edad} años, ${p.peso} kg, ${p.altura} cm. Objetivo: ${OBJ[p.objetivo]}.`,
    `Objetivo diario: ${t.kcal} kcal, ${t.proteina} g proteína, ${t.carbohidratos} g carbohidratos, ${t.grasa} g grasa.`,
    `Hora actual: ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`,
    meals.length
      ? "Comido hoy:\n" + meals.map((m) => `- ${m.type}: ${m.desc} (${r0(sumItems(m.items).kcal)} kcal, P ${r0(sumItems(m.items).proteina)})`).join("\n")
      : "Hoy aún no ha registrado comidas.",
    `Total hoy: ${r0(tot.kcal)} kcal, P ${r0(tot.proteina)}, C ${r0(tot.carbohidratos)}, G ${r0(tot.grasa)}.`,
    `Le falta: ${r0(t.kcal - tot.kcal)} kcal, P ${r0(t.proteina - tot.proteina)}, C ${r0(t.carbohidratos - tot.carbohidratos)}, G ${r0(t.grasa - tot.grasa)}.`,
    wk.length ? "Entreno de hoy:\n" + wk.map((w) => `- ${w.title}: ${w.text}`).join("\n") : "Hoy no ha registrado entreno.",
  ].join("\n");
}

function workoutContext(w) {
  const p = state.profile;
  const prev = state.workouts.filter((x) => x.id !== w.id && x.date <= w.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return [
    `Usuario: ${p.sexo === "h" ? "hombre" : "mujer"}, ${p.edad} años, ${p.peso} kg. Objetivo: ${OBJ[p.objetivo]}.`,
    prev.length
      ? "Entrenos anteriores (más reciente primero):\n" + prev.map((x) => `[${x.date}] ${x.title}${x.score ? ` (nota ${x.score.nota})` : ""}:\n${x.text}`).join("\n\n")
      : "No hay entrenos anteriores registrados.",
  ].join("\n");
}

function workoutText(w) {
  return `Fecha: ${w.date}\nTítulo: ${w.title}\n${w.duration ? `Duración: ${w.duration} min\n` : ""}${w.text}`;
}

// ---------- Acciones ----------
const actions = {
  day(el) {
    const d = new Date(state.date + "T12:00");
    d.setDate(d.getDate() + Number(el.dataset.d));
    const s = todayStr(d);
    if (s <= todayStr()) { state.date = s; render(); }
  },
  async estimate(el) {
    const text = $("#mealText").value.trim();
    if (!text) return toast("Escribe qué has comido.");
    await withBusy(el, async () => {
      const r = await estimateMeal(text);
      const items = r.items.map((i) => ({ ...i, base: { ...i } }));
      state.draft = { desc: text, type: $("#mealType").value, items: [...(state.draft?.items || []), ...items], nota: r.nota };
      render();
      $("#mealText").value = text;
    });
  },
  "toggle-manual"() { $("#manual").classList.toggle("hidden"); },
  "add-manual"() {
    const item = { nombre: $("#mName").value || "Alimento", gramos: 100, kcal: +$("#mK").value || 0, proteina: +$("#mP").value || 0, carbohidratos: +$("#mC").value || 0, grasa: +$("#mG").value || 0 };
    addDraftItem(item, $("#mName").value);
  },
  "add-food"(el) {
    const grams = +el.parentElement.querySelector("input").value || 100;
    const f = JSON.parse(el.dataset.f);
    addDraftItem(foodMacros(f, grams), f[0]);
  },
  "del-di"(el) {
    state.draft.items.splice(+el.dataset.i, 1);
    if (!state.draft.items.length) state.draft = null;
    render();
  },
  discard() { state.draft = null; render(); },
  "save-meal"() {
    const d = state.draft;
    state.meals.push({ id: uid(), date: state.date, type: d.type, desc: d.desc, items: d.items.map(({ base, ...i }) => i) });
    save("fit.meals", state.meals);
    state.draft = null;
    render();
    toast("Comida guardada");
  },
  "del-meal"(el) {
    if (!confirm("¿Borrar esta comida?")) return;
    state.meals = state.meals.filter((m) => m.id !== el.dataset.id);
    save("fit.meals", state.meals);
    render();
  },
  async "save-workout"(el) {
    const text = $("#wText").value.trim();
    if (!text) return toast("Escribe qué has hecho.");
    const w = { id: uid(), date: $("#wDate").value || todayStr(), title: $("#wTitle").value.trim() || "Entreno", duration: +$("#wDur").value || null, text, score: null };
    state.workouts.push(w);
    save("fit.workouts", state.workouts);
    render();
    const btn = document.querySelector(`[data-act="rescore"][data-id="${w.id}"]`);
    if (btn) await actions.rescore(btn);
  },
  async rescore(el) {
    const w = state.workouts.find((x) => x.id === el.dataset.id);
    await withBusy(el, async () => {
      const s = await scoreWorkout({ workout: workoutText(w), context: workoutContext(w) });
      s.nota = Math.max(0, Math.min(10, Math.round(s.nota * 10) / 10));
      w.score = s;
      save("fit.workouts", state.workouts);
      render();
    });
  },
  "del-workout"(el) {
    if (!confirm("¿Borrar este entreno?")) return;
    state.workouts = state.workouts.filter((w) => w.id !== el.dataset.id);
    save("fit.workouts", state.workouts);
    render();
  },
  async "ask-coach"(el) {
    const q = $("#coachQ").value.trim();
    if (!q) return toast("Escribe qué quieres comer.");
    await withBusy(el, async () => {
      const r = await coachMeal({ question: q, context: coachContext() });
      state.coach = { ...r, q };
      render();
    });
  },
  async suggest(el) {
    const q = "¿Qué me recomiendas cenar hoy para cuadrar mis macros? Propón una cena concreta con cantidades.";
    await withBusy(el, async () => {
      const r = await coachMeal({ question: q, context: coachContext() });
      state.coach = { ...r, q: "¿Qué ceno?" };
      render();
    });
  },
  "save-key"() {
    const k = $("#apiKey").value.trim();
    if (!k.startsWith("sk-ant-")) return toast("La clave debe empezar por sk-ant-");
    localStorage.setItem("fit.apiKey", k);
    render();
    toast("Clave guardada");
  },
  "del-key"() { localStorage.removeItem("fit.apiKey"); render(); },
  "save-profile"() {
    const p = {
      sexo: $("#pSexo").value, edad: +$("#pEdad").value, peso: +$("#pPeso").value, altura: +$("#pAltura").value,
      actividad: +$("#pAct").value, objetivo: $("#pObj").value, manual: null,
    };
    if ($("#pManual").checked) p.manual = { kcal: +$("#tK").value, proteina: +$("#tP").value, carbohidratos: +$("#tC").value, grasa: +$("#tG").value };
    state.profile = p;
    save("fit.profile", p);
    render();
    toast("Perfil guardado");
  },
  export() {
    const blob = new Blob([JSON.stringify({ meals: state.meals, workouts: state.workouts, profile: state.profile }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fit-backup-${todayStr()}.json`;
    a.click();
  },
};

function addDraftItem(item, desc) {
  item.base = { ...item };
  if (!state.draft) state.draft = { desc: desc || item.nombre, type: $("#mealType").value, items: [], nota: "" };
  else if (desc && !state.draft.desc.includes(desc)) state.draft.desc += `, ${desc}`;
  state.draft.items.push(item);
  render();
}

// ---------- Eventos ----------
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) { state.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest("[data-act]");
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el);
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "foodSearch") {
    $("#foodResults").innerHTML = searchFoods(t.value).map((f) => `
      <div class="food"><span>${esc(f[0])}<em>${f[1]} kcal/100 g</em></span>
      <span class="food-add"><input type="number" inputmode="decimal" value="100" aria-label="gramos">g<button class="btn small" data-act="add-food" data-f='${esc(JSON.stringify(f))}'>+</button></span></div>`).join("");
  }
  if (t.dataset.di !== undefined && state.draft) {
    const item = state.draft.items[+t.dataset.di];
    const f = t.dataset.f;
    if (f === "nombre") { item.nombre = t.value; return; }
    item[f] = +t.value || 0;
    if (f === "gramos" && item.base?.gramos) {
      const k = item.gramos / item.base.gramos;
      for (const m of ["kcal", "proteina", "carbohidratos", "grasa"]) {
        item[m] = Math.round(item.base[m] * k * 10) / 10;
        const inp = document.querySelector(`[data-di="${t.dataset.di}"][data-f="${m}"]`);
        if (inp) inp.value = r0(item[m]);
      }
    } else if (f !== "gramos") {
      item.base = { ...item, base: undefined };
    }
    const tot = document.querySelector(".draft .total");
    if (tot) tot.innerHTML = "Total: " + macroLine(sumItems(state.draft.items));
  }
  if (t.id === "pManual") $("#manualTargets").classList.toggle("hidden", !t.checked);
});

document.addEventListener("change", (e) => {
  if (e.target.id === "pManual") $("#manualTargets").classList.toggle("hidden", !e.target.checked);
  if (e.target.id === "importFile" && e.target.files[0]) {
    e.target.files[0].text().then((txt) => {
      try {
        const d = JSON.parse(txt);
        if (!confirm("Esto reemplaza los datos actuales. ¿Seguir?")) return;
        state.meals = d.meals || []; state.workouts = d.workouts || []; state.profile = d.profile || state.profile;
        save("fit.meals", state.meals); save("fit.workouts", state.workouts); save("fit.profile", state.profile);
        render(); toast("Datos importados");
      } catch { toast("Archivo no válido"); }
    });
  }
});

render();
if (!localStorage.getItem("fit.apiKey") && !localStorage.getItem("fit.profile")) { state.tab = "ajustes"; render(); toast("Empieza poniendo tu perfil y la clave de IA"); }

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
