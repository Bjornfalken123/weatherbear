# Djuplagerfix v8.1

V8 kunde avbryta hela sjökortslagret om den aktiva MapTiler-stilen saknade ett helt ofiltrerat `water`-fill-lager. Klientprotokollet returnerade dessutom en transparent tile när den externa vattenmasken inte kunde byggas.

V8.1 gör vattenmasken till en förbättring i stället för ett hårt krav:

- Djupkällan skapas även om MapTiler-masken tillfälligt saknas.
- Filtrerade MapTiler-water-lager kan användas som reservdescriptor.
- Om vattenmasken misslyckas färgsätts endast EMODnets egna giltiga alfapixlar.
- Ingen kustnära uppskattning görs i reservläget.
- Cacheversionen är `v=8.1`.
