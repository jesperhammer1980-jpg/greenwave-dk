import {state} from "./state.js";
import {els} from "./dom.js";
import {escapeHtml,formatDistance,buildGoogleMapsLink,haversine,projectPointToSegment} from "./utils.js";

export async function loadFuelStations(geometry){
  state.fuelStations=[];

  if(!Array.isArray(geometry)||geometry.length<2)return;

  const pts=sampleRoutePoints(geometry,28);

  const queries=[
    buildOverpassQuery(pts,6500),
    buildOverpassQuery(pts,10000)
  ];

  for(const query of queries){
    try{
      const res=await fetch("https://overpass-api.de/api/interpreter",{
        method:"POST",
        headers:{"Content-Type":"text/plain;charset=UTF-8"},
        body:query
      });

      const data=await res.json();

      const found=dedupe(
        (data.elements||[])
          .map(norm)
          .filter(Boolean)
      );

      if(found.length){
        state.fuelStations=found;
        break;
      }
    }catch(error){
      console.warn("Fuel lookup failed",error);
    }
  }
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
  state.fuelStations=state.fuelStations.map(s=>({
    ...s,
    price:null,
    dataAgeLabel:"Pris ikke tilgængelig"
  }));
}

export function updateFuelBox(){
  if(!els.fuelContent)return;

  if(!state.routeData){
    els.fuelContent.textContent="Beregn en rute først.";
    return;
  }

  const st=getStations();

  if(!st.length){
    els.fuelContent.innerHTML=`
      <div class="fuel-name">Ingen tankstationer fundet</div>
      <div class="fuel-meta">Ingen OSM-stationer fundet tæt nok på ruten.</div>
      <div class="fuel-meta">Søgningen bruger nu op til 10 km fra ruten.</div>
    `;
    return;
  }

  const b=st[0];

  els.fuelContent.innerHTML=`
    <div class="fuel-name">${escapeHtml(b.name)}</div>
    <div class="fuel-meta">${formatDistance(b.distanceAlongRoute)} langs ruten</div>
    <div class="fuel-meta">${formatDistance(b.distanceToRoute)} fra ruten</div>
    <div class="fuel-meta">Pris ikke tilgængelig</div>
  `;
}

export function updateFuelMarkers(){
  clearFuelMarkers();

  getStations().slice(0,12).forEach(s=>{
    const icon=L.divIcon({
      className:"fuel-marker",
      html:`<div class="fuel-overview-pin">⛽ ${escapeHtml(shortName(s.name))}</div>`,
      iconSize:[118,38],
      iconAnchor:[59,38]
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
        <div class="fuel-meta">Pris ikke tilgængelig</div>
        <a class="fuel-map-link" href="${buildGoogleMapsLink(s)}" target="_blank">
          Åbn i Google Maps
        </a>
      </article>
    `).join("")
    : `<div class="fuel-card">Ingen tankstationer fundet.</div>`;
}

function getStations(){
  return state.fuelStations
    .filter(s=>Number.isFinite(s.distanceToRoute))
    .filter(s=>s.distanceToRoute<=10000)
    .sort((a,b)=>
      state.fuelListSort==="detour"
        ? a.distanceToRoute-b.distanceToRoute
        : a.distanceAlongRoute-b.distanceAlongRoute
    )
    .slice(0,20);
}

function buildOverpassQuery(points,radius){
  return `[out:json][timeout:35];
  (
    ${points.map(p=>`
      node(around:${radius},${p.lat},${p.lng})["amenity"="fuel"];
      way(around:${radius},${p.lat},${p.lng})["amenity"="fuel"];
      relation(around:${radius},${p.lat},${p.lng})["amenity"="fuel"];
    `).join("")}
  );
  out center tags;`;
}

function norm(el){
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

function sampleRoutePoints(g,count){
  const pts=[];

  for(let i=0;i<count;i++){
    const idx=Math.round((g.length-1)*(i/(count-1)));
    const p=g[idx];

    if(p)pts.push({
      lng:p[0],
      lat:p[1]
    });
  }

  return pts;
}

function dedupe(stations){
  const seen=new Set();

  return stations.filter(s=>{
    const key=Math.round(s.lat*10000)+":"+Math.round(s.lng*10000);

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
    .slice(0,12);
}
