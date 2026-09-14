// ===========================================================================
//  CampusMap.tsx — the buildings on a real map, coloured by how free they are.
//
//  The point is not the map; it is the ANSWER ON the map. Each building is a
//  pin carrying its number and how many of its rooms are free this minute, so
//  a student crossing campus can see where to head without reading a list.
//
//  Leaflet + OpenStreetMap, the same pair the bus route map uses — no API key,
//  no account, and index.css already carries the dark-mode tile treatment and
//  the z-index fix that keeps Leaflet's controls under the app's own bars.
//
//  Leaflet is imported dynamically, exactly as RouteMap does it, so the ~150KB
//  of mapping code is not in the bundle of someone who only ever wants a list.
// ===========================================================================

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * What the map needs of a building. Deliberately NOT the full BuildingRow:
 * the admin's catalogue endpoint has no availability counts (it is a list of
 * what exists, not of what is free), and a map of buildings should not demand
 * them. When `availableNow` is missing the pin simply shows the building.
 */
export type MappableBuilding = {
  id: number;
  code: number;
  name: string;
  latitude: string | null;
  longitude: string | null;
  availableNow?: number;
  roomCount?: number;
};

/** The pin: building code, and the free count that justifies the walk. */
function pinHtml(building: MappableBuilding, selected: boolean) {
  const free = building.availableNow;
  const unknown = free === undefined;
  // Green when there is real choice, amber when nearly full, red when there is
  // nothing, neutral when availability is not part of this map. The number is
  // always beside the colour, so colour never carries the message alone.
  const tone = unknown ? "#45464d" : free === 0 ? "#ba1a1a" : free <= 2 ? "#b45309" : "#006c49";
  const scale = selected ? 1.12 : 1;
  return `
    <div style="
      transform: translate(-50%, -100%) scale(${scale});
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      font: 700 12px/1 Inter, system-ui, sans-serif; white-space: nowrap;
    ">
      <div style="
        display: flex; align-items: center; gap: 6px;
        background: ${tone}; color: #fff;
        padding: 5px 9px; border-radius: 9999px;
        border: 2px solid ${selected ? "#fff" : "rgba(255,255,255,.65)"};
        box-shadow: 0 4px 10px rgb(0 0 0 / .35);
      ">
        <span style="font-size: 13px;">${building.code}</span>
        <span style="font-weight: 600; opacity: .95;">${unknown ? escapeHtml(building.name) : `${free} free`}</span>
      </div>
      <div style="width: 2px; height: 8px; background: ${tone};"></div>
    </div>`;
}

/** Building names are administrator input, so never drop them into raw HTML. */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
}

export function CampusMap({
  buildings,
  selectedCode,
  onSelect,
  onPick,
  height = 380,
}: {
  buildings: MappableBuilding[];
  selectedCode?: number | null;
  onSelect?: (code: number) => void;
  /** Admin only: click anywhere to drop the selected building there. */
  onPick?: (latitude: number, longitude: number) => void;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [failed, setFailed] = useState(false);
  // Leaflet is imported dynamically, so the map may not exist yet when the
  // buildings arrive — or the buildings may arrive first. Without this flag in
  // the pin effect's dependencies, whichever finishes SECOND leaves the map
  // empty: the effect either returns early on a null map, or never re-runs.
  const [ready, setReady] = useState(false);

  // Callbacks live in refs so changing them does not tear the map down.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const placed = buildings.filter(row => row.latitude && row.longitude);
  /** Changes only when something the pins actually show changes. */
  const pinSignature = placed.map(row => `${row.code}:${row.latitude},${row.longitude}:${row.availableNow ?? "-"}/${row.roomCount ?? "-"}`).join("|");

  // --- create the map once -------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const leaflet = (await import("leaflet")).default;
        if (cancelled || !container.current || mapRef.current) return;
        leafletRef.current = leaflet;

        const map = leaflet.map(container.current, { scrollWheelZoom: false, attributionControl: true });
        leaflet
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          })
          .addTo(map);

        map.setView([16.833, 96.1333], 16); // replaced by fitBounds as soon as there are pins
        map.on("click", event => pickRef.current?.(event.latlng.lat, event.latlng.lng));
        mapRef.current = map;
        setReady(true);
      } catch {
        // Offline, or the tiles are blocked. The list view still works, so say
        // so quietly rather than breaking the page.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
      setReady(false);
    };
  }, []);

  // --- redraw the pins whenever the counts or the selection change ---------
  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    for (const building of placed) {
      const latitude = Number(building.latitude);
      const longitude = Number(building.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      const marker = leaflet
        .marker([latitude, longitude], {
          icon: leaflet.divIcon({ html: pinHtml(building, building.code === selectedCode), className: "", iconSize: [0, 0] }),
          keyboard: true,
          title:
            building.availableNow === undefined
              ? building.name
              : `${building.name} — ${building.availableNow} of ${building.roomCount ?? "?"} rooms free`,
        })
        .addTo(map);

      marker.on("click", event => {
        // Without this the click also lands on the map, which in admin mode
        // would move the building you just tried to select.
        leaflet.DomEvent.stopPropagation(event as unknown as Event);
        selectRef.current?.(building.code);
      });
      marker.bindTooltip(
        building.availableNow === undefined
          ? escapeHtml(building.name)
          : `${escapeHtml(building.name)}<br>${building.availableNow} of ${building.roomCount ?? "?"} rooms free`,
        { direction: "top", offset: [0, -34] },
      );
      markersRef.current.push(marker);
    }

    if (markersRef.current.length) {
      const bounds = leaflet.latLngBounds(markersRef.current.map(marker => marker.getLatLng()));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pinSignature, selectedCode]);

  if (failed) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant text-center text-[13px] text-on-surface-variant">
        <MapPin className="h-5 w-5" />
        The map could not load. Everything else on this page still works.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={container} className="w-full overflow-hidden rounded-lg border border-outline-variant" style={{ height }} />
      {!placed.length ? (
        <p className="flex items-start gap-2 text-[12px] text-on-surface-variant">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          No building has been placed on the map yet. An administrator sets this in Admin → Campus &amp; rooms.
        </p>
      ) : placed.length < buildings.length ? (
        <p className="flex items-start gap-2 text-[12px] text-on-surface-variant">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {buildings.length - placed.length} building(s) are not on the map yet.
        </p>
      ) : null}
    </div>
  );
}
