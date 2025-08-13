'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RGL, { WidthProvider, type Layout } from 'react-grid-layout';
import type { DeviceWithConnector } from '@/types';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';

const GridLayout = WidthProvider(RGL);

export interface PlayGridProps {
	devices: DeviceWithConnector[];
}

export const PlayGrid: React.FC<PlayGridProps> = ({ devices }) => {
	const playableDevices = useMemo(() => devices.filter(d => d.deviceId && d.connectorId), [devices]);

	const [layout, setLayout] = useState<Layout[]>([]);
	const [initialized, setInitialized] = useState(false);

	// Single, fluid 12-column grid (no hardcoded breakpoint map)
	const COLS = 12;
	const ROW_HEIGHT = 100;
	const MARGIN: [number, number] = [10, 10];

	useEffect(() => {
		if (initialized) return;
		const tileSpan = 4; // default span per item; fluid without breakpoint maps
		const perRow = Math.max(1, Math.floor(COLS / tileSpan));
		const initial: Layout[] = playableDevices.map((device, index) => {
			const row = Math.floor(index / perRow);
			const col = (index % perRow) * tileSpan;
			return { i: device.id, x: col, y: row, w: tileSpan, h: 3, static: false };
		});
		setLayout(initial);
		setInitialized(true);
	}, [initialized, playableDevices]);

	if (playableDevices.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted-foreground">
				<p>No playable items found.</p>
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
			layout={layout}
			onLayoutChange={(l) => setLayout(l)}
		>
			{playableDevices.map(device => (
				<div key={device.id} className="overflow-hidden grid-item-container">
					<Card className="h-full w-full flex flex-col">
						<CardHeader className="p-1.5 shrink-0 border-b bg-muted/30 rounded-t-lg">
							<CardTitle className="text-xs font-medium truncate text-center" title={device.name}>
								{device.name}
							</CardTitle>
						</CardHeader>
						<CardContent className="p-0 grow relative overflow-hidden rounded-b-lg">
							<div className="absolute inset-0 p-2">
								<PikoVideoPlayer
									connectorId={device.connectorId}
									cameraId={device.deviceId}
									className="w-full h-full"
								/>
							</div>
						</CardContent>
					</Card>
				</div>
			))}
		</GridLayout>
	);
};


