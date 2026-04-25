
let map = L.map('map').setView([55.67, 12.56], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let currentPos = null;
let routeLine = null;

navigator.geolocation.watchPosition(pos => {
  currentPos = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0
  };

  document.getElementById("driveCurrentValue").innerText = currentPos.speed + " km/t";

}, err => console.log(err), { enableHighAccuracy: true });

document.getElementById("calcRouteBtn").onclick = async () => {
  const dest = document.getElementById("destinationInput").value;

  const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${dest}`);
  const data = await geo.json();

  const d = data[0];

  const url = `https://router.project-osrm.org/route/v1/driving/${currentPos.lng},${currentPos.lat};${d.lon},${d.lat}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const route = await res.json();

  const coords = route.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);

  if (routeLine) map.removeLayer(routeLine);

  routeLine = L.polyline(coords).addTo(map);
  map.fitBounds(routeLine.getBounds());
};

fetch("fuel-prices.json")
  .then(r => r.json())
  .then(data => {
    document.getElementById("fuelBox").innerText =
      "Station: " + data[0].name;
  });
