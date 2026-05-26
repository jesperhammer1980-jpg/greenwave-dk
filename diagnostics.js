const summary = document.getElementById('summary');
const raw = document.getElementById('raw');
const fromInput = document.getElementById('from');
const toInput = document.getElementById('to');
const runBtn = document.getElementById('run');

runBtn.addEventListener('click', run);

async function run() {
  summary.innerHTML = '';
  raw.textContent = 'Kører test...';
  runBtn.disabled = true;

  try {
    const url = `/api/diagnostics?from=${encodeURIComponent(fromInput.value)}&to=${encodeURIComponent(toInput.value)}&fuelType=benzin95&maxDetour=2000`;
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    raw.textContent = JSON.stringify(data, null, 2);

    addCard('Rute', data.route?.ok ? 'OK' : 'FEJL', data.route?.message || '', !data.route?.ok);
    addCard('Pris-API stationer', data.fuel?.priceApiStations ?? 0, 'Stationer fra pris-API', false);
    addCard('API stationer m. koordinater', data.fuel?.priceApiStationsWithCoords ?? 0, '', false);
    addCard('Stationer langs ruten', data.fuel?.withinDetour ?? 0, 'Inden for 2 km', false);
    addCard('Priser', data.fuel?.pricedForFuelType ?? 0, 'Benzin 95', false);
    addCard('Maxspeed ways', data.road?.maxspeedWays ?? 0, 'Hentet fra Overpass', false);
    addCard('Maxspeed matchet', data.road?.maxspeedMatched ?? 0, 'Inden for rutekorridor', false);
    addCard('Traffic signals', data.road?.signalsMatched ?? 0, 'Inden for rutekorridor', false);
  } catch (error) {
    raw.textContent = error.stack || error.message || String(error);
    addCard('Test', 'FEJL', error.message || String(error), true);
  } finally {
    runBtn.disabled = false;
  }
}

function addCard(title, value, note, error) {
  const card = document.createElement('div');
  card.className = `diag-card ${error ? 'error' : ''}`;
  card.innerHTML = `<h3>${escapeHtml(title)}</h3><strong>${escapeHtml(value)}</strong><br><small>${escapeHtml(note || '')}</small>`;
  summary.appendChild(card);
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
