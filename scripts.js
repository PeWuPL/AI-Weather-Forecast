const API_KEY = "575510246d94f75985d95f9a375b287e";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const ICON_URL = "https://openweathermap.org/img/wn";
const DEFAULT_CITY = "Szczecin";

const form = document.getElementById("search-form");
const cityInput = document.getElementById("city");
const loading = document.getElementById("loading");
const alertBox = document.getElementById("alert");
const todayEl = document.getElementById("today");
const forecastEl = document.getElementById("forecast");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const dayModalEl = document.getElementById("day-modal");
const modalTitle = document.getElementById("day-modal-title");
const modalBody = document.getElementById("day-modal-body");

let cityTimezone = 0;
let sunTimes = null; // sunrise/sunset z /weather (dziś)

function createElement(tag, classes = [], text = "") {
  const el = document.createElement(tag);
  el.classList.add(...classes);
  el.textContent = text;
  return el;
}

function glassCard(classes = []) {
  return createElement("div", ["card", "glass", ...classes]);
}

const BACKGROUNDS = {
  Clear: "clear",
  Clouds: "clouds",
  Rain: "rain",
  Drizzle: "rain",
  Snow: "snow",
  Thunderstorm: "thunderstorm",
};

function setBackground(main) {
  const name = BACKGROUNDS[main] ?? "fog"; // Mist, Fog, Haze, Smoke itp.
  document.body.classList.remove(...[...document.body.classList].filter((c) => c.startsWith("weather-bg-")));
  document.body.classList.add(`weather-bg-${name}`);
}

function createIcon(code, description, classes = []) {
  const img = createElement("img", classes);
  img.src = `${ICON_URL}/${code}@2x.png`;
  img.alt = description;
  return img;
}

async function fetchJson(endpoint, city) {
  const params = new URLSearchParams({
    q: city,
    units: "metric",
    lang: "pl",
    appid: API_KEY,
  });
  const res = await fetch(`${BASE_URL}/${endpoint}?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Błąd HTTP ${res.status}`);
  }
  return res.json();
}

// Endpoint 1: pogoda na dziś
const getToday = (city) => fetchJson("weather", city);

// Endpoint 2: prognoza (5 dni co 3 godziny)
const getForecast = (city) => fetchJson("forecast", city);

function extreme(fn, entries) {
  return entries.length ? fn(...entries.map((e) => e.main.temp)) : undefined;
}

// wpis nocny najbliższy 2:00 reprezentuje noc (ikona, opis)
function nightEntry(entries) {
  const night = entries.filter((e) => e.sys.pod === "n");
  if (!night.length) return undefined;
  const dist = (e) => {
    const diff = Math.abs(Number(e.dt_txt.slice(11, 13)) - 2);
    return Math.min(diff, 24 - diff);
  };
  return night.reduce((best, e) => (dist(e) < dist(best) ? e : best));
}

function nightPop(entries) {
  const night = entries.filter((e) => e.sys.pod === "n");
  return night.length ? Math.max(...night.map((e) => e.pop ?? 0)) * 100 : undefined;
}

function groupByDay(list) {
  const days = new Map();
  for (const entry of list) {
    const date = entry.dt_txt.slice(0, 10);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(entry);
  }
  return [...days].map(([date, entries]) => {
    // wpis najbliższy południa reprezentuje dzień (ikona, opis)
    const midday = entries.reduce((best, e) => {
      const hour = Number(e.dt_txt.slice(11, 13));
      const bestHour = Number(best.dt_txt.slice(11, 13));
      return Math.abs(hour - 12) < Math.abs(bestHour - 12) ? e : best;
    });
    const avg = (fn) => entries.reduce((sum, e) => sum + fn(e), 0) / entries.length;
    const sum = (fn) => entries.reduce((total, e) => total + fn(e), 0);
    return {
      date,
      entries,
      min: Math.min(...entries.map((e) => e.main.temp_min)),
      max: Math.max(...entries.map((e) => e.main.temp_max)),
      weather: midday.weather[0],
      pop: Math.max(...entries.map((e) => e.pop ?? 0)) * 100,
      rain: sum((e) => e.rain?.["3h"] ?? 0),
      snow: sum((e) => e.snow?.["3h"] ?? 0),
      humidity: avg((e) => e.main.humidity),
      pressure: avg((e) => e.main.pressure),
      clouds: avg((e) => e.clouds.all),
      wind: avg((e) => e.wind.speed),
      gust: Math.max(...entries.map((e) => e.wind.gust ?? 0)),
      windDeg: midday.wind.deg,
      // sys.pod: "d" = dzień, "n" = noc
      dayTemp: extreme(Math.max, entries.filter((e) => e.sys.pod === "d")),
      nightTemp: extreme(Math.min, entries.filter((e) => e.sys.pod === "n")),
      nightWeather: nightEntry(entries)?.weather[0],
      nightPop: nightPop(entries),
    };
  });
}

function renderToday(data) {
  todayEl.replaceChildren();

  const weather = data.weather[0];
  const card = glassCard(["shadow-sm", "border-0", "overflow-hidden"]);

  const header = createElement("div", ["card-header", "text-bg-primary", "d-flex", "justify-content-between", "align-items-center", "flex-wrap", "gap-2"]);
  header.append(
    createElement("h2", ["h5", "mb-0"], `Dziś · ${data.name}, ${data.sys.country}`),
    createElement("span", ["badge", "text-bg-light"], `Czas lokalny: ${formatLocalTime(data.dt, data.timezone)}`),
  );
  card.append(header);

  const body = createElement("div", ["card-body"]);
  const top = createElement("div", ["d-flex", "align-items-center", "flex-wrap", "gap-3", "mb-2"]);
  top.append(createIcon(weather.icon, weather.description, ["weather-icon"]));

  const main = createElement("div");
  main.append(
    createElement("div", ["display-4", "fw-bold", "lh-1"], `${Math.round(data.main.temp)}°C`),
    createElement("div", ["fs-5", "text-capitalize"], weather.description),
    createElement("div", ["text-muted"], `Odczuwalna ${Math.round(data.main.feels_like)}°C`),
  );
  const range = createElement("div", ["ms-md-auto", "d-flex", "gap-2"]);
  const maxTemp = arrowTemp("bi-arrow-up", "text-danger", data.main.temp_max);
  const minTemp = arrowTemp("bi-arrow-down", "text-primary", data.main.temp_min);
  maxTemp.classList.add("fs-5");
  minTemp.classList.add("fs-5");
  range.append(maxTemp, minTemp);
  top.append(main, range);
  body.append(top);

  const wind = data.wind;
  const tiles = [
    ["Wilgotność", `${data.main.humidity}%`],
    ["Ciśnienie", `${data.main.pressure} hPa`],
    ["Zachmurzenie", `${data.clouds.all}%`],
    ["Widoczność", `${(data.visibility / 1000).toFixed(1)} km`],
    ["Wiatr", `${wind.speed} m/s ${windDirection(wind.deg)}`],
    ["Porywy", wind.gust ? `${wind.gust} m/s` : "brak"],
    ["Wschód słońca", formatLocalTime(data.sys.sunrise, data.timezone)],
    ["Zachód słońca", formatLocalTime(data.sys.sunset, data.timezone)],
  ];
  const grid = createElement("div", ["row", "row-cols-2", "row-cols-md-4", "gx-3", "gy-1"]);
  for (const [label, value] of tiles) {
    const col = createElement("div", ["col"]);
    const tile = createElement("div", ["p-3", "bg-body-tertiary", "rounded", "h-100"]);
    tile.append(
      createElement("div", ["small", "text-muted", "text-uppercase"], label),
      createElement("div", ["fs-5", "fw-semibold"], value),
    );
    col.append(tile);
    grid.append(col);
  }
  body.append(grid);
  card.append(body);
  todayEl.append(card);
}

// timezone to przesunięcie w sekundach względem UTC dla danego miasta
function formatLocalTime(unixSeconds, timezone) {
  return new Date((unixSeconds + timezone) * 1000).toLocaleTimeString("pl-PL", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function windDirection(deg) {
  if (deg === undefined) return "";
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(deg / 45) % 8];
}

const SVG_NS = "http://www.w3.org/2000/svg";

// seria -> gładka krzywa (Catmull-Rom jako krzywe Béziera) w układzie SVG 0..n x 0..100,
// środek i-tej kolumny to i + 0.5; brakujące wartości (undefined) są pomijane
function linePath(values, min, max) {
  const span = max - min || 1;
  const pts = values
    .map((v, i) => (v === undefined ? null : [i + 0.5, 90 - ((v - min) / span) * 80]))
    .filter(Boolean);
  if (pts.length < 2) return { d: "", area: "" };
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    // ograniczamy y punktów kontrolnych do zakresu sąsiadów, by krzywa nie przestrzeliwała
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const clamp = (y) => Math.min(Math.max(y, lo), hi);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  const last = pts[pts.length - 1];
  return { d, area: `${d} L${last[0]},100 L${pts[0][0]},100 Z` };
}

function createLineBand(columns) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("line-band");
  svg.setAttribute("viewBox", `0 0 ${columns.length} 100`);
  svg.setAttribute("preserveAspectRatio", "none");

  const hasNight = columns.some((c) => "nightTemp" in c);
  // dni: czerwona = temperatura w dzień, niebieska = w nocy (wspólna skala); godziny: temperatura i opady
  const series = hasNight
    ? [
        ["line-temp", columns.map((c) => c.dayTemp ?? c.temp)],
        ["line-night", columns.map((c) => c.nightTemp)],
      ]
    : [
        ["line-temp", columns.map((c) => c.temp)],
        ...(columns.some((c) => c.showPopLine) ? [["line-pop", columns.map((c) => c.pop)]] : []),
      ];
  const temps = series.filter(([cls]) => cls !== "line-pop").flatMap(([, v]) => v).filter((v) => v !== undefined);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  for (const [cls, values] of series) {
    const { d, area } = cls === "line-pop" ? linePath(values, 0, 100) : linePath(values, min, max);
    // wypełnienie pod krzywą, potem sama krzywa
    const fill = document.createElementNS(SVG_NS, "path");
    fill.classList.add("area", `area-${cls.slice(5)}`);
    fill.setAttribute("d", area);
    const line = document.createElementNS(SVG_NS, "path");
    line.classList.add(cls);
    line.setAttribute("d", d);
    svg.append(fill, line);
  }
  return svg;
}

// kapsuła z kroplą; kolor zależy od szansy na opady
function popChip(pop) {
  const level = pop >= 70 ? "text-bg-primary" : pop >= 30 ? "text-bg-info" : "text-bg-secondary";
  const chip = createElement("span", ["d-inline-flex", "align-items-center", "gap-1", "rounded-pill", "px-2", "py-1", "small", "fw-semibold", level]);
  chip.append(createElement("i", ["bi", pop > 0 ? "bi-droplet-fill" : "bi-droplet"]), document.createTextNode(`${Math.round(pop)}%`));
  return chip;
}

function sunBadge({ type, time }) {
  const rise = type === "sunrise";
  const el = createElement("div", ["small", "fw-semibold", rise ? "text-warning" : "text-danger-emphasis"]);
  el.append(createElement("i", ["bi", rise ? "bi-sunrise-fill" : "bi-sunset-fill", "me-1"]), document.createTextNode(time));
  return el;
}

function arrowTemp(icon, color, temp) {
  const el = createElement("div", ["fw-semibold", color]);
  if (temp === undefined) {
    el.textContent = "\u00a0";
    return el;
  }
  el.append(createElement("i", ["bi", icon, "me-1"]), document.createTextNode(`${Math.round(temp)}°`));
  return el;
}

// Poziomy rząd słupków: etykieta, podetykieta, ikona, % opadów, linia, temperatura
function renderColumns(columns) {
  const list = createElement("div", ["d-flex", "overflow-x-auto", "position-relative"]);
  const grid = createElement("div", ["d-flex", "flex-column", "flex-fill"]);
  const rows = ["label", "sub", "icon", "pop"].map(() => createElement("div", ["d-flex"]));
  const tempRow = createElement("div", ["d-flex"]);
  const dayRow = createElement("div", ["d-flex"]);
  const nightRow = createElement("div", ["d-flex"]);
  const nightIconRow = createElement("div", ["d-flex"]);
  const nightPopRow = createElement("div", ["d-flex"]);
  const hasDayNight = columns.some((c) => "dayTemp" in c);

  for (const c of columns) {
    const cell = (parent, ...nodes) => {
      const el = createElement("div", ["slot", "text-center", "flex-fill", "py-1"]);
      el.append(...nodes);
      parent.append(el);
    };
    cell(rows[0], createElement("div", ["fw-semibold", "text-capitalize"], c.label));
    cell(rows[1], c.sun ? sunBadge(c.sun) : createElement("div", ["small", "text-muted"], c.sub ?? "\u00a0"));
    cell(rows[2], createIcon(c.icon, c.description, ["slot-icon"]));
    cell(rows[3], popChip(c.pop));
    cell(tempRow, createElement("div", ["fw-semibold"], `${Math.round(c.temp)}°`));
    cell(dayRow, arrowTemp("bi-arrow-up", "text-danger", c.dayTemp));
    cell(nightRow, arrowTemp("bi-arrow-down", "text-primary", c.nightTemp));
    cell(nightIconRow, c.nightWeather
      ? createIcon(c.nightWeather.icon, c.nightWeather.description, ["slot-icon"])
      : createElement("div", ["slot-icon"]));
    cell(nightPopRow, c.nightPop === undefined ? createElement("span", [], "\u00a0") : popChip(c.nightPop));
  }

  // kliknięcie w dowolne miejsce słupka (także w linię) wybieramy po pozycji poziomej
  if (columns.some((c) => c.onClick)) {
    grid.classList.add("slot-clickable");
    grid.addEventListener("click", (e) => {
      const box = grid.getBoundingClientRect();
      const index = Math.floor(((e.clientX - box.left) / box.width) * columns.length);
      columns[Math.min(Math.max(index, 0), columns.length - 1)].onClick?.();
    });
  }

  if (hasDayNight) {
    // temperatura w dzień nad wykresem, w nocy pod wykresem
    grid.append(...rows, dayRow, createLineBand(columns), nightRow, nightIconRow, nightPopRow);
  } else {
    grid.append(...rows, createLineBand(columns), tempRow);
  }
  list.append(grid);
  return list;
}

function dayColumns(days) {
  return days.map((day) => {
    const date = new Date(day.date);
    const title = date.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "numeric" });
    return {
      label: date.toLocaleDateString("pl-PL", { weekday: "short" }),
      sub: date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" }).replace(".", "/"),
      icon: day.weather.icon,
      description: day.weather.description,
      pop: day.pop,
      temp: day.max,
      dayTemp: day.dayTemp,
      nightTemp: day.nightTemp,
      nightWeather: day.nightWeather,
      nightPop: day.nightPop,
      onClick: () => showDayDetails(day, title),
    };
  });
}

function renderForecast(days) {
  forecastEl.replaceChildren();
  const card = glassCard(["shadow-sm", "border-0"]);
  const body = createElement("div", ["card-body"]);
  body.append(renderColumns(dayColumns(days)));
  card.append(createElement("h2", ["card-header", "h5", "mb-0"], "Następne dni"), body);
  forecastEl.append(card);
}

function showDayDetails(day, title) {
  modalTitle.textContent = title;
  modalBody.replaceChildren();

  const tiles = [
    ["bi-thermometer-half", "Temperatura", `${Math.round(day.min)}° / ${Math.round(day.max)}°`],
    ["bi-umbrella", "Szansa opadów", `${Math.round(day.pop)}%`],
    ["bi-moisture", "Wilgotność", `${Math.round(day.humidity)}%`],
    ["bi-speedometer2", "Ciśnienie", `${Math.round(day.pressure)} hPa`],
    ["bi-cloud", "Zachmurzenie", `${Math.round(day.clouds)}%`],
    ["bi-wind", "Wiatr", `${day.wind.toFixed(1)} m/s ${windDirection(day.windDeg)}`],
    ["bi-tornado", "Porywy", day.gust ? `${day.gust.toFixed(1)} m/s` : "brak"],
  ];
  if (day.rain > 0) tiles.push(["bi-droplet-half", "Deszcz", `${day.rain.toFixed(1)} mm`]);
  if (day.snow > 0) tiles.push(["bi-snow", "Śnieg", `${day.snow.toFixed(1)} mm`]);

  const grid = createElement("div", ["row", "row-cols-3", "row-cols-md-4", "gx-2", "gy-1", "mb-3"]);
  for (const [icon, label, value] of tiles) {
    const col = createElement("div", ["col"]);
    const tile = createElement("div", ["p-2", "bg-body-tertiary", "rounded", "text-center", "h-100"]);
    tile.append(
      createElement("i", ["bi", icon, "fs-5", "text-primary"]),
      createElement("div", ["fw-semibold", "small", "lh-sm"], value),
      createElement("div", ["text-muted", "lh-sm", "small"], label),
    );
    col.append(tile);
    grid.append(col);
  }
  modalBody.append(grid);

  modalBody.append(createElement("h3", ["h6"], "Prognoza godzinowa"));
  modalBody.append(renderColumns(hourlyColumns(day.entries, { popLine: false })));
  bootstrap.Modal.getOrCreateInstance(dayModalEl).show();
}

// wschód/zachód słońca z /weather dla dzisiejszego dnia; dla innych dni przesuwamy o wielokrotność 24 h
function sunEventAt(start) {
  if (!sunTimes) return undefined;
  for (let day = -1; day <= 7; day++) {
    for (const [type, base] of [["sunrise", sunTimes.sunrise], ["sunset", sunTimes.sunset]]) {
      const t = base + day * 86400;
      if (t >= start && t < start + 3600) return { type, time: formatLocalTime(t, cityTimezone) };
    }
  }
  return undefined;
}

// interpolacja Catmull-Rom wartości między a i b (prev/next dają nachylenie),
// ograniczona do zakresu a..b, by nie przestrzeliwała
function smoothValue(prev, a, b, next, f, get) {
  const [p0, p1, p2, p3] = [prev, a, b, next].map(get);
  const m1 = (p2 - p0) / 2;
  const m2 = (p3 - p1) / 2;
  const f2 = f * f;
  const f3 = f2 * f;
  const t = (2 * f3 - 3 * f2 + 1) * p1 + (f3 - 2 * f2 + f) * m1 + (-2 * f3 + 3 * f2) * p2 + (f3 - f2) * m2;
  return Math.min(Math.max(t, Math.min(p1, p2)), Math.max(p1, p2));
}

// API daje punkty co 3 h, więc brakujące godziny uzupełniamy gładką interpolacją
function hourlyColumns(entries, { popLine = true } = {}) {
  const columns = [];
  entries.forEach((a, i) => {
    const b = entries[i + 1];
    const steps = b ? Math.round((b.dt - a.dt) / 3600) : 1;
    for (let h = 0; h < steps; h++) {
      const f = h / steps;
      columns.push({
        label: formatLocalTime(a.dt + h * 3600, cityTimezone),
        icon: a.weather[0].icon,
        description: a.weather[0].description,
        sun: sunEventAt(a.dt + h * 3600),
        pop: (b ? smoothValue(entries[i - 1] ?? a, a, b, entries[i + 2] ?? b, f, (e) => e.pop ?? 0) : (a.pop ?? 0)) * 100,
        temp: b ? smoothValue(entries[i - 1] ?? a, a, b, entries[i + 2] ?? b, f, (e) => e.main.temp) : a.main.temp,
        showPopLine: popLine,
      });
    }
  });
  return columns;
}

function renderHourlyList(entries) {
  const card = glassCard(["shadow-sm", "border-0", "mt-2"]);
  const body = createElement("div", ["card-body"]);
  body.append(createElement("h3", ["h5", "mb-2"], "Prognoza godzinowa – najbliższe 24 h"), renderColumns(hourlyColumns(entries, { popLine: false })));
  card.append(body);
  todayEl.append(card);
}

function showError(message) {
  alertBox.textContent = message;
  alertBox.classList.remove("d-none");
}

async function load(city) {
  alertBox.classList.add("d-none");
  loading.classList.remove("d-none");
  try {
    const [today, forecast] = await Promise.all([getToday(city), getForecast(city)]);
    cityTimezone = today.timezone;
    sunTimes = today.sys;
    setBackground(today.weather[0].main);
    renderToday(today);
    renderHourlyList(forecast.list.slice(0, 8));
    renderForecast(groupByDay(forecast.list));
  } catch (err) {
    todayEl.replaceChildren();
    forecastEl.replaceChildren();
    showError(`Nie udało się pobrać pogody: ${err.message}`);
  } finally {
    loading.classList.add("d-none");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  load(cityInput.value.trim());
});

cityInput.value = DEFAULT_CITY;
load(DEFAULT_CITY);

function applyTheme(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
  themeIcon.classList.toggle("bi-moon-stars-fill", theme === "light");
  themeIcon.classList.toggle("bi-sun-fill", theme === "dark");
}

function initialTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // brak dostępu do localStorage – używamy ustawienia systemu
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // zapis jest opcjonalny
  }
});

applyTheme(initialTheme());
