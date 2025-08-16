'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Map, Source, Layer, Popup, type MapRef, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import type { StyleSpecification, FilterSpecification } from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import { Plus, Minus } from 'lucide-react';
import type { Location } from '@/types/index';
import {
    computeViewAndBounds,
    getDefaultMapStyle,
    locationsToFeatureCollection,
    CLUSTER_CIRCLE_PAINT,
    CLUSTER_COUNT_LAYOUT,
    CLUSTER_COUNT_PAINT,
    UNCLUSTERED_SYMBOL_LAYOUT,
    SELECTED_SYMBOL_LAYOUT,
} from '@/lib/map';
import { getLucideIconImage } from './floor-plan/device-overlays/icon-cache';

// Create building icon with circular backdrop
async function createBuildingIconWithBackdrop({
    size,
    iconColor,
    backdropColor,
    borderColor
}: {
    size: number;
    iconColor: string;
    backdropColor: string;
    borderColor: string;
}): Promise<HTMLImageElement> {
    const buildingIcon = await getLucideIconImage('Building2', {
        size: Math.round(size * 0.6),
        color: iconColor,
        strokeWidth: 2
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    canvas.width = size;
    canvas.height = size;

    const radius = size / 2;
    const center = radius;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.arc(center, center, radius - 2, 0, 2 * Math.PI);
    ctx.fillStyle = backdropColor;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    const iconSize = Math.round(size * 0.6);
    const iconOffset = (size - iconSize) / 2;
    ctx.drawImage(buildingIcon, iconOffset, iconOffset, iconSize, iconSize);

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
            if (!b) {
                reject(new Error('Failed to create blob from canvas'));
                return;
            }
            resolve(b);
        });
    });

    return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load composite image'));
        img.src = URL.createObjectURL(blob);
    });
}

type LocationsMapProps = {
    locations: Location[];
    selectedLocationId: string | null;
    onSelectLocation: (locationId: string) => void;
    spaces?: any[];
    devices?: any[];
};

const CLUSTER_SOURCE_ID = 'locations';
const CLUSTERS_LAYER_ID = 'clusters';
const CLUSTER_COUNT_LAYER_ID = 'cluster-count';
const UNCLUSTERED_LAYER_ID = 'unclustered-point';

// Icon sizes and tooltip positioning
const NORMAL_ICON_SIZE = 30;
const SELECTED_ICON_SIZE = 32;
const TOOLTIP_MARGIN = 8;

// Calculate tooltip offsets based on icon sizes
const NORMAL_TOOLTIP_OFFSET = -(NORMAL_ICON_SIZE / 2 + TOOLTIP_MARGIN);
const SELECTED_TOOLTIP_OFFSET = -(SELECTED_ICON_SIZE / 2 + TOOLTIP_MARGIN);

export default function LocationsMap(props: LocationsMapProps) {
    const { locations, selectedLocationId, onSelectLocation, spaces = [], devices = [] } = props;
    const mapRef = useRef<MapRef | null>(null);
    const [hovered, setHovered] = useState<{ id: string; coordinates: [number, number] } | null>(null);

    // Compute space and device counts for each location
    const locationCounts = useMemo(() => {
        const counts: Record<string, { spaceCount: number; deviceCount: number }> = {};

        locations.forEach(location => {
            const locationSpaces = spaces.filter(space => space.locationId === location.id);
            const locationDevices = devices.filter(device => device.locationId === location.id);

            counts[location.id] = {
                spaceCount: locationSpaces.length,
                deviceCount: locationDevices.length
            };
        });

        return counts;
    }, [locations, spaces, devices]);

    // Clear hover state when selection changes to avoid two tooltips
    useEffect(() => {
        if (selectedLocationId) setHovered(null);
    }, [selectedLocationId]);

    // GeoJSON conversion for points with coordinates
    const { featureCollection, selectedFeatureCoordinates, viewState, dataBounds } = useMemo(() => {
        const featureCollection = locationsToFeatureCollection(locations);
        const { viewState, bounds, selectedFeatureCoordinates } = computeViewAndBounds(
            featureCollection,
            selectedLocationId
        );
        return { featureCollection, selectedFeatureCoordinates, viewState, dataBounds: bounds };
    }, [locations, selectedLocationId]);

    const onMapClick = (e: MapLayerMouseEvent) => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const features = map.queryRenderedFeatures(e.point, {
            layers: [CLUSTERS_LAYER_ID, UNCLUSTERED_LAYER_ID],
        });

        const feature = features[0];
        if (!feature) return;

        // Cluster clicked: zoom in
        if (feature.layer && feature.layer.id === CLUSTERS_LAYER_ID && feature.properties) {
            const clusterId = feature.properties.cluster_id;
            const source = map.getSource(CLUSTER_SOURCE_ID) as any;
            if (source && typeof source.getClusterExpansionZoom === 'function') {
                source.getClusterExpansionZoom(clusterId, (err: unknown, zoom: number) => {
                    if (err) {
                        console.error('Error expanding cluster zoom:', err);
                        return;
                    }
                    const [lng, lat] = (feature.geometry as any).coordinates as [number, number];
                    map.easeTo({ center: [lng, lat], zoom });
                });
            }
            return;
        }

        // Unclustered point clicked: select location
        if (feature.layer && feature.layer.id === UNCLUSTERED_LAYER_ID && feature.properties) {
            const locId = feature.properties.id as string;
            setHovered(null);
            onSelectLocation(locId);
            return;
        }
    };

    // Ensure selected popup is not covered by left sheet: pan map if needed
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map || !selectedLocationId || !selectedFeatureCoordinates) return;

        const animate = () => {
            const sheetEl = document.getElementById('location-detail-sheet');
            if (!sheetEl) return;
            const mapRect = (map as any).getCanvasContainer().getBoundingClientRect();
            const sheetRect = sheetEl.getBoundingClientRect();
            const margin = 16;

            // Portion of the map covered by the sheet measured within the map's coordinate space
            const coveredXWithinMap = Math.max(0, sheetRect.right - mapRect.left + margin);

            const point = map.project({ lng: selectedFeatureCoordinates[0], lat: selectedFeatureCoordinates[1] } as any);
            // Include popup width so its left edge clears the sheet
            const popupEl = document.getElementById('selected-location-popup-content');
            const popupHalfWidth = popupEl ? popupEl.getBoundingClientRect().width / 2 : 140; // fallback ~280px width
            const desiredLeftEdge = coveredXWithinMap;
            const currentLeftEdge = point.x - popupHalfWidth;
            if (currentLeftEdge < desiredLeftEdge) {
                const deltaX = desiredLeftEdge - currentLeftEdge;
                const center = map.getCenter();
                const centerPx = map.project({ lng: center.lng, lat: center.lat } as any);
                const newCenterPx: { x: number; y: number } = { x: centerPx.x - deltaX, y: centerPx.y };
                const newCenter = map.unproject([newCenterPx.x, newCenterPx.y] as any) as any;
                map.easeTo({ center: [newCenter.lng, newCenter.lat] as any, duration: 300 });
            }
        };

        const raf = requestAnimationFrame(animate);
        const onResize = () => requestAnimationFrame(animate);
        window.addEventListener('resize', onResize);

        // Re-run after the sheet's transition finishes (slide-in), and once after a short delay
        const sheetEl = document.getElementById('location-detail-sheet');
        const onTransitionEnd = () => requestAnimationFrame(animate);
        sheetEl?.addEventListener('transitionend', onTransitionEnd);
        const timeoutId = window.setTimeout(() => requestAnimationFrame(animate), 350);
        const raf2 = requestAnimationFrame(animate); // once more after DOM paints
        return () => {
            cancelAnimationFrame(raf);
            cancelAnimationFrame(raf2);
            window.removeEventListener('resize', onResize);
            sheetEl?.removeEventListener('transitionend', onTransitionEnd);
            window.clearTimeout(timeoutId);
        };
    }, [selectedLocationId, selectedFeatureCoordinates]);

    const zoomBy = (delta: number) => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const current = map.getZoom();
        const next = Math.max(0, Math.min(22, current + delta));
        map.easeTo({ zoom: next });
    };

    return (
        <div className="w-full h-full rounded-lg overflow-hidden relative">
            {/* Zoom controls */}
            <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex flex-col gap-2">
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 pointer-events-auto shadow"
                    aria-label="Zoom in"
                    onClick={() => zoomBy(1)}
                >
                    <Plus className="h-4 w-4" />
                </Button>
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 pointer-events-auto shadow"
                    aria-label="Zoom out"
                    onClick={() => zoomBy(-1)}
                >
                    <Minus className="h-4 w-4" />
                </Button>
            </div>
            <Map
                ref={mapRef}
                mapStyle={useMemo<StyleSpecification>(() => getDefaultMapStyle(), [])}
                initialViewState={viewState}
                dragRotate={false}
                touchZoomRotate={true}
                style={{ width: '100%', height: '100%' }}
                onLoad={async () => {
                    const map = mapRef.current?.getMap();
                    if (!map) return;

                    // Load building icons with backdrop
                    try {
                        // Create building icons with blue circles and white icons
                        const buildingIcon = await createBuildingIconWithBackdrop({
                            size: NORMAL_ICON_SIZE,
                            iconColor: '#ffffff',
                            backdropColor: '#3b82f6',
                            borderColor: '#2563eb'
                        });
                        const buildingSelectedIcon = await createBuildingIconWithBackdrop({
                            size: SELECTED_ICON_SIZE,
                            iconColor: '#ffffff',
                            backdropColor: '#1d4ed8',
                            borderColor: '#1e40af'
                        });

                        // Add icons to map
                        map.addImage('building-icon', buildingIcon);
                        map.addImage('building-selected-icon', buildingSelectedIcon);
                    } catch (error) {
                        console.error('Failed to load building icons:', error);
                    }

                    if (dataBounds) {
                        const [[minLng, minLat], [maxLng, maxLat]] = dataBounds;
                        if (minLng === maxLng && minLat === maxLat) {
                            map.easeTo({ center: [minLng, minLat], zoom: 12, duration: 0 });
                        } else {
                            map.fitBounds(
                                [
                                    [minLng, minLat],
                                    [maxLng, maxLat],
                                ] as any,
                                { padding: 60, duration: 0 }
                            );
                        }
                    }

                    // Add pointer cursor and hover tooltips for interactive layers
                    map.on('mouseenter', CLUSTERS_LAYER_ID, () => {
                        map.getCanvas().style.cursor = 'pointer';
                    });
                    map.on('mouseleave', CLUSTERS_LAYER_ID, () => {
                        map.getCanvas().style.cursor = '';
                    });

                    map.on('mouseenter', UNCLUSTERED_LAYER_ID, (e) => {
                        map.getCanvas().style.cursor = 'pointer';
                        if (e.features && e.features[0] && e.features[0].properties) {
                            const feature = e.features[0];
                            const locationId = feature.properties.id as string;
                            const coordinates = (feature.geometry as any).coordinates as [number, number];
                            const location = locations.find(l => l.id === locationId);
                            if (location) setHovered({ id: locationId, coordinates });
                        }
                    });

                    map.on('mouseleave', UNCLUSTERED_LAYER_ID, () => {
                        map.getCanvas().style.cursor = '';
                        setHovered(null);
                    });
                }}
                onClick={onMapClick}
            >
                <Source
                    id={CLUSTER_SOURCE_ID}
                    type="geojson"
                    data={featureCollection}
                    cluster={true}
                    clusterMaxZoom={14}
                    clusterRadius={48}
                >
                    <Layer
                        id={CLUSTERS_LAYER_ID}
                        type="circle"
                        filter={["has", "point_count"] as FilterSpecification}
                        paint={CLUSTER_CIRCLE_PAINT as any}
                    />

                    <Layer
                        id={CLUSTER_COUNT_LAYER_ID}
                        type="symbol"
                        filter={["has", "point_count"] as FilterSpecification}
                        layout={CLUSTER_COUNT_LAYOUT as any}
                        paint={CLUSTER_COUNT_PAINT as any}
                    />

                    <Layer
                        id={UNCLUSTERED_LAYER_ID}
                        type="symbol"
                        filter={["!has", "point_count"] as FilterSpecification}
                        layout={UNCLUSTERED_SYMBOL_LAYOUT as any}
                    />

                    {/* Show only one tooltip at a time: selected takes precedence over hover */}
                    {selectedLocationId && selectedFeatureCoordinates && (
                        <Layer
                            id="selected-location-highlight"
                            type="symbol"
                            filter={["all", ["!has", "point_count"], ["==", "id", selectedLocationId]] as FilterSpecification}
                            layout={SELECTED_SYMBOL_LAYOUT as any}
                        />
                    )}
                </Source>

                {/* Hover tooltip (only when nothing is selected) */}
                {!selectedLocationId && hovered && (
                    <Popup
                        longitude={hovered.coordinates[0]}
                        latitude={hovered.coordinates[1]}
                        anchor="bottom"
                        closeButton={false}
                        closeOnClick={false}
                        offset={[0, NORMAL_TOOLTIP_OFFSET]}
                        className="map-popup"
                    >
                        <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-md px-3 py-2 text-sm max-w-xs">
                            {(() => {
                                const loc = locations.find((l) => l.id === hovered.id);
                                if (!loc) return null;
                                const counts = locationCounts[hovered.id] || { spaceCount: 0, deviceCount: 0 };
                                return (
                                    <div className="space-y-1">
                                        <div className="font-medium leading-none">{loc.name}</div>
                                        {(loc.addressCity || loc.addressState) && (
                                            <div className="text-xs text-muted-foreground leading-none">
                                                {[loc.addressCity, loc.addressState].filter(Boolean).join(', ')}
                                            </div>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                            <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                                                {counts.spaceCount} space{counts.spaceCount !== 1 ? 's' : ''}
                                            </span>
                                            <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                                                {counts.deviceCount} device{counts.deviceCount !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </Popup>
                )}

                {/* Selected tooltip */}
                {selectedLocationId && selectedFeatureCoordinates && (
                    <Popup
                        longitude={selectedFeatureCoordinates[0]}
                        latitude={selectedFeatureCoordinates[1]}
                        anchor="bottom"
                        closeButton={false}
                        closeOnClick={false}
                        offset={[0, SELECTED_TOOLTIP_OFFSET]}
                        className="map-popup"
                    >
                        <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-md px-3 py-2 text-sm max-w-xs">
                            {(() => {
                                const loc = locations.find((l) => l.id === selectedLocationId);
                                if (!loc) return null;
                                const counts = locationCounts[selectedLocationId] || { spaceCount: 0, deviceCount: 0 };
                                return (
                                    <div className="space-y-1">
                                        <div className="font-medium leading-none">{loc.name}</div>
                                        {(loc.addressCity || loc.addressState) && (
                                            <div className="text-xs text-muted-foreground leading-none">
                                                {[loc.addressCity, loc.addressState].filter(Boolean).join(', ')}
                                            </div>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                            <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                                                {counts.spaceCount} space{counts.spaceCount !== 1 ? 's' : ''}
                                            </span>
                                            <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                                                {counts.deviceCount} device{counts.deviceCount !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </Popup>
                )}
            </Map>
        </div>
    );
}