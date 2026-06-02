GreenWave DK samlet rettelsespakke

Indhold:
- api/overpass.js
- api/fuel-prices.js
- api/fuel-route.js
- app/app.js
- CHECKS.txt

Vigtige rettelser:
1. Overpass/fuel-route finder stationer langs ruten.
2. 0,00 kr/l vises ikke længere for manglende priser.
3. Circle K Truck Diesel må ikke få miles95/benzin95 som fallback-pris.
4. app/app.js læser debug robust fra debug.overpass/debug/counts, så raw/norm ikke bliver '?' hvis API returnerer tallene et andet sted.
5. Der er stadig kun reel prisdækning fra Circle K / INGO. OSM finder andre stationer, men leverer ikke live brændstofpriser.
