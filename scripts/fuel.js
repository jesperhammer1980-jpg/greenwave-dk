import {state} from "./state.js";
import {els} from "./dom.js";
import {escapeHtml,formatDistance,buildGoogleMapsLink,haversine,projectPointToSegment} from "./utils.js";
import {loadFuelPriceData,attachFuelPrices,getFuelPriceStatus} from "./fuel-price-service.js";

const OVERPASS_ENDPOINTS=[
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter"
];

export async function loadFuelStations(geometry){
  state.fuelStations=[];

  if(!Array.isArray(geometry)||geometry.length<2)return;

  const bbox=routeBbox(geometry,0.08);
  const bboxQuery=buildBboxQuery(bbox);

  let stations=await runOverpassQuery(bboxQuery);

  if(!stations.length){
    stations=await searchRouteSamples(geometry);
  }

  await loadFuelPriceData();
  state.fuelStations=dedupe(stations);
}

export function computeRouteDistances(){
  const g=state.routeData?.geometry||[];
  const segs=[];
  let cum=0;

  for(let i=1;i<g.length;i++){
    const a=g[i-1];
    const b=g[i];

    const length=haversine(a[1],a[0],b[1],b[0]);

    segs.push({
      start:a,
      end:b,
      startMeters:cum,
      length
    });

    cum+=length;
  }

  state.fuelStations.forEach(s=>{
    let best=Infinity;
    let along=Infinity;

    segs.forEach(seg=>{
      const p=projectPointToSegment(
        s.lat,
        s.lng,
        seg.start[1],
        seg.start[0],
        seg.end[1],
        seg.end[0]
      );

      if(p.distanceMeters<best){
        best=p.distanceMeters;
        along=seg.startMeters+seg.length*p.t;
      }
    });

    s.distanceToRoute=best;
    s.distanceAlongRoute=along;
  });
}

export function applyPricesToStations(){
  state.fuelStations=attachFuelPrices(state.fuelStations,state.settings?.fuelType||"benzin95");
}

export function updateFuelBox(){
  if(!els.fuelContent)return;

  if(!state.routeData){
    els.fuelContent.textContent="Beregn en rute først.";
    return;
  }

  const st=getStations();

  if(!st.length){
    const status=getFuelPriceStatus();
    els.fuelContent.innerHTML=`
      <div class="fuel-name">Ingen tankstationer fundet</div>
      <div class="fuel-meta">OSM/Overpass returnerede ingen stationer langs ruten.</div>
      <div class="fuel-meta">${escapeHtml(status.label)}</div>
    `;
    return;
  }

  const b=st[0];

  els.fuelContent.innerHTML=`
    <div class="fuel-name">${escapeHtml(b.name)}</div>
    <div class="fuel-meta">${formatDistance(b.distanceAlongRoute)} langs ruten</div>
    <div class="fuel-meta">${formatDistance(b.distanceToRoute)} fra ruten</div>
    <div class="fuel-meta">${renderPriceLine(b)}</div>
  `;
}

export function updateFuelMarkers(){
  clearFuelMarkers();

  getStations().slice(0,18).forEach(s=>{
    const icon=L.divIcon({
      className:"fuel-marker",
      html:`<div class="fuel-overview-pin">⛽ ${escapeHtml(shortName(s.name))}</div>`,
      iconSize:[124,38],
      iconAnchor:[62,38]
    });

    state.fuelMarkers.push(
      L.marker([s.lat,s.lng],{icon}).addTo(state.map)
    );
  });
}

export function clearFuelMarkers(){
  state.fuelMarkers.forEach(m=>state.map.removeLayer(m));
  state.fuelMarkers=[];
}

export function openFuelList(){
  renderFuelList();
  els.fuelListModal.classList.remove("hidden");
  els.fuelListBackdrop.classList.remove("hidden");
}

export function closeFuelList(){
  els.fuelListModal.classList.add("hidden");
  els.fuelListBackdrop.classList.add("hidden");
}

export function renderFuelList(){
  const st=getStations();

  els.fuelListContent.innerHTML=st.length
    ? st.map(s=>`
      <article class="fuel-card">
        <div class="fuel-name">${escapeHtml(s.name)}</div>
        <div class="fuel-meta">${formatDistance(s.distanceAlongRoute)} langs ruten</div>
        <div class="fuel-meta">${formatDistance(s.distanceToRoute)} fra ruten</div>
        <div class="fuel-meta">${renderPriceLine(s)}</div>
        <a class="fuel-map-link" href="${buildGoogleMapsLink(s)}" target="_blank">
          Åbn i Google Maps
        </a>
      </article>
    `).join("")
    : `<div class="fuel-card">Ingen tankstationer fundet.</div>`;
}

function renderPriceLine(station){
  if(Number.isFinite(Number(station.price))){
    return `${Number(station.price).toLocaleString("da-DK",{minimumFractionDigits:2,maximumFractionDigits:2})} kr/L · ${escapeHtml(station.priceProduct||"Brændstof")} · ${escapeHtml(station.dataAgeLabel||"")}`;
  }

  const status=getFuelPriceStatus();
  return status.hasPrices ? "Pris ikke tilgængelig for denne station" : escapeHtml(status.label);
}

function getStations(){
  return state.fuelStations
    .filter(s=>Number.isFinite(s.distanceToRoute))
    .filter(s=>s.distanceToRoute<=12000)
    .sort((a,b)=>
      state.fuelListSort==="detour"
        ? a.distanceToRoute-b.distanceToRoute
        : a.distanceAlongRoute-b.distanceAlongRoute
    )
    .slice(0,30);
}

function routeBbox(geometry,paddingDegrees){
  let minLat=Infinity;
  let minLng=Infinity;
  let maxLat=-Infinity;
  let maxLng=-Infinity;

  geometry.forEach(point=>{
    const lng=point[0];
    const lat=point[1];

    minLat=Math.min(minLat,lat);
    maxLat=Math.max(maxLat,lat);
    minLng=Math.min(minLng,lng);
    maxLng=Math.max(maxLng,lng);
  });

  return {
    south:minLat-paddingDegrees,
    west:minLng-paddingDegrees,
    north:maxLat+paddingDegrees,
    east:maxLng+paddingDegrees
  };
}

function buildBboxQuery(bbox){
  const b=`${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  return `[out:json][timeout:35];
  (
    node["amenity"="fuel"](${b});
    way["amenity"="fuel"](${b});
    relation["amenity"="fuel"](${b});
  );
  out center tags;`;
}

async function searchRouteSamples(geometry){
  const points=sampleRoutePoints(geometry,12);
  const all=[];

  for(const point of points){
    const query=`[out:json][timeout:20];
    (
      node(around:9000,${point.lat},${point.lng})["amenity"="fuel"];
      way(around:9000,${point.lat},${point.lng})["amenity"="fuel"];
      relation(around:9000,${point.lat},${point.lng})["amenity"="fuel"];
    );
    out center tags;`;

    const found=await runOverpassQuery(query);

    all.push(...found);
  }

  return all;
}

async function runOverpassQuery(query){
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {"Content-Type":"text/plain;charset=UTF-8"},
        body: query
      }, 9000);

      if(!response.ok)continue;

      const data=await response.json();

      const stations=(data.elements||[])
        .map(normalizeStation)
        .filter(Boolean);

      if(stations.length)return stations;

    }catch(error){
      console.warn("Overpass endpoint failed",endpoint,error);
    }
  }

  return [];
}

function normalizeStation(el){
  const lat=typeof el.lat==="number"?el.lat:el.center?.lat;
  const lng=typeof el.lon==="number"?el.lon:el.center?.lon;

  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;

  const tags=el.tags||{};

  return {
    id:`${el.type}-${el.id}`,
    lat,
    lng,
    name:tags.name||tags.brand||tags.operator||"Tankstation",
    brand:tags.brand||tags.operator||"",
    distanceToRoute:Infinity,
    distanceAlongRoute:Infinity
  };
}

function sampleRoutePoints(geometry,count){
  const points=[];

  for(let i=0;i<count;i++){
    const index=Math.round((geometry.length-1)*(i/(count-1)));
    const point=geometry[index];

    if(point){
      points.push({
        lng:point[0],
        lat:point[1]
      });
    }
  }

  return points;
}

function dedupe(stations){
  const seen=new Set();

  return stations.filter(station=>{
    const key =
      station.id ||
      Math.round(station.lat*10000)+":"+Math.round(station.lng*10000);

    if(seen.has(key))return false;

    seen.add(key);
    return true;
  });
}

function shortName(name){
  return String(name)
    .replace("Circle K","CK")
    .replace("Uno-X","UX")
    .replace("Tankstation","Fuel")
    .slice(0,14);
}


async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
