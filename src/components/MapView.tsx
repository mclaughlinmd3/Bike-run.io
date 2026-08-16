import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, Polygon, LineString } from 'geojson';
import { OSM_RASTER_STYLE } from '../lib/mapStyle';
import type { Profile, TerritoryStateRow, TrackPoint } from '../lib/types';

const TERRITORY_SOURCE = 'territory';
const LIVE_TRACK_SOURCE = 'live-track';
const PREVIEW_SOURCE = 'preview';
const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

interface MapViewProps {
  rows: TerritoryStateRow[];
  profiles: Record<string, Profile>;
  liveTrack?: TrackPoint[];
  previewPolygons?: Feature<Polygon>[];
  center?: [number, number];
}

function territoryToFeatureCollection(
  rows: TerritoryStateRow[],
  profiles: Record<string, Profile>,
): FeatureCollection {
  const features: Feature[] = [];
  for (const row of rows) {
    if (!row.polygon) continue;
    const profile = profiles[row.user_id];
    features.push({
      type: 'Feature',
      geometry: row.polygon,
      properties: {
        color: profile?.color ?? '#888888',
        name: profile?.name ?? 'Unknown',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export default function MapView({ rows, profiles, liveTrack, previewPolygons, center }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: center ?? [-122.42, 37.77],
      zoom: 14,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'top-right');

    map.on('load', () => {
      map.addSource(TERRITORY_SOURCE, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'territory-fill',
        type: 'fill',
        source: TERRITORY_SOURCE,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.45 },
      });
      map.addLayer({
        id: 'territory-outline',
        type: 'line',
        source: TERRITORY_SOURCE,
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      });

      map.addSource(LIVE_TRACK_SOURCE, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'live-track-line',
        type: 'line',
        source: LIVE_TRACK_SOURCE,
        paint: { 'line-color': '#111111', 'line-width': 3, 'line-dasharray': [1, 1] },
      });

      map.addSource(PREVIEW_SOURCE, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'preview-fill',
        type: 'fill',
        source: PREVIEW_SOURCE,
        paint: { 'fill-color': '#ffd700', 'fill-opacity': 0.55 },
      });
      map.addLayer({
        id: 'preview-outline',
        type: 'line',
        source: PREVIEW_SOURCE,
        paint: { 'line-color': '#b8860b', 'line-width': 2 },
      });

      loadedRef.current = true;
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(TERRITORY_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData(territoryToFeatureCollection(rows, profiles));
    };
    if (loadedRef.current) apply();
    else map.once('load', apply);
  }, [rows, profiles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(LIVE_TRACK_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      if (!liveTrack || liveTrack.length < 2) {
        source.setData(EMPTY_FC);
        return;
      }
      const line: Feature<LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: liveTrack.map((p) => [p.lng, p.lat]) },
      };
      source.setData({ type: 'FeatureCollection', features: [line] });

      const last = liveTrack[liveTrack.length - 1];
      map.easeTo({ center: [last.lng, last.lat], duration: 300 });
    };
    if (loadedRef.current) apply();
    else map.once('load', apply);
  }, [liveTrack]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(PREVIEW_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData({
        type: 'FeatureCollection',
        features: previewPolygons ?? [],
      });
    };
    if (loadedRef.current) apply();
    else map.once('load', apply);
  }, [previewPolygons]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
