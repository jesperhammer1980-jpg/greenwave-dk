const $=id=>document.getElementById(id);
$("diagRunBtn").addEventListener("click",run);
async function run(){
  $("diagRaw").textContent="Kører...";
  $("diagCards").innerHTML="";
  const qs=new URLSearchParams({from:$("diagFrom").value,to:$("diagTo").value,fuelType:$("diagFuelType").value,maxDetour:$("diagMaxDetour").value,fuelAlong:$("diagFuelAlong").value});
  try{
    const r=await fetch(`/api/diagnostics?${qs}`,{cache:"no-store"});
    const d=await r.json();
    renderCards(d);
    $("diagRaw").textContent=JSON.stringify(d,null,2);
  }catch(e){$("diagRaw").textContent=e.stack||e.message;}
}
function renderCards(d){
  const cards=[["Rute",d.route?.ok?"OK":"FEJL",d.route?.message||""],["OSM stationer",d.fuel?.osmStations??0,"Fra Overpass"],["Stationer langs ruten",d.fuel?.returned??0,"Efter filter"],["Priser",d.fuel?.priced??0,d.input?.fuelType||""],["API m. koordinater",d.fuel?.apiStations??0,"Pris-API"],["Debug raw",d.fuel?.rawElements??0,"Overpass raw"]];
  $("diagCards").innerHTML=cards.map(c=>`<article class="diag-card"><h3>${esc(c[0])}</h3><strong>${esc(c[1])}</strong><small>${esc(c[2])}</small></article>`).join("");
}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
