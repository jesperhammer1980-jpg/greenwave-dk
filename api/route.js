export default async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=30, stale-while-revalidate=120");
  res.setHeader("Access-Control-Allow-Origin","*");
  const fromLat=Number(req.query.fromLat),fromLng=Number(req.query.fromLng),toLat=Number(req.query.toLat),toLng=Number(req.query.toLng);
  if(![fromLat,fromLng,toLat,toLng].every(Number.isFinite))return res.status(400).json({error:"Invalid coordinates"});
  try{const url=`https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false&alternatives=true`;const r=await fetch(url,{headers:{Accept:"application/json"}});if(!r.ok)return res.status(502).json({error:`OSRM HTTP ${r.status}`});return res.status(200).json(await r.json());}catch(e){return res.status(500).json({error:e.message});}
}