# Weatherbear

Komplett Weatherbear-app med sjökortsläge v15.

Djupvisningen använder externa EMODnet Bathymetry WFS-kurvor som geometri för färggränser, synliga linjer och djupetiketter. EMODnets råa DTM-värden används endast för att bestämma vilket djupband som ligger på respektive sida om kurvan och som reserv där konturer saknas.

Körning och publicering sker på samma sätt som i tidigare kompletta appversioner. Cloudflare Pages Functions under `functions/api/` måste publiceras tillsammans med resten av projektet.
