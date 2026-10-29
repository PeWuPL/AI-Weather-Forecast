const API_KEY = "575510246d94f75985d95f9a375b287e";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const ICON_URL = "https://openweathermap.org/img/wn";
const DEFAULT_CITY = "Kraków";

const form = document.getElementById("search-form");
const cityInput = document.getElementById("city");
const loading = document.getElementById("loading");
const alertBox = document.getElementById("alert");
const todayEl = document.getElementById("today");
const forecastEl = document.getElementById("forecast");
const dayModalEl = document.getElementById("day-modal");
const modalTitle = document.getElementById("day-modal-title");
const modalBody = document.getElementById("day-modal-body");

let cityTimezone = 0;
let todayChart = null;
let modalChart = null;

function createElement(tag, classes = [], text = "") {
  const el = document.createElement(tag);
  el.classList.add(...classes);
  el.textContent = text;
  return el;
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
    };
  });
}

function renderToday(data) {
  todayEl.replaceChildren();
  todayEl.append(createElement("h2", ["h4", "mb-3"], "Dziś"));

  const weather = data.weather[0];
  const card = createElement("div", ["card", "shadow-sm", "border-0", "overflow-hidden"]);

  const header = createElement("div", ["card-header", "text-bg-primary", "d-flex", "justify-content-between", "align-items-center", "flex-wrap", "gap-2"]);
  header.append(
    createElement("h3", ["h5", "mb-0"], `${data.name}, ${data.sys.country}`),
    createElement("span", ["badge", "text-bg-light"], `Czas lokalny: ${formatLocalTime(data.dt, data.timezone)}`),
  );
  card.append(header);

  const body = createElement("div", ["card-body"]);
  const top = createElement("div", ["d-flex", "align-items-center", "flex-wrap", "gap-3", "mb-4"]);
  top.append(createIcon(weather.icon, weather.description, ["weather-icon"]));

  const main = createElement("div");
  main.append(
    createElement("div", ["display-4", "fw-bold", "lh-1"], `${Math.round(data.main.temp)}°C`),
    createElement("div", ["fs-5", "text-capitalize"], weather.description),
    createElement("div", ["text-muted"], `Odczuwalna ${Math.round(data.main.feels_like)}°C`),
  );
  const range = createElement("div", ["ms-md-auto", "d-flex", "gap-2"]);
  range.append(
    createElement("span", ["badge", "fs-6", "text-bg-danger"], `Max ${Math.round(data.main.temp_max)}°`),
    createElement("span", ["badge", "fs-6", "text-bg-info"], `Min ${Math.round(data.main.temp_min)}°`),
  );
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
  const grid = createElement("div", ["row", "row-cols-2", "row-cols-md-4", "g-3"]);
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

function renderForecast(days) {
  forecastEl.replaceChildren();
  forecastEl.append(createElement("h2", ["h4", "mb-3"], "Prognoza na kolejne dni"));

  const row = createElement("div", ["row", "row-cols-2", "row-cols-md-3", "row-cols-lg-5", "g-3"]);
  for (const day of days) {
    const col = createElement("div", ["col"]);
    const card = createElement("div", ["card", "h-100", "text-center", "shadow-sm"]);
    const body = createElement("div", ["card-body"]);

    const name = new Date(day.date).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "numeric" });
    body.append(
      createElement("h3", ["h6", "text-capitalize"], name),
      createIcon(day.weather.icon, day.weather.description, ["weather-icon"]),
      createElement("div", ["small", "text-muted", "text-capitalize", "mb-2"], day.weather.description),
      createElement("span", ["badge", "text-bg-danger", "me-1"], `${Math.round(day.max)}°`),
      createElement("span", ["badge", "text-bg-info"], `${Math.round(day.min)}°`),
    );

    const precip = createElement("div", ["mt-2"]);
    precip.append(createElement("span", ["badge", "text-bg-primary", "me-1"], `Opady ${Math.round(day.pop)}%`));
    if (day.rain > 0) precip.append(createElement("span", ["badge", "text-bg-secondary", "me-1"], `Deszcz ${day.rain.toFixed(1)} mm`));
    if (day.snow > 0) precip.append(createElement("span", ["badge", "text-bg-light", "border"], `Śnieg ${day.snow.toFixed(1)} mm`));
    body.append(precip);

    const more = createElement("button", ["btn", "btn-sm", "btn-outline-primary", "mt-3"], "Szczegóły");
    more.type = "button";
    more.addEventListener("click", () => showDayDetails(day, name));
    body.append(more);
    card.append(body);
    col.append(card);
    row.append(col);
  }
  forecastEl.append(row);
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

  const grid = createElement("div", ["row", "row-cols-3", "row-cols-md-4", "g-2", "mb-3"]);
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
  const wrap = createElement("div", ["position-relative", "chart-wrap"]);
  const canvas = document.createElement("canvas");
  wrap.append(canvas);
  modalBody.append(wrap);

  // wykres rysujemy dopiero po otwarciu, gdy canvas ma wymiary
  dayModalEl.addEventListener("shown.bs.modal", () => {
    modalChart = drawHourlyChart(canvas, day.entries);
  }, { once: true });
  dayModalEl.addEventListener("hidden.bs.modal", () => {
    modalChart?.destroy();
    modalChart = null;
  }, { once: true });
  bootstrap.Modal.getOrCreateInstance(dayModalEl).show();
}

// API daje punkty co 3 h, więc brakujące godziny uzupełniamy interpolacją liniową
function interpolateHourly(entries) {
  const points = [];
  entries.forEach((a, i) => {
    const b = entries[i + 1];
    const steps = b ? Math.round((b.dt - a.dt) / 3600) : 1;
    for (let h = 0; h < steps; h++) {
      const f = h / steps;
      const lerp = (x, y) => x + (y - x) * f;
      points.push({
        dt: a.dt + h * 3600,
        temp: b ? lerp(a.main.temp, b.main.temp) : a.main.temp,
        pop: b ? lerp(a.pop ?? 0, b.pop ?? 0) : (a.pop ?? 0),
      });
    }
  });
  return points;
}

function drawHourlyChart(canvas, entries) {
  const css = getComputedStyle(document.documentElement);
  const primary = css.getPropertyValue("--bs-primary").trim();
  const danger = css.getPropertyValue("--bs-danger").trim();
  const points = interpolateHourly(entries);
  return new Chart(canvas, {
    data: {
      labels: points.map((p) => formatLocalTime(p.dt, cityTimezone)),
      datasets: [
        {
          type: "line",
          label: "Temperatura (°C)",
          data: points.map((p) => Math.round(p.temp * 10) / 10),
          borderColor: danger,
          backgroundColor: danger,
          pointRadius: 2,
          tension: 0.3,
          yAxisID: "temp",
          order: 0,
        },
        {
          type: "bar",
          label: "Opady (%)",
          data: points.map((p) => Math.round(p.pop * 100)),
          backgroundColor: primary,
          categoryPercentage: 1,
          barPercentage: 0.85,
          yAxisID: "pop",
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { offset: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } },
        temp: { position: "left", title: { display: true, text: "°C" } },
        pop: { position: "right", min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: "%" } },
      },
    },
  });
}

function renderHourlyChart(entries) {
  const card = createElement("div", ["card", "shadow-sm", "border-0", "mt-4"]);
  const body = createElement("div", ["card-body"]);
  const wrap = createElement("div", ["position-relative", "chart-wrap"]);
  const canvas = document.createElement("canvas");
  wrap.append(canvas);
  body.append(createElement("h3", ["h5", "mb-3"], "Prognoza godzinowa – najbliższe 24 h"), wrap);
  card.append(body);
  todayEl.append(card);

  todayChart?.destroy();
  todayChart = drawHourlyChart(canvas, entries);
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
    renderToday(today);
    renderHourlyChart(forecast.list.slice(0, 8));
    renderForecast(groupByDay(forecast.list));
  } catch (err) {
    todayChart?.destroy();
    todayChart = null;
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
