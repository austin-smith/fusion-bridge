'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import { DeviceType } from '@/lib/mappings/definitions';
import type { DeviceWithConnector } from '@/types';
import { PageHeader } from '@/components/layout/page-header';
import { MonitorPlay, LayoutGrid, Box, Building } from 'lucide-react';
import { LocationSpaceSelector } from '@/components/common/LocationSpaceSelector';
import { PlayGrid } from '@/components/features/play/play-grid';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function PlayPage() {
	const allDevices = useFusionStore(state => state.allDevices);
	const isLoadingAllDevices = useFusionStore(state => state.isLoadingAllDevices);
	const allDevicesHasInitiallyLoaded = useFusionStore(state => state.allDevicesHasInitiallyLoaded);
	const fetchAllDevices = useFusionStore(state => state.fetchAllDevices);
	const locations = useFusionStore(state => state.locations);
	const spaces = useFusionStore(state => state.spaces);

	const [locationFilter, setLocationFilter] = useState<string>('all');
	const [spaceFilter, setSpaceFilter] = useState<string>('all');
	const [searchTerm, setSearchTerm] = useState('');
	const [groupBySpace, setGroupBySpace] = useState(false);

	useEffect(() => { document.title = 'Play // Fusion'; }, []);
	useEffect(() => {
		if (!allDevicesHasInitiallyLoaded && !isLoadingAllDevices) {
			fetchAllDevices();
		}
	}, [allDevicesHasInitiallyLoaded, isLoadingAllDevices, fetchAllDevices]);

	const cameraDevices = useMemo<DeviceWithConnector[]>(() => {
		let list = allDevices.filter(d =>
			d.connectorCategory === 'piko' &&
			d.deviceTypeInfo?.type === DeviceType.Camera &&
			d.deviceId && d.connectorId
		);

		if (spaceFilter !== 'all') {
			list = list.filter(d => d.spaceId === spaceFilter);
		} else if (locationFilter !== 'all') {
			const ids = spaces.filter(s => s.locationId === locationFilter).map(s => s.id);
			list = list.filter(d => d.spaceId && ids.includes(d.spaceId));
		}

		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase();
			list = list.filter(d => d.name?.toLowerCase().includes(term));
		}

		return list;
	}, [allDevices, locationFilter, spaceFilter, spaces, searchTerm]);

	const groupedBySpace = useMemo(() => {
		if (!groupBySpace) return null;
		const bySpace = new Map<string, DeviceWithConnector[]>();
		for (const d of cameraDevices) {
			const key = d.spaceId || 'unassigned';
			if (!bySpace.has(key)) bySpace.set(key, []);
			bySpace.get(key)!.push(d);
		}
		const entries = Array.from(bySpace.entries());
		entries.sort((a, b) => {
			const aName = a[0] === 'unassigned' ? 'Unassigned' : (spaces.find(s => s.id === a[0])?.name || 'Unknown');
			const bName = b[0] === 'unassigned' ? 'Unassigned' : (spaces.find(s => s.id === b[0])?.name || 'Unknown');
			return aName.localeCompare(bName);
		});
		return entries.map(([spaceId, devices]) => {
			const space = spaces.find(s => s.id === spaceId);
			const locationName = space ? (locations.find(l => l.id === space.locationId)?.name || undefined) : undefined;
			return {
				key: spaceId,
				title: space ? space.name : 'Unassigned',
				subtitle: locationName,
				devices,
			};
		});
	}, [groupBySpace, cameraDevices, spaces, locations]);

	const actions = (
		<div className="flex items-center gap-2 w-full flex-wrap">
			<LocationSpaceSelector
				locationFilter={locationFilter}
				spaceFilter={spaceFilter}
				searchTerm={searchTerm}
				locations={locations}
				spaces={spaces}
				onLocationChange={setLocationFilter}
				onSpaceChange={setSpaceFilter}
				onSearchChange={setSearchTerm}
			/>
			<div className="w-[220px]">
				<Input
					placeholder="Search cameras..."
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="h-9"
				/>
			</div>
			<TooltipProvider>
				<div className="flex items-center gap-1 border rounded-md p-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={!groupBySpace ? 'secondary' : 'ghost'}
								size="sm"
								className="h-8"
								onClick={() => setGroupBySpace(false)}
								aria-label="Flat"
							>
								<LayoutGrid className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Flat</p>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={groupBySpace ? 'secondary' : 'ghost'}
								size="sm"
								className="h-8"
								onClick={() => setGroupBySpace(true)}
								aria-label="Group by Space"
							>
								<Box className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Group by Space</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</TooltipProvider>
		</div>
	);

	return (
		<div className="flex flex-col h-full p-4 md:p-6">
			<PageHeader
				title="Play"
				icon={<MonitorPlay className="h-6 w-6" />}
				actions={actions}
			/>
			<div className="mt-4">
				{(isLoadingAllDevices || !allDevicesHasInitiallyLoaded) ? (
					<div className="h-64 flex items-center justify-center text-muted-foreground">Loading…</div>
				) : (
					groupBySpace && groupedBySpace ? (
						<div className="space-y-6">
							{groupedBySpace.map(group => (
                    <section key={group.key} className="space-y-3">
                      <div className="flex items-center justify-between bg-muted/50 border rounded-md px-3 py-2 shadow-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Box className="h-4 w-4 text-muted-foreground shrink-0" />
                          <h3 className="text-sm font-semibold truncate max-w-[40vw]">{group.title}</h3>
                          {group.subtitle ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[28vw]">
                              <span className="text-muted-foreground">•</span>
                              <Building className="h-3.5 w-3.5" />
                              <span className="truncate">{group.subtitle}</span>
                            </span>
                          ) : null}
                        </div>
                        <Badge variant="secondary" className="h-6 px-2 py-0 text-xs">
                          {group.devices.length}
                        </Badge>
                      </div>
                      <PlayGrid devices={group.devices} />
                    </section>
							))}
						</div>
					) : (
						<PlayGrid devices={cameraDevices} />
					)
				)}
			</div>
		</div>
	);
}


