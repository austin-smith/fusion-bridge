'use client';

import React from 'react';
import type { DeviceWithConnector } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';
import { formatConnectorCategory } from '@/lib/utils';

export interface EditCamerasDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  cameras: DeviceWithConnector[];
  initialSelectedIds: string[];
  onApply: (selectedIds: string[]) => void;
}

export const EditCamerasDialog: React.FC<EditCamerasDialogProps> = ({
  isOpen,
  onOpenChange,
  cameras,
  initialSelectedIds,
  onApply,
}) => {
  const [search, setSearch] = React.useState('');
  const [connectorFilter, setConnectorFilter] = React.useState<string>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(initialSelectedIds));
      setSearch('');
      setConnectorFilter('all');
    }
  }, [isOpen, initialSelectedIds]);

  const uniqueConnectors = React.useMemo(() => {
    const map = new Map<string, { name: string; category: string }>();
    for (const cam of cameras) {
      const name = cam.connectorName ?? formatConnectorCategory(cam.connectorCategory);
      if (!map.has(name)) map.set(name, { name, category: cam.connectorCategory });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [cameras]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return cameras.filter(cam => {
      const nameOk = !term || (cam.name || '').toLowerCase().includes(term);
      const connName = cam.connectorName ?? formatConnectorCategory(cam.connectorCategory);
      const connOk = connectorFilter === 'all' || connName === connectorFilter;
      return nameOk && connOk;
    });
  }, [cameras, search, connectorFilter]);

  const [visibleAssigned, visibleAvailable] = React.useMemo(() => {
    const assigned: DeviceWithConnector[] = [];
    const available: DeviceWithConnector[] = [];
    for (const cam of filtered) {
      if (selectedIds.has(cam.id)) assigned.push(cam); else available.push(cam);
    }
    return [assigned, available];
  }, [filtered, selectedIds]);

  const toggleSelectAll = (scope: 'assigned' | 'available') => {
    const target = scope === 'assigned' ? visibleAssigned : visibleAvailable;
    const allSelected = target.every(cam => selectedIds.has(cam.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        // uncheck all in this scope
        for (const cam of target) next.delete(cam.id);
      } else {
        // check all in this scope
        for (const cam of target) next.add(cam.id);
      }
      return next;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit cameras</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search cameras..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 max-w-[260px]"
            />
            <Select value={connectorFilter} onValueChange={setConnectorFilter}>
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="Filter by connector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Connectors</SelectItem>
                {uniqueConnectors.map(c => (
                  <SelectItem key={c.name} value={c.name}>
                    <div className="inline-flex items-center gap-2">
                      <ConnectorIcon connectorCategory={c.category} size={14} />
                      <span>{c.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <span>Assigned</span>
                <Badge variant="secondary" className="font-normal">{visibleAssigned.length}</Badge>
              </h4>
              <div className="grid grid-cols-[32px_1fr_160px] items-center px-2 py-2 text-xs text-muted-foreground border-b bg-muted/50 rounded-t-md">
                <Checkbox
                  checked={visibleAssigned.length > 0 && visibleAssigned.every(cam => selectedIds.has(cam.id))}
                  onCheckedChange={() => toggleSelectAll('assigned')}
                  aria-label="Select all assigned"
                />
                <span>Camera</span>
                <span className="pl-1">Connector</span>
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-b-md border">
                {visibleAssigned.map(cam => (
                  <label key={cam.id} className="grid grid-cols-[32px_1fr_160px] items-center gap-2 py-2 px-2 border-b last:border-b-0">
                    <Checkbox
                      checked={selectedIds.has(cam.id)}
                      onCheckedChange={(checked) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(cam.id); else next.delete(cam.id);
                          return next;
                        });
                      }}
                    />
                    <span className="truncate text-sm">{cam.name}</span>
                    <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal justify-self-start w-auto">
                      <ConnectorIcon connectorCategory={cam.connectorCategory} size={12} />
                      <span className="text-xs">{cam.connectorName ?? formatConnectorCategory(cam.connectorCategory)}</span>
                    </Badge>
                  </label>
                ))}
                {visibleAssigned.length === 0 && (
                  <div className="text-sm text-muted-foreground py-6 text-center">None</div>
                )}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <span>Unassigned</span>
                <Badge variant="secondary" className="font-normal">{visibleAvailable.length}</Badge>
              </h4>
              <div className="grid grid-cols-[32px_1fr_160px] items-center px-2 py-2 text-xs text-muted-foreground border-b bg-muted/50 rounded-t-md">
                <Checkbox
                  checked={visibleAvailable.length > 0 && visibleAvailable.every(cam => selectedIds.has(cam.id))}
                  onCheckedChange={() => toggleSelectAll('available')}
                  aria-label="Select all available"
                />
                <span>Camera</span>
                <span className="pl-1">Connector</span>
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-b-md border">
                {visibleAvailable.map(cam => (
                  <label key={cam.id} className="grid grid-cols-[32px_1fr_160px] items-center gap-2 py-2 px-2 border-b last:border-b-0">
                    <Checkbox
                      checked={selectedIds.has(cam.id)}
                      onCheckedChange={(checked) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(cam.id); else next.delete(cam.id);
                          return next;
                        });
                      }}
                    />
                    <span className="truncate text-sm">{cam.name}</span>
                    <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal justify-self-start w-auto">
                      <ConnectorIcon connectorCategory={cam.connectorCategory} size={12} />
                      <span className="text-xs">{cam.connectorName ?? formatConnectorCategory(cam.connectorCategory)}</span>
                    </Badge>
                  </label>
                ))}
                {visibleAvailable.length === 0 && (
                  <div className="text-sm text-muted-foreground py-6 text-center">None</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onApply(Array.from(selectedIds)); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


