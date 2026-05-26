

## GeocodeFix

- Corrected diagnostic default start address to Lupinvej 3, 3390 Hundested.
- Rebuilt `/api/geocode` to use robust DAWA-first lookup:
  - DAWA autocomplete
  - DAWA adresser
  - Nominatim fallback
- Supports comma and non-comma Danish address variants.
- Added `/api/test-geocode?q=Lupinvej%203%2C%203390%20Hundested`.
