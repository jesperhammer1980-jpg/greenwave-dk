export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");res.setHeader("Access-Control-Allow-Origin","*");
  const from=String(req.query.from||"Lupinvej 3, 3390 Hundested"),to=String(req.query.to||"Herstedøstervej 27, 2620 Albertslund"),fuelType=String(req.query.fuelType||"benzin95"),maxDetour=Number(req.query.maxDetour||2000),fuelAlong=Number(req.query.fuelAlong||50000);
  const out={input:{from,to,fuelType,maxDetour,fuelAlong},route:{ok:false},fuel:{},errors:[]};
  try{
    const [a,b]=await Promise.all([geocode(req,from),geocode(req,to)]);
    const route=await routeOsrm(a,b);
    out.route={ok:true,from:a,to:b,distance:route.distance,duration:route.duration,geometryPoints:route.geometry.length,message:`${Math.round(route.distance)} m / ${Math.round(route.duration)} s / ${route.geometry.length} geometry points`};
    const fr=await fetch(`${origin(req)}/api/fuel-route`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({geometry:route.geometry,fuelType,maxDetourMeters:maxDetour,fuelAlongMeters:fuelAlong})});
    const fd=await fr.json();if(!fr.ok||!fd.ok)throw new Error(fd.error||`fuel-route ${fr.status}`);
    out.fuel={...fd.counts,rawElements:fd.debug?.rawElements,normalizedStations:fd.debug?.normalizedStations,attempts:fd.debug?.attempts,nearest:fd.stations?.slice(0,15),debug:fd.debug};
  }catch(e){out.route.ok=false;out.route.message=e.message;out.errors.push(e.stack||e.message);}
  res.status(200).json(out);
}
async function geocode(req,q){const r=await fetch(`${origin(req)}/api/geocode?q=${encodeURIComponent(q)}&limit=1&debug=1`);const d=await r.json();const item=Array.isArray(d)?d[0]:(d.result||d.results?.[0]);if(!r.ok||!item)throw new Error(`geocode failed for ${q}: ${d.message||d.error||r.status}`);return{lat:Number(item.lat),lng:Number(item.lng??item.lon),displayName:item.displayName||item.label||q,provider:item.provider};}
async function routeOsrm(a,b){const url=`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&steps=false&alternatives=true`;const r=await fetch(url);if(!r.ok)throw new Error(`OSRM ${r.status}`);const d=await r.json();if(!d.routes?.length)throw new Error("OSRM no route");const route=d.routes[0];return{geometry:route.geometry.coordinates,distance:route.distance,duration:route.duration};}
function origin(req){const host=req.headers["x-forwarded-host"]||req.headers.host||process.env.VERCEL_URL;const proto=req.headers["x-forwarded-proto"]||"https";return`${proto}://${host}`;}
