'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import { DeviceType } from '@/lib/mappings/definitions';
import type { DeviceWithConnector } from '@/types';
import { PageHeader } from '@/components/layout/page-header';
import { MonitorPlay } from 'lucide-react';
import { LocationSpaceSelector } from '@/components/common/LocationSpaceSelector';
import { PlayGrid } from '@/components/features/play/play-grid';
import type { Layout } from 'react-grid-layout';
import { PlayLayoutControls } from '@/components/features/play/PlayLayoutControls';
import type { PlayLayout, PlayGridLayoutItem } from '@/types/play';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatConnectorCategory } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EditCamerasDialog } from '@/components/features/play/EditCamerasDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

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
  

	const [layouts, setLayouts] = useState<PlayLayout[]>([]);
	const [activeLayoutId, setActiveLayoutId] = useState<string | 'auto'>('auto');
	const [latestGridLayout, setLatestGridLayout] = useState<Layout[] | null>(null);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [editSelectedIds, setEditSelectedIds] = useState<Set<string>>(new Set());
	const [editSearch, setEditSearch] = useState('');
  const [connectorFilter, setConnectorFilter] = useState<string>('all');

	useEffect(() => { document.title = 'Play // Fusion'; }, []);
	useEffect(() => {
		if (!allDevicesHasInitiallyLoaded && !isLoadingAllDevices) {
			fetchAllDevices();
		}
	}, [allDevicesHasInitiallyLoaded, isLoadingAllDevices, fetchAllDevices]);

	// Load layouts on mount
	useEffect(() => {
		(async () => {
			try {
				const res = await fetch('/api/play/layouts');
				const json = await res.json();
				if (!res.ok || !json.success) {
					toast.error('Failed to load layouts', { description: json?.error || 'Please try again.' });
					return;
				}
				setLayouts(json.data);
			} catch (e) {
				console.error('fetch layouts', e);
				toast.error('Failed to load layouts');
			}
		})();
	}, []);

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

	// Determine active layout
	const activeLayout = activeLayoutId === 'auto' ? null : layouts.find(l => l.id === activeLayoutId) || null;

  const viewDevices = useMemo<DeviceWithConnector[]>(() => {
    if (!activeLayout) return cameraDevices;
    const activeAllowed = new Set(activeLayout.deviceIds);
    const fromGrid = latestGridLayout ? new Set(latestGridLayout.map(it => it.i)) : null;
    const allowedIds = fromGrid
      ? new Set(Array.from(activeAllowed).filter(id => fromGrid.has(id)))
      : activeAllowed;
    return cameraDevices.filter(d => allowedIds.has(d.id));
  }, [cameraDevices, activeLayout, latestGridLayout]);


	// Dirty detection: compare latest grid to the active layout items
  const isDirty = useMemo(() => {
    if (!activeLayout || !latestGridLayout) return false;
    const activeAllowed = new Set(activeLayout.deviceIds);
    const filtered = latestGridLayout.filter(it => activeAllowed.has(it.i));
    if (activeLayout.items.length !== filtered.length) return true;
    const byId = new Map(activeLayout.items.map(it => [it.i, it]));
    for (const cur of filtered) {
      const prev = byId.get(cur.i);
      if (!prev) return true;
      if (prev.x !== cur.x || prev.y !== cur.y || prev.w !== cur.w || prev.h !== cur.h) return true;
    }
    return false;
  }, [activeLayout, latestGridLayout]);

	const handleCreate = async (name: string) => {
		try {
			const res = await fetch('/api/play/layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, deviceIds: [], items: [] }) });
			const json = await res.json();
			if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
			setLayouts(prev => [...prev, json.data]);
			setActiveLayoutId(json.data.id);
      toast.success('Layout created');
		} catch (e) { console.error('create layout', e); }
	};
	const handleRename = async (id: string, name: string) => {
		try {
			const res = await fetch(`/api/play/layouts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
			const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
			setLayouts(prev => prev.map(l => l.id === id ? { ...l, name } : l));
      toast.success('Layout renamed');
		} catch (e) { console.error('rename layout', e); }
	};
	const handleDelete = async (id: string) => {
		try {
			await fetch(`/api/play/layouts/${id}`, { method: 'DELETE' });
			setLayouts(prev => prev.filter(l => l.id !== id));
			if (activeLayoutId === id) setActiveLayoutId('auto');
      toast.success('Layout deleted');
		} catch (e) { console.error('delete layout', e); }
	};
  const handleSave = async () => {
    if (!activeLayoutId || activeLayoutId === 'auto' || !latestGridLayout || !activeLayout) return;
    try {
      const allowed = new Set(activeLayout.deviceIds);
      const itemsToSave = latestGridLayout.filter(it => allowed.has(it.i));
      const deviceIds = itemsToSave.map(it => it.i);
      const itemsToPersist: PlayGridLayoutItem[] = itemsToSave.map(it => ({ i: it.i, x: it.x, y: it.y, w: it.w, h: it.h, static: it.static }));
      const res = await fetch(`/api/play/layouts/${activeLayoutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToPersist, deviceIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to save layout');
      }
      setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, items: itemsToPersist, deviceIds } : l));
      toast.success('Layout saved');
    } catch (e) { console.error('save layout items', e); }
  };

  const handleRemoveFromLayout = (deviceId: string) => {
    if (!activeLayoutId || activeLayoutId === 'auto') return;
    const base: Layout[] = latestGridLayout ?? (activeLayout?.items as unknown as Layout[]) ?? [];
    setLatestGridLayout(base.filter(it => it.i !== deviceId));
  };
	const handleReset = () => setActiveLayoutId('auto');

	// Edit Cameras dialog data and handlers
	const availableCameras = useMemo(() => cameraDevices, [cameraDevices]);
	const uniqueConnectors = useMemo(() => {
		const map = new Map<string, { name: string; category: string }>();
		for (const cam of availableCameras) {
			const name = cam.connectorName ?? formatConnectorCategory(cam.connectorCategory);
			if (!map.has(name)) map.set(name, { name, category: cam.connectorCategory });
		}
		return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
	}, [availableCameras]);

	const filteredCameras = useMemo(() => {
		const term = editSearch.trim().toLowerCase();
		return availableCameras.filter(cam => {
			const nameOk = !term || (cam.name || '').toLowerCase().includes(term);
			const connName = cam.connectorName ?? formatConnectorCategory(cam.connectorCategory);
			const connOk = connectorFilter === 'all' || connName === connectorFilter;
			return nameOk && connOk;
		});
	}, [availableCameras, editSearch, connectorFilter]);

	const [visibleAssignedCameras, visibleAvailableCameras] = useMemo(() => {
		const assigned: DeviceWithConnector[] = [];
		const available: DeviceWithConnector[] = [];
		for (const cam of filteredCameras) {
			if (editSelectedIds.has(cam.id)) assigned.push(cam); else available.push(cam);
		}
		return [assigned, available];
	}, [filteredCameras, editSelectedIds]);

	const applyEditCameras = async (selectedIdsParam: string[]) => {
		if (!activeLayoutId || activeLayoutId === 'auto') return;
		const layout = layouts.find(l => l.id === activeLayoutId);
		if (!layout) return;
		const nextIds = selectedIdsParam;
		const keptItems = layout.items.filter(it => nextIds.includes(it.i));
		const existingIds = new Set(keptItems.map(it => it.i));
		const newMembers = nextIds.filter(id => !existingIds.has(id));
		const tileSpan = 4;
		const perRow = Math.max(1, Math.floor(12 / tileSpan));
		const startIndex = keptItems.length;
    const newItems: PlayGridLayoutItem[] = newMembers.map((id, idx) => {
			const row = Math.floor((startIndex + idx) / perRow);
			const col = ((startIndex + idx) % perRow) * tileSpan;
      return { i: id, x: col, y: row, w: tileSpan, h: 3, static: false };
		});
		const updated = { deviceIds: nextIds, items: [...keptItems, ...newItems] };
		setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, ...updated } : l));
		setIsEditDialogOpen(false);
		try {
			await fetch(`/api/play/layouts/${activeLayoutId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
		} catch (e) { console.error('edit cameras apply', e); }
	};


	const actions = (
		<div className="flex items-center gap-2 w-full flex-wrap">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
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
            
				</div>
			</div>
			<div className="ml-auto flex items-center gap-2">
				<div className="h-8 w-px bg-border" aria-hidden="true" />
				<PlayLayoutControls
				layouts={layouts.map(l => ({ id: l.id, name: l.name }))}
				activeLayoutId={activeLayoutId}
				onSelect={setActiveLayoutId}
				onCreate={handleCreate}
				onRename={handleRename}
				onDelete={handleDelete}
				onSave={handleSave}
				isDirty={isDirty}
				onEditCameras={() => {
					if (!activeLayout) return;
					setEditSelectedIds(new Set(activeLayout.deviceIds));
					setEditSearch('');
					setIsEditDialogOpen(true);
				}}
				/>
			</div>
			<EditCamerasDialog
				isOpen={isEditDialogOpen}
				onOpenChange={setIsEditDialogOpen}
				cameras={availableCameras}
				initialSelectedIds={Array.from(editSelectedIds)}
				onApply={(ids) => { applyEditCameras(ids); }}
			/>
		</div>
	);

	return (
		<div className="flex flex-col h-full p-4 md:p-6">
			<PageHeader
				title="Play"
				icon={<MonitorPlay className="h-6 w-6" />}
				actions={actions}
			/>
			<div>
        {(isLoadingAllDevices || !allDevicesHasInitiallyLoaded) ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">Loading…</div>
        ) : (
          <PlayGrid
            devices={viewDevices}
            onLayoutChange={setLatestGridLayout}
            initialLayoutItems={activeLayout?.items}
            onRemoveFromLayout={activeLayoutId === 'auto' ? undefined : handleRemoveFromLayout}
            onAddCameras={() => setIsEditDialogOpen(true)}
            spaces={spaces}
            locations={locations}
            key={`grid-${activeLayout?.id || 'auto'}`}
          />
        )}
			</div>
		</div>
	);
}


