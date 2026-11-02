(function (root) {
  "use strict";

  function createTimeline(collection) {
    if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features) || !collection.features.length) {
      throw new Error("Permit data is empty or is not a GeoJSON FeatureCollection.");
    }
    const features = [...collection.features].sort((a, b) => String(a.properties?.date).localeCompare(String(b.properties?.date)));
    const ids = new Set();
    for (const feature of features) {
      const p = feature.properties;
      if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) ||
          !Number.isFinite(Date.parse(p.date)) ||
          new Date(p.date).toISOString().slice(0, 10) !== p.date ||
          !p.id || ids.has(p.id) || typeof p.address !== "string") {
        throw new Error("Permit data contains an invalid date, duplicate ID, or missing address.");
      }
      ids.add(p.id);
      for (const field of ["units", "valuation"]) {
        if (p[field] !== null && (!Number.isFinite(p[field]) || p[field] < 0)) {
          throw new Error(`Invalid ${field} on permit ${p.permit}.`);
        }
      }
      if (feature.geometry !== null) {
        const geometry = feature.geometry;
        if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates) ||
            geometry.coordinates.length !== 2 || !geometry.coordinates.every(Number.isFinite) ||
            Math.abs(geometry.coordinates[0]) > 180 || Math.abs(geometry.coordinates[1]) > 90) {
          throw new Error(`Invalid location on permit ${p.permit}.`);
        }
      }
    }
    const dates = [...new Set(features.map(feature => feature.properties.date))];

    function at(index) {
      if (!Number.isInteger(index) || index < 0 || index >= dates.length) {
        throw new RangeError("Timeline index is outside the available dates.");
      }
      const date = dates[index];
      const year = date.slice(0, 4);
      // The map shows every property permitted so far; totals restart each January.
      const toDate = features.filter(feature => feature.properties.date <= date);
      const toDateMapped = toDate.filter(feature => feature.geometry !== null);
      const visible = toDate.filter(feature => feature.properties.date.slice(0, 4) === year);
      const current = visible.filter(feature => feature.properties.date === date);
      const mapped = visible.filter(feature => feature.geometry !== null);
      return {
        date, index, year, visible, current, mapped, toDate, toDateMapped,
        unmapped: visible.length - mapped.length,
        units: visible.reduce((total, feature) => total + (feature.properties.units ?? 0), 0),
        valuation: visible.reduce((total, feature) => total + (feature.properties.valuation ?? 0), 0),
        missingUnits: visible.filter(feature => feature.properties.units === null).length,
        missingValuation: visible.filter(feature => feature.properties.valuation === null).length,
      };
    }

    return { dates, features, at, annualTotals };

    // Full calendar-year totals across every record, independent of the selected date.
    function annualTotals() {
      const years = new Map();
      for (const feature of features) {
        const p = feature.properties;
        const year = p.date.slice(0, 4);
        if (!years.has(year)) years.set(year, { year, records: 0, units: 0, valuation: 0 });
        const row = years.get(year);
        row.records += 1;
        row.units += p.units ?? 0;
        row.valuation += p.valuation ?? 0;
      }
      return [...years.values()].sort((a, b) => a.year.localeCompare(b.year));
    }
  }

  const api = { createTimeline };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PermitTimeline = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
