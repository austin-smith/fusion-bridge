import type { StyleSpecification } from 'maplibre-gl';
import type { Location } from '@/types/index';

// GeoJSON types
type Position = [number, number];
type Point = {
    type: 'Point';
    coordinates: Position;
};
type Feature<G, P> = {
    type: 'Feature';
    geometry: G;
    properties: P;
};
type FeatureCollection<G, P> = {
    type: 'FeatureCollection';
    features: Feature<G, P>[];
};

type Bounds = [[number, number], [number, number]];

/**
 * Returns the default map style configuration for the application.
 *
 * FALLBACK_STYLE is a tokenless OpenStreetMap (OSM) raster style that includes
 * glyphs for symbol layers. This enables proper rendering of text/icons without
 * requiring any external access token, ensuring reliable map load in all envs.
 *
 * The style conforms to MapLibre's StyleSpecification and defines:
 * - glyphs: font PBFs used by symbol layers
 * - sources: OSM raster tiles
 * - layers: a single raster layer that displays the tiles
 */
export function getDefaultMapStyle(): StyleSpecification {
    return FALLBACK_STYLE;
}

export function locationsToFeatureCollection(locations: Location[]): FeatureCollection<Point, { id: string; name: string; city: string; state: string }> {
    const features: Array<Feature<Point, { id: string; name: string; city: string; state: string }>> = [];

    for (const loc of locations) {
        const latRaw = loc.latitude == null ? NaN : Number(loc.latitude);
        const lngRaw = loc.longitude == null ? NaN : Number(loc.longitude);
        if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) continue;
        const coordinates: Position = [lngRaw, latRaw];
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates },
            properties: {
                id: loc.id,
                name: loc.name,
                city: loc.addressCity ?? '',
                state: loc.addressState ?? '',
            },
        });
    }

    return { type: 'FeatureCollection', features };
}

export function computeViewAndBounds(
    featureCollection: FeatureCollection<Point, { id: string; name: string; city: string; state: string }>,
    selectedLocationId?: string | null
): {
    viewState: { longitude: number; latitude: number; zoom: number };
    bounds: Bounds | null;
    selectedFeatureCoordinates: [number, number] | null;
} {
    const features = featureCollection.features;

    // Defaults: continental US
    let center: [number, number] = [-98.5795, 39.8283];
    let zoom = 3;
    let bounds: Bounds | null = null;

    if (features.length === 1) {
        const coords = features[0].geometry.coordinates as [number, number];
        center = coords;
        zoom = 10;
        bounds = [coords, coords];
    } else if (features.length > 1) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const f of features) {
            const [x, y] = f.geometry.coordinates;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        center = [(minX + maxX) / 2, (minY + maxY) / 2];
        zoom = 3; // will fit on load
        bounds = [[minX, minY], [maxX, maxY]];
    }

    const selectedFeature = selectedLocationId
        ? features.find((f) => f.properties?.id === selectedLocationId)
        : undefined;
    const selectedFeatureCoordinates = selectedFeature
        ? selectedFeature.geometry.coordinates
        : null;

    return {
        viewState: { longitude: center[0], latitude: center[1], zoom },
        bounds,
        selectedFeatureCoordinates,
    };
}

// Centralized map styling constants (MapLibre style expressions cannot use CSS vars)
export const MAP_FONT_STACK_BOLD = ['Open Sans Bold', 'Arial Unicode MS Bold'] as const;

export const CLUSTER_CIRCLE_PAINT = {
    'circle-color': [
        'step',
        ['get', 'point_count'],
        '#bfdbfe',
        10, '#93c5fd',
        25, '#60a5fa',
        50, '#3b82f6',
        100, '#2563eb',
    ] as any,
    'circle-radius': [
        'step',
        ['get', 'point_count'],
        18,
        10, 24,
        25, 30,
        50, 36,
        100, 42,
    ] as any,
    'circle-stroke-color': '#0f172a',
    'circle-stroke-width': 2,
    'circle-opacity': 0.95,
} as const;

export const CLUSTER_COUNT_LAYOUT = {
    'text-field': ['get', 'point_count_abbreviated'] as any,
    'text-font': MAP_FONT_STACK_BOLD as unknown as any,
    'text-size': 14,
} as const;

export const CLUSTER_COUNT_PAINT = {
    'text-color': '#ffffff',
    'text-halo-color': '#0f172a',
    'text-halo-width': 1.5,
} as const;

// Building icon symbol layer styles
export const UNCLUSTERED_SYMBOL_LAYOUT = {
    'icon-image': 'building-icon',
    'icon-size': 1,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
} as const;

export const SELECTED_SYMBOL_LAYOUT = {
    'icon-image': 'building-selected-icon',
    'icon-size': 1.2,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
} as const;

// Keep fallback style stable across renders to avoid style reloads and symbol flicker
const FALLBACK_STYLE: StyleSpecification = {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/fonts/{fontstack}/{range}.pbf',
    sources: {
        osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
        },
    },
    layers: [
        { id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 },
    ],
};