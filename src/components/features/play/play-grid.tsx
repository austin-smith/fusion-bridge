'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RGL, { WidthProvider, type Layout } from 'react-grid-layout';
import type { DeviceWithConnector, Space, Location } from '@/types';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Plus, Box, Building, Cctv, Trash2 } from 'lucide-react';

const GridLayout = WidthProvider(RGL);

export interface PlayGridProps {
	devices: DeviceWithConnector[];
	onLayoutChange?: (l: Layout[]) => void;
	initialLayoutItems?: Layout[];
  onRemoveFromLayout?: (deviceId: string) => void;
  onAddCameras?: () => void;
  spaces: Space[];
  locations: Location[];
  overlayHeaders?: boolean;
  showInfo?: boolean;
}

export const PlayGrid: React.FC<PlayGridProps> = ({ devices, onLayoutChange, initialLayoutItems, onRemoveFromLayout, onAddCameras, spaces, locations, overlayHeaders = true, showInfo = false }) => {
	const playableDevices = useMemo(() => devices.filter(d => d.deviceId && d.connectorId), [devices]);

    const [layout, setLayout] = useState<Layout[]>([]);
    const [fpsById, setFpsById] = useState<Record<string, number>>({});
    const [resolutionById, setResolutionById] = useState<Record<string, { w: number; h: number }>>({});
    const lastFpsUpdateAtRef = React.useRef<Record<string, number>>({});
    const smoothAndThrottleFps = React.useCallback((deviceId: string, nextFps: number) => {
        const now = performance.now();
        const lastAt = lastFpsUpdateAtRef.current[deviceId] ?? 0;
        // Throttle UI updates to ~4/sec
        if (now - lastAt < 250) return;
        setFpsById(prev => {
            const prevFps = prev[deviceId];
            // Exponential smoothing
            const alpha = 0.2;
            const base = typeof prevFps === 'number' ? prevFps : nextFps;
            const smoothedFloat = base + alpha * (nextFps - base);
            // Round to one decimal place for visible, gentle movement
            const smoothed = Math.round(smoothedFloat * 10) / 10;
            if (typeof prevFps === 'number' && Math.abs(smoothed - prevFps) < 0.05) return prev;
            lastFpsUpdateAtRef.current[deviceId] = now;
            return { ...prev, [deviceId]: smoothed };
        });
    }, []);

	// Single, fluid 12-column grid
	const COLS = 12;
	const ROW_HEIGHT = 100;
	const MARGIN: [number, number] = [10, 10];

	// Lookup maps to resolve names like image-preview-dialog header style
	const spaceById = useMemo(() => {
		const m = new Map<string, Space>();
		for (const s of spaces) m.set(s.id, s);
		return m;
	}, [spaces]);

	const locationById = useMemo(() => {
		const m = new Map<string, Location>();
		for (const l of locations) m.set(l.id, l);
		return m;
	}, [locations]);

	useEffect(() => {
		const tileSpan = 4;
		const perRow = Math.max(1, Math.floor(COLS / tileSpan));

		// Map of saved positions from initialLayoutItems (when provided)
		const savedById: Record<string, Layout> = {};
		if (initialLayoutItems && initialLayoutItems.length > 0) {
			for (const item of initialLayoutItems) {
				if (!item || typeof item.i !== 'string') continue;
				savedById[item.i] = {
					i: item.i,
					x: typeof item.x === 'number' ? item.x : 0,
					y: typeof item.y === 'number' ? item.y : 0,
					w: typeof item.w === 'number' ? item.w : tileSpan,
					h: typeof item.h === 'number' ? item.h : 3,
					static: !!item.static,
				};
			}
		}

		// Keep only layout items for devices that are currently playable
		const playableIds = new Set(playableDevices.map(d => d.id));
		const nextLayout = layout.filter(it => playableIds.has(it.i));
		const presentIds = new Set(nextLayout.map(it => it.i));

		// Append missing devices to the end with reasonable defaults (or saved positions)
		const startIndex = nextLayout.length;
		const newDevices = playableDevices.filter(d => !presentIds.has(d.id));
		const additions: Layout[] = newDevices.map((device, idx) => {
			const base: Layout = {
				i: device.id,
				x: ((startIndex + idx) % perRow) * tileSpan,
				y: Math.floor((startIndex + idx) / perRow),
				w: tileSpan,
				h: 3,
				static: false,
			};
			return savedById[device.id] ? { ...base, ...savedById[device.id] } : base;
		});

		if (additions.length > 0 || nextLayout.length !== layout.length) {
			setLayout([...nextLayout, ...additions]);
		}
	}, [playableDevices, initialLayoutItems, layout]);

	if (playableDevices.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-3">
				<p className="text-sm text-muted-foreground">No cameras in this layout.</p>
				<Button size="sm" onClick={onAddCameras}>
					<Plus className="h-4 w-4" />
					Add Cameras
				</Button>
			</div>
		);
	}

	return (
		<GridLayout
			className="play-grid"
			cols={COLS}
			rowHeight={ROW_HEIGHT}
			margin={MARGIN}
			containerPadding={[0, 0]}
			isDraggable
			isResizable
			draggableCancel={'button, a, input, textarea, select, [role="menuitem"]'}
			layout={layout}
            onLayoutChange={(l) => { setLayout(l); onLayoutChange?.(l); }}
		>
			{playableDevices.map(device => {
				const resolvedSpaceName = device.spaceName || (device.spaceId ? spaceById.get(device.spaceId)?.name : undefined);
				const resolvedLocationName = (() => {
					if (device.locationId) return locationById.get(device.locationId)?.name;
					if (device.spaceId) {
						const s = spaceById.get(device.spaceId);
						return s ? locationById.get(s.locationId)?.name : undefined;
					}
					return undefined;
				})();
				return (
				<div key={device.id} className="overflow-hidden grid-item-container">
					{overlayHeaders ? (<Card className="h-full w-full flex flex-col overflow-hidden rounded-lg">
						<CardContent className="p-0 grow relative">
							<div className="absolute inset-0">
                                <PikoVideoPlayer
										connectorId={device.connectorId}
										cameraId={device.deviceId}
										className="w-full h-full"
                                    enableStats={showInfo}
                                    onStats={showInfo ? ({ fps, width, height }) => {
                                        smoothAndThrottleFps(device.id, fps);
                                        if (width && height) {
                                            setResolutionById(prev => {
                                                const cur = prev[device.id];
                                                if (cur && cur.w === width && cur.h === height) return prev;
                                                return { ...prev, [device.id]: { w: width, h: height } };
                                            });
                                        }
                                    } : undefined}
									/>
							</div>

							{/* Top overlay with gradient and actions */}
							<div className="absolute inset-x-0 top-0">
								{/* Single feathered gradient to avoid a hard edge while staying subtle */}
								<div
									className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.38)_38%,rgba(0,0,0,0.14)_78%,rgba(0,0,0,0)_100%)] backdrop-blur-[2px] z-0"
									aria-hidden="true"
								/>
								<div className="relative z-20 px-2 py-1 flex items-center justify-between gap-2 text-white">
									<div className="min-w-0 flex items-center gap-1.5 text-xs">
										<Cctv className="h-3.5 w-3.5 text-white/80" />
										<span className="truncate">{device.name}</span>
										{resolvedSpaceName ? (
											<>
												<span className="text-white/60">•</span>
												<span className="inline-flex items-center gap-1 truncate text-white/80">
													<Box className="h-3.5 w-3.5" />
													<span className="truncate">{resolvedSpaceName}</span>
												</span>
											</>
										) : null}
										{resolvedLocationName ? (
											<>
												<span className="text-white/60">•</span>
												<span className="inline-flex items-center gap-1 truncate text-white/80">
													<Building className="h-3.5 w-3.5" />
													<span className="truncate">{resolvedLocationName}</span>
												</span>
											</>
										) : null}
									</div>

									{onRemoveFromLayout ? (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="sm"
													className="h-7 w-7 p-0 no-drag text-white/90 hover:text-white hover:bg-white/10"
													aria-label="Tile options"
												>
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="no-drag">
													<DropdownMenuItem
														className="text-destructive focus:text-destructive"
														onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveFromLayout(device.id); }}
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Remove
													</DropdownMenuItem>
												</DropdownMenuContent>
										</DropdownMenu>
									) : null}
								</div>
						</div>
                            {showInfo ? (
                                <div className="absolute bottom-1 right-1 z-20">
                                    <span className="block px-1.5 py-1 rounded text-[10px] leading-tight bg-black/55 text-white select-none font-mono text-right">
                                        {(() => {
                                            const res = resolutionById[device.id];
                                            return res && res.w && res.h ? `${res.w}×${res.h}` : '—×—';
                                        })()}
                                        <br />
                                        {typeof fpsById[device.id] === 'number' ? `${fpsById[device.id].toFixed(1)} fps` : '— fps'}
                                    </span>
                                </div>
                            ) : null}
						</CardContent>
					</Card>) : (
						<Card className="h-full w-full flex flex-col">
							<CardHeader className="px-2 py-1.5 shrink-0 bg-black text-white rounded-t-lg">
								<div className="flex items-center justify-between gap-2">
									<div className="min-w-0">
										<CardTitle className="text-xs font-medium leading-tight truncate flex items-center gap-1.5" title={device.name}>
											<Cctv className="h-3.5 w-3.5 text-muted-foreground" />
											<span className="truncate">{device.name}</span>
											{resolvedSpaceName ? (
												<>
													<span className="text-muted-foreground">•</span>
													<span className="inline-flex items-center gap-1 truncate text-muted-foreground">
														<Box className="h-3.5 w-3.5" />
														<span className="truncate">{resolvedSpaceName}</span>
													</span>
												</>
											) : null}
											{resolvedLocationName ? (
												<>
													<span className="text-muted-foreground">•</span>
													<span className="inline-flex items-center gap-1 truncate text-muted-foreground">
														<Building className="h-3.5 w-3.5" />
														<span className="truncate">{resolvedLocationName}</span>
													</span>
												</>
											) : null}
										</CardTitle>
									</div>
									{onRemoveFromLayout ? (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" size="sm" className="h-7 w-7 p-0 no-drag" aria-label="Tile options">
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="no-drag">
													<DropdownMenuItem
														className="text-destructive focus:text-destructive"
														onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveFromLayout(device.id); }}
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Remove
													</DropdownMenuItem>
												</DropdownMenuContent>
										</DropdownMenu>
									) : null}
								</div>
							</CardHeader>
							<CardContent className="p-0 grow relative overflow-hidden rounded-b-lg">
                                <div className="absolute inset-0">
                                <PikoVideoPlayer
                                            connectorId={device.connectorId}
                                            cameraId={device.deviceId}
                                            className="w-full h-full"
                                            enableStats={showInfo}
                                            onStats={showInfo ? ({ fps, width, height }) => {
                                                smoothAndThrottleFps(device.id, fps);
                                                if (width && height) {
                                                    setResolutionById(prev => {
                                                        const cur = prev[device.id];
                                                        if (cur && cur.w === width && cur.h === height) return prev;
                                                        return { ...prev, [device.id]: { w: width, h: height } };
                                                    });
                                                }
                                            } : undefined}
                                        />
                                </div>
                                {showInfo ? (
                                    <div className="absolute bottom-1 right-1 z-20">
                                        <span className="block px-1.5 py-1 rounded text-[10px] leading-tight bg-black/55 text-white select-none font-mono text-right">
                                            {(() => {
                                                const res = resolutionById[device.id];
                                                return res && res.w && res.h ? `${res.w}×${res.h}` : '—×—';
                                            })()}
                                            <br />
                                            {typeof fpsById[device.id] === 'number' ? `${fpsById[device.id].toFixed(1)} fps` : '— fps'}
                                        </span>
                                    </div>
                                ) : null}
							</CardContent>
						</Card>
					)}
				</div>
				);
			})}
		</GridLayout>
	);
};


