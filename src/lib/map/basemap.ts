// Shared MapLibre + PMTiles plumbing for every map on the site (the flight
// card, the trip map). One place for the worker URL, the pmtiles protocol,
// the basemap style and the mono theme palette.
//
// Vite-bundled URL for MapLibre's worker: the library's own worker loading
// goes through the dep-optimizer cache, which serves it with a broken MIME
// type in dev. ?worker&url makes Vite bundle it as a proper asset instead.
import type { StyleSpecification } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// PMTiles basemap served straight from R2 via HTTP range requests — no tile
// server. See flight-recorder/README.md for how the archive is built/hosted.
export const TILES_URL = 'https://files.davesnider.com/tiles/planet.pmtiles';
export const BASEMAP_ASSETS = 'https://protomaps.github.io/basemaps-assets';

export type MapTheme = 'light' | 'dark';

export type MapPalette = {
  flavorName: 'black' | 'grayscale';
  lineColor: string;
  haloColor: string;
};

export type MapLibs = {
  maplibregl: typeof import('maplibre-gl');
  pmtiles: typeof import('pmtiles');
  basemaps: typeof import('@protomaps/basemaps');
};

// Mono flavors both ways: 'grayscale' (light) / 'black' (dark).
export function mapPalette(theme: MapTheme): MapPalette {
  return theme === 'dark'
    ? { flavorName: 'black', lineColor: '#f2f2f2', haloColor: '#1a1a1a' }
    : { flavorName: 'grayscale', lineColor: '#1a1a1a', haloColor: '#f2f2f2' };
}

let libsPromise: Promise<MapLibs> | undefined;

// Dynamic-imports the map libraries (client only) once per page, sets the
// worker URL and registers the pmtiles protocol. addProtocol is global, so
// doing it once here keeps every map instance from re-registering it.
export function loadMapLibs(): Promise<MapLibs> {
  if (!libsPromise) {
    libsPromise = Promise.all([import('maplibre-gl'), import('pmtiles'), import('@protomaps/basemaps')]).then(
      ([maplibregl, pmtiles, basemaps]) => {
        maplibregl.setWorkerUrl(maplibreWorkerUrl);
        const protocol = new pmtiles.Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);
        return { maplibregl, pmtiles, basemaps };
      }
    );
  }
  return libsPromise;
}

export type BasemapOptions = {
  // City and neighbourhood names (places_locality / places_subplace). Off for
  // maps where the overlay carries the story; states and countries stay.
  placeLabels?: boolean;
  // Road names and highway route shields.
  roadLabels?: boolean;
};

// Basemap label layers dropped by the options above
const PLACE_LABEL_LAYERS = new Set(['places_locality', 'places_subplace']);
const ROAD_LABEL_LAYERS = new Set(['roads_labels_major', 'roads_labels_minor', 'roads_shields']);

export function basemapStyle(
  basemaps: MapLibs['basemaps'],
  theme: MapTheme,
  { placeLabels = true, roadLabels = true }: BasemapOptions = {}
): StyleSpecification {
  const { flavorName } = mapPalette(theme);
  const flavor = basemaps.namedFlavor(flavorName);
  const layers = basemaps
    .layers('protomaps', flavor, { lang: 'en' })
    .filter((layer) => placeLabels || !PLACE_LABEL_LAYERS.has(layer.id))
    .filter((layer) => roadLabels || !ROAD_LABEL_LAYERS.has(layer.id));
  return {
    version: 8,
    glyphs: `${BASEMAP_ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${BASEMAP_ASSETS}/sprites/v4/${flavorName}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${TILES_URL}`,
        attribution: '© OpenStreetMap'
      }
    },
    layers
  };
}
