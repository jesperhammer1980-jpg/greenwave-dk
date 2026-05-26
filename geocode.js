const DAWA_AUTOCOMPLETE = 'https://api.dataforsyningen.dk/autocomplete';
const DAWA_ADRESSER = 'https://api.dataforsyningen.dk/adresser';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const raw =
    request.query?.q ||
    request.query?.address ||
    request.body?.q ||
    request.body?.address ||
    '';

  const input = normalizeAddressInput(raw);

  if (!input) {
    return response.status(400).json({
      ok: false,
      message: 'Missing address',
      input: raw,
      normalized: input,
      attempts: []
    });
  }

  const attempts = [];

  const dawaAutocomplete = await tryDawaAutocomplete(input);
  attempts.push(dawaAutocomplete.attempt);
  if (dawaAutocomplete.result) {
    return response.status(200).json({
      ok: true,
      provider: 'DAWA autocomplete',
      input: raw,
      normalized: input,
      result: dawaAutocomplete.result,
      attempts
    });
  }

  const dawaAdresser = await tryDawaAdresser(input);
  attempts.push(dawaAdresser.attempt);
  if (dawaAdresser.result) {
    return response.status(200).json({
      ok: true,
      provider: 'DAWA adresser',
      input: raw,
      normalized: input,
      result: dawaAdresser.result,
      attempts
    });
  }

  const nominatim = await tryNominatim(input);
  attempts.push(nominatim.attempt);
  if (nominatim.result) {
    return response.status(200).json({
      ok: true,
      provider: 'Nominatim',
      input: raw,
      normalized: input,
      result: nominatim.result,
      attempts
    });
  }

  return response.status(404).json({
    ok: false,
    message: `Address not found: ${input}`,
    input: raw,
    normalized: input,
    attempts
  });
}

function normalizeAddressInput(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

async function tryDawaAutocomplete(input) {
  const variants = makeAddressVariants(input);

  for (const q of variants) {
    const url = `${DAWA_AUTOCOMPLETE}?type=adresse&caretpos=${encodeURIComponent(String(q.length))}&fuzzy=true&per_side=8&q=${encodeURIComponent(q)}`;

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const items = Array.isArray(data) ? data : [];

      const addressSuggestion = items.find(item =>
        item?.type === 'adresse' &&
        item?.data &&
        Number.isFinite(Number(item.data.x)) &&
        Number.isFinite(Number(item.data.y))
      ) || items.find(item =>
        item?.data &&
        Number.isFinite(Number(item.data.x)) &&
        Number.isFinite(Number(item.data.y))
      );

      if (addressSuggestion) {
        return {
          attempt: { provider: 'DAWA autocomplete', ok: true, q, results: items.length },
          result: normalizeDawaSuggestion(addressSuggestion, input)
        };
      }

      if (items.length) {
        const href = items.find(item => item?.data?.href)?.data?.href;
        if (href) {
          const detail = await fetch(href, { headers: { Accept: 'application/json' } });
          if (detail.ok) {
            const detailData = await detail.json();
            const normalized = normalizeDawaAddress(detailData, input);
            if (normalized) {
              return {
                attempt: { provider: 'DAWA autocomplete href', ok: true, q, results: items.length },
                result: normalized
              };
            }
          }
        }
      }

      if (items.length === 0) {
        continue;
      }
    } catch (error) {
      return {
        attempt: { provider: 'DAWA autocomplete', ok: false, q, error: error.message },
        result: null
      };
    }
  }

  return {
    attempt: { provider: 'DAWA autocomplete', ok: true, q: variants[0], results: 0 },
    result: null
  };
}

async function tryDawaAdresser(input) {
  const variants = makeAddressVariants(input);

  for (const q of variants) {
    const url = `${DAWA_ADRESSER}?q=${encodeURIComponent(q)}&struktur=mini&per_side=8`;

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const items = Array.isArray(data) ? data : [];

      const item = items.find(candidate =>
        candidate?.adgangsadresse?.adgangspunkt?.koordinater ||
        candidate?.adgangspunkt?.koordinater
      );

      if (item) {
        return {
          attempt: { provider: 'DAWA adresser', ok: true, q, results: items.length },
          result: normalizeDawaAddress(item, input)
        };
      }
    } catch (error) {
      return {
        attempt: { provider: 'DAWA adresser', ok: false, q, error: error.message },
        result: null
      };
    }
  }

  return {
    attempt: { provider: 'DAWA adresser', ok: true, q: variants[0], results: 0 },
    result: null
  };
}

async function tryNominatim(input) {
  const variants = makeAddressVariants(input);

  for (const q of variants) {
    const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&limit=8&countrycodes=dk&q=${encodeURIComponent(q)}`;

    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GreenWave-DK/1.0'
        }
      });

      const data = await res.json();
      const items = Array.isArray(data) ? data : [];

      const item = items.find(candidate =>
        Number.isFinite(Number(candidate.lat)) &&
        Number.isFinite(Number(candidate.lon))
      );

      if (item) {
        return {
          attempt: { provider: 'Nominatim', ok: true, q, results: items.length },
          result: {
            lat: Number(item.lat),
            lng: Number(item.lon),
            label: formatNominatimLabel(item),
            displayName: item.display_name || input,
            raw: item
          }
        };
      }
    } catch (error) {
      return {
        attempt: { provider: 'Nominatim', ok: false, q, error: error.message },
        result: null
      };
    }
  }

  return {
    attempt: { provider: 'Nominatim', ok: true, q: variants[0], results: 0 },
    result: null
  };
}

function makeAddressVariants(input) {
  const trimmed = normalizeAddressInput(input);
  const withoutComma = trimmed.replace(/,/g, ' ');
  const compact = withoutComma.replace(/\s+/g, ' ').trim();
  const dk = /danmark|denmark/i.test(compact) ? compact : `${compact}, Danmark`;

  const variants = [
    trimmed,
    compact,
    dk,
  ];

  const parts = compact.match(/^(.+?)\s+(\d{4})\s+(.+)$/);
  if (parts) {
    variants.push(`${parts[1]}, ${parts[2]} ${parts[3]}`);
    variants.push(`${parts[1]} ${parts[2]} ${parts[3]}`);
  }

  return [...new Set(variants.filter(Boolean))];
}

function normalizeDawaSuggestion(item, input) {
  const data = item.data || {};
  const lat = Number(data.y);
  const lng = Number(data.x);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    label: item.tekst || data.betegnelse || input,
    displayName: item.tekst || data.betegnelse || input,
    dawaId: data.id || null,
    raw: item
  };
}

function normalizeDawaAddress(item, input) {
  const coords =
    item?.adgangsadresse?.adgangspunkt?.koordinater ||
    item?.adgangspunkt?.koordinater ||
    item?.adgangspunkt?.position ||
    null;

  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lng = Number(coords[0]);
  const lat = Number(coords[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    label: item.betegnelse || input,
    displayName: item.betegnelse || input,
    dawaId: item.id || null,
    raw: item
  };
}

function formatNominatimLabel(item) {
  const address = item.address || {};
  const road = address.road || address.pedestrian || address.path || item.name || '';
  const number = address.house_number || '';
  const postcode = address.postcode || '';
  const city = address.city || address.town || address.village || address.municipality || '';

  return [road, number, postcode, city].filter(Boolean).join(' ') || item.display_name || 'Destination';
}
