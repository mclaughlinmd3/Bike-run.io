import type { StyleSpecification } from 'maplibre-gl';

// Free, token-free basemap so the app runs with zero signup out of the box.
// Swap for a Mapbox/MapTiler/Stadia vector style in production — OSM's
// tile.openstreetmap.org endpoint is rate-limited and not meant for heavy
// production traffic (see https://operations.osmfoundation.org/policies/tiles/).
export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
