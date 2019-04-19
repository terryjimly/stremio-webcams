# Stremio Add-on for Webcams

Skyline webcams add-on for Stremio.

This add-on currently supports: catalog, skipping, searching, filter by country, live stream, timelapse stream, external url to view webcam location on map

## Running

```
npm i
npm start
```

## Installing

Go to the Add-ons page, then click "Community Add-ons", scroll down to "Skyline Webcams", press "Install"


## Code

- `index.js`: run add-on, serve items from an array, handle searching internally

- `config.js`: configuration file, includes cache times

- `streams.js`: fetch streams and redis caching
