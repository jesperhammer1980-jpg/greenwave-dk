const ENDPOINTS=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.osm.ch/api/interpreter"];
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  const query=req.body?.query;if(!query)return res.status(400).json({error:"Missing query"});
  const errors=[];for(const ep of ENDPOINTS){try{const r=await fetch(ep,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:query});if(r.ok)return res.status(200).json(await r.json());errors.push(`${ep} HTTP ${r.status}`);}catch(e){errors.push(`${ep} ${e.message}`);}}
  res.status(502).json({error:"All Overpass endpoints failed",details:errors});
}