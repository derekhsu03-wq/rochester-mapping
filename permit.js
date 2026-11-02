(function () {
  "use strict";

  const get = id => document.getElementById(id);
  const controls = ["first", "previous", "play", "next", "last", "date-slider", "date-select"];
  const integer = new Intl.NumberFormat("en-US");
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const formatDate = day => dateFormat.format(new Date(day + "T00:00:00Z"));
  let timer = null;
  let map = null;

  function stop() {
    clearInterval(timer);
    timer = null;
    get("play").textContent = "Play";
    get("play").setAttribute("aria-pressed", "false");
  }

  function fail(message) {
    stop();
    controls.forEach(id => { get(id).disabled = true; });
    get("error").textContent = message;
    get("error").hidden = false;
    console.error(message);
  }

  function paragraph(parent, text, className) {
    const p = document.createElement("p");
    p.textContent = text;
    if (className) p.className = className;
    parent.append(p);
    return p;
  }

  function popup(features) {
    const container = document.createElement("div");
    container.className = "popup";
    for (const feature of features) {
      const p = feature.properties;
      const article = document.createElement("article");
      const heading = document.createElement("h3");
      heading.textContent = p.address;
      article.append(heading);
      paragraph(article, `${p.permit} | ${formatDate(p.date)}`);
      paragraph(article, `Status: ${p.status}`, "status");
      paragraph(article, p.type);
      paragraph(article, `Reported units: ${p.units === null ? "Not reported" : integer.format(p.units)}`);
      paragraph(article, `Valuation: ${p.valuation === null ? "Not reported" : money.format(p.valuation)}`);
      if (p.description) paragraph(article, p.description);
      paragraph(article, `Location: ${p.geocoding.provider}; ${p.geocoding.match_type || "manual match"}`);
      container.append(article);
    }
    return container;
  }

  function drawAnnualChart(timeline) {
    const container = get("annual-chart");
    const rows = timeline.annualTotals();
    if (!window.Plotly) {
      paragraph(container, "The chart library could not load, so the annual figure is unavailable. Check your internet connection and reload this page.", "chart-fallback");
      return;
    }
    const years = rows.map(row => row.year);
    const unitTraces = {
      x: years, y: rows.map(row => row.units), name: "Reported units", type: "bar",
      marker: { color: "#00aeef", line: { color: "#006a8c", width: 1 } },
      hovertemplate: "<b>%{x}</b><br>%{y:,} reported units<extra></extra>",
    };
    const valuationTrace = {
      x: years, y: rows.map(row => row.valuation), name: "Reported valuation",
      type: "scatter", mode: "lines+markers", yaxis: "y2",
      line: { color: "#915013", width: 2.5 }, marker: { size: 8, symbol: "diamond" },
      hovertemplate: "<b>%{x}</b><br>$%{y:,.0f} reported valuation<extra></extra>",
    };
    Plotly.newPlot(container, [unitTraces, valuationTrace], {
      margin: { l: 70, r: 110, t: 20, b: 60 },
      height: 420,
      hovermode: "x unified",
      xaxis: { title: { text: "Year" }, type: "category", tickangle: -45 },
      yaxis: { title: { text: "Reported units" }, rangemode: "tozero", gridcolor: "#e3e9ed", separatethousands: true },
      yaxis2: {
        title: { text: "Reported valuation", standoff: 18 }, overlaying: "y", side: "right",
        rangemode: "tozero", tickprefix: "$", tickformat: "~s", showgrid: false,
      },
      legend: { orientation: "h", y: 1.12, x: 0 },
      hoverlabel: {
        align: "left", namelength: -1,
        font: { family: "\"Helvetica Neue\", Arial, Helvetica, sans-serif", size: 13 },
      },
      paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff",
      font: { family: "\"Helvetica Neue\", Arial, Helvetica, sans-serif", size: 13, color: "#2b3a42" },
    }, { responsive: true, displayModeBar: false });
  }

  try {
    if (!window.L) throw new Error("Leaflet could not load. Check your internet connection and reload this page.");
    if (!window.PERMIT_DATA) throw new Error("Permit data could not load. Run scripts\\build_permits.py and keep the data folder beside permit.html.");
    if (!window.PermitTimeline) throw new Error("The timeline script could not load. Keep the assets folder beside permit.html.");
    const timeline = window.PermitTimeline.createTimeline(window.PERMIT_DATA);
    map = L.map("map", { preferCanvas: true }).setView([44.0121, -92.4802], 12);
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
    const basemap = L.tileLayer(esri + "World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
      attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    }).addTo(map);
    const labels = L.tileLayer(esri + "World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(map);
    function tileError() {
      get("error").textContent = "Some basemap tiles could not load. Permit markers and the timeline remain available; check your internet connection and reload.";
      get("error").hidden = false;
    }
    basemap.on("tileerror", tileError);
    labels.on("tileerror", tileError);
    const markers = L.layerGroup().addTo(map);
    const allLocations = timeline.features.filter(feature => feature.geometry).map(feature => {
      const [longitude, latitude] = feature.geometry.coordinates;
      return [latitude, longitude];
    });
    if (allLocations.length) map.fitBounds(L.latLngBounds(allLocations), { padding: [35, 35], maxZoom: 14 });
    const markerById = new Map();
    let index = 0;
    get("date-slider").max = String(timeline.dates.length - 1);
    for (const [i, day] of timeline.dates.entries()) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = formatDate(day);
      get("date-select").append(option);
    }
    get("start-date").textContent = formatDate(timeline.dates[0]);
    get("end-date").textContent = formatDate(timeline.dates.at(-1));
    controls.forEach(id => { get(id).disabled = false; });
    drawAnnualChart(timeline);

    function render(nextIndex) {
      index = Math.max(0, Math.min(timeline.dates.length - 1, nextIndex));
      const state = timeline.at(index);
      map.closePopup();
      markers.clearLayers();
      markerById.clear();
      const groups = new Map();
      for (const feature of state.toDateMapped) {
        const key = feature.geometry.coordinates.join(",");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(feature);
      }
      // Each location falls in one tier: permitted earlier, permitted this year, or permitted on this date.
      const tierOf = features =>
        features.some(feature => feature.properties.date === state.date) ? 2
        : features.some(feature => feature.properties.date.slice(0, 4) === state.year) ? 1
        : 0;
      const tierStyles = [
        { radius: 5, color: "#586875", fillColor: "#8c969e", fillOpacity: 0.55, weight: 1 },
        { radius: 7, color: "#2f8fb3", fillColor: "#7fd4f5", fillOpacity: 0.85, weight: 1.5 },
        { radius: 9, color: "#006a8c", fillColor: "#00aeef", fillOpacity: 0.95, weight: 2 },
      ];
      // Co-located records share a marker and popup, and later tiers draw on top.
      const orderedGroups = [...groups.values()]
        .map(features => ({ features, tier: tierOf(features) }))
        .sort((a, b) => a.tier - b.tier);
      for (const { features, tier } of orderedGroups) {
        const [longitude, latitude] = features[0].geometry.coordinates;
        const marker = L.circleMarker([latitude, longitude], tierStyles[tier]).addTo(markers);
        marker.bindPopup(popup(features), { maxWidth: 340 });
        const tooltip = document.createElement("span");
        tooltip.textContent = `${features[0].properties.address}${features.length > 1 ? ` (${features.length} records)` : ""}`;
        marker.bindTooltip(tooltip);
        features.forEach(feature => markerById.set(feature.properties.id, marker));
      }
      get("current-date").textContent = formatDate(state.date);
      get("current-date").dateTime = state.date;
      get("summary-year").textContent = state.year;
      get("summary-date").textContent = formatDate(state.date);
      document.querySelectorAll(".label-year").forEach(span => { span.textContent = state.year; });
      get("step-count").textContent = `Date ${index + 1} of ${timeline.dates.length}`;
      get("date-slider").value = String(index);
      get("date-slider").setAttribute("aria-valuetext", formatDate(state.date));
      get("date-select").value = String(index);
      get("total-records").textContent = integer.format(state.visible.length);
      get("total-units").textContent = integer.format(state.units);
      get("total-valuation").textContent = money.format(state.valuation);
      get("daily-count").textContent = String(state.current.length);
      get("daily-records").replaceChildren();
      for (const feature of state.current) {
        const p = feature.properties;
        const li = document.createElement("li");
        const heading = document.createElement("strong");
        heading.textContent = p.address;
        li.append(heading);
        paragraph(li, `${p.permit} | ${p.status}`, "status");
        paragraph(li, `${p.units === null ? "Units not reported" : integer.format(p.units) + " units"} | ${p.valuation === null ? "Valuation not reported" : money.format(p.valuation)}`);
        if (feature.geometry) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Show on map";
          button.setAttribute("aria-label", `Show ${p.permit} at ${p.address} on map`);
          button.addEventListener("click", () => {
            stop();
            const marker = markerById.get(p.id);
            map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
            marker.openPopup();
            get("map").scrollIntoView({ block: "nearest" });
          });
          li.append(button);
        }
        get("daily-records").append(li);
      }
      get("first").disabled = get("previous").disabled = index === 0;
      get("next").disabled = get("last").disabled = index === timeline.dates.length - 1;
      get("play").disabled = timeline.dates.length < 2;
      if (index === timeline.dates.length - 1) stop();
    }

    function navigate(nextIndex) {
      stop();
      render(nextIndex);
    }
    get("first").addEventListener("click", () => navigate(0));
    get("previous").addEventListener("click", () => navigate(index - 1));
    get("next").addEventListener("click", () => navigate(index + 1));
    get("last").addEventListener("click", () => navigate(timeline.dates.length - 1));
    get("date-slider").addEventListener("input", event => navigate(Number(event.target.value)));
    get("date-select").addEventListener("change", event => navigate(Number(event.target.value)));
    get("play").addEventListener("click", () => {
      if (timer !== null) {
        stop();
        return;
      }
      if (index === timeline.dates.length - 1) render(0);
      get("play").textContent = "Pause";
      get("play").setAttribute("aria-pressed", "true");
      timer = setInterval(() => render(index + 1), 1000);
    });
    let lastWheel = -Infinity;
    get("timeline-panel").addEventListener("wheel", event => {
      if (event.ctrlKey || event.target.closest("select") || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      if (!event.deltaY) return;
      event.preventDefault();
      if (performance.now() - lastWheel < 180) return;
      lastWheel = performance.now();
      navigate(index + Math.sign(event.deltaY));
    }, { passive: false });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    render(0);
  } catch (error) {
    fail(`Unable to display the permit map: ${error.message}`);
  }
})();
