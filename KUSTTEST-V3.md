# Kusttest v3

Sjökortslagrets geografiska bounds är 8–27°E och 53–67°N.

Följande representativa kustpunkter har verifierats mot klientens tile-grid och ligger inom djuplagrets bounds:

- Strömstad
- Orust
- Göteborg
- Halmstad
- Öresund
- Karlskrona
- Gotland
- Stockholms skärgård
- Gävle
- Sundsvall
- Umeå
- Luleå
- Haparanda

Korrigeringar i v3:

- `emodnet:mean_multicolour` är borttaget; det var källan till den röda/orange kartan som kunde synas genom datagap.
- Det separata CARTO-rastret är borttaget ur sjökortsläget.
- Den breda suddade kustremsan är borttagen.
- Neutral vattenfyllning och landmask möts direkt i MapTilers kustgeometri.
- Djupfyllning och konturer använder cacheversion `v=3`.

Extern live-rendering av EMODnet kunde inte köras i kontrollmiljön eftersom extern DNS saknades. Kod, tile-grid, geografiska bounds, lagerordning och paketintegritet har verifierats lokalt.
