'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DeviceType, DeviceSubtype } from '@/lib/mappings/definitions';
import { deviceIdentifierMap } from '@/lib/mappings/identification';
import { getDeviceTypeIcon } from '@/lib/mappings/presentation';
import { TypedDeviceInfo, validDisplayStatesMap, DisplayState } from '@/lib/mappings/definitions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatConnectorCategory } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpCircle } from 'lucide-react';

// Helper type for flattened data
type FlattenedMapping = {
  connector: string;
  identifier: string;
  mapping: TypedDeviceInfo;
};

// Helper type for grouped data
type GroupedMappings = { 
  [type in DeviceType]?: FlattenedMapping[] 
};

// Define header configuration
const tableHeaders = [
  { key: 'connector', label: 'Connector', className: 'w-[50px] text-center' },
  { key: 'identifier', label: 'Raw Identifier' },
  { key: 'mappedType', label: 'Mapped Type' },
  { key: 'subtype', label: 'Subtype' },
  { key: 'icon', label: 'Icon', className: 'w-[50px] text-center' },
];

type ViewMode = 'identifiers' | 'states';

export function DeviceMappingDialogContent() {
  const [isGrouped, setIsGrouped] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all'); // State for category filter
  const [viewMode, setViewMode] = useState<ViewMode>('identifiers'); // State for view mode

  // Flatten, filter, and process the data (only for identifier view)
  const { flatMappings, groupedMappings } = useMemo(() => {
    const flattened: FlattenedMapping[] = [];
    Object.entries(deviceIdentifierMap).forEach(([connector, identifiers]) => {
      Object.entries(identifiers).forEach(([identifier, mapping]) => {
        flattened.push({ 
          connector, // Keep raw connector key
          identifier, 
          mapping: mapping as TypedDeviceInfo 
        });
      });
    });

    // 1. Apply Category Filter
    const categoryFiltered = categoryFilter === 'all'
      ? flattened
      : flattened.filter(item => item.connector.toLowerCase() === categoryFilter);

    // Update text filtering logic to use raw connector key AND formatted name
    const lowerCaseFilter = filterText.toLowerCase();
    const textFiltered = filterText
      ? categoryFiltered.filter(item => 
          item.connector.toLowerCase().includes(lowerCaseFilter) || // Filter by raw key
          formatConnectorCategory(item.connector).toLowerCase().includes(lowerCaseFilter) || // Filter by formatted name
          item.identifier.toLowerCase().includes(lowerCaseFilter) ||
          item.mapping.type.toLowerCase().includes(lowerCaseFilter) ||
          (item.mapping.subtype && item.mapping.subtype.toLowerCase().includes(lowerCaseFilter))
        )
      : categoryFiltered;

    const finalFiltered = [...textFiltered];

    // Sort the final filtered list (Identifier -> Connector)
    finalFiltered.sort((a, b) => {
        if (a.identifier !== b.identifier) {
            return a.identifier.localeCompare(b.identifier);
        }
        // Secondary sort by connector if identifiers are the same
        return a.connector.localeCompare(b.connector); 
    });

    // Group the final filtered data by type
    const grouped: GroupedMappings = {};
    finalFiltered.forEach(item => {
        const type = item.mapping.type as DeviceType;
        if (!grouped[type]) {
            grouped[type] = [];
        }
        grouped[type]?.push(item);
    });
    
    const sortedGroupKeys = Object.keys(grouped).sort() as DeviceType[];
    const sortedGroupedMappings: GroupedMappings = {};
    sortedGroupKeys.forEach(key => {
        sortedGroupedMappings[key] = grouped[key];
    });

    return { flatMappings: finalFiltered, groupedMappings: sortedGroupedMappings };
  }, [filterText, categoryFilter]); // Re-run memo when filters change

  // Prepare data for the Device Stats view
  const typesViewData = useMemo(() => {
    // Get all DeviceType enum values and sort them alphabetically
    const allTypes = Object.values(DeviceType).sort((a, b) => a.localeCompare(b));

    const data = allTypes.map(deviceType => {
      const Icon = getDeviceTypeIcon(deviceType);
      const typeStates = validDisplayStatesMap[deviceType]?.['null'] || [];
      const subtypeEntries = Object.entries(validDisplayStatesMap[deviceType] || {})
        .filter(([key, value]) => key !== 'null' && value && value.length > 0)
        .map(([subtype, states]) => ({ 
          subtype: subtype as DeviceSubtype,
          states: states as DisplayState[]
        }))
        .sort((a, b) => a.subtype.localeCompare(b.subtype)); // Sort subtypes alphabetically

      return {
        type: deviceType,
        icon: Icon,
        states: typeStates,
        subtypes: subtypeEntries
      };
    });

    // Filter out types that have neither direct states nor subtype states defined
    // (Keeps all defined DeviceTypes listed, even if they have no states currently mapped)
    // return data.filter(item => item.states.length > 0 || item.subtypes.length > 0);
    return data; // Keep all types listed
  }, []);

  const totalMappings = useMemo(() => {
    let count = 0;
    Object.values(deviceIdentifierMap).forEach(ids => count += Object.keys(ids).length);
    return count;
  }, []);

  return (
    <TooltipProvider>
      <DialogHeader>
        <DialogTitle>Device Types & State Mappings ({totalMappings})</DialogTitle>
        <DialogDescription>
          {viewMode === 'identifiers'
            ? 'Internal mapping of raw device identifiers to standardized types, subtypes, and icons.'
            : 'Overview of standardized device types, subtypes, icons, and their supported states.'}
        </DialogDescription>
      </DialogHeader>

      <Tabs value={viewMode} onValueChange={(value: string) => setViewMode(value as ViewMode)} className="pt-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="identifiers">Device Types</TabsTrigger>
          <TabsTrigger value="states">Device States</TabsTrigger>
        </TabsList>

        <TabsContent value="identifiers" className="mt-2 data-[state=inactive]:hidden overflow-y-auto max-h-[60vh]">
          <div className="space-y-2 pt-0 pb-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-grow">
                <Input
                  placeholder="Filter mappings..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <ToggleGroup
                type="single"
                defaultValue="all"
                variant="outline"
                size="sm"
                onValueChange={(value) => { if (value) setCategoryFilter(value); }}
                aria-label="Filter by connector type"
                className="flex-shrink-0"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value="all" aria-label="All types">All</ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>All Connectors</TooltipContent>
                </Tooltip>
                {Object.keys(deviceIdentifierMap).map(cat => (
                  <ToggleGroupItem key={cat} value={cat} aria-label={`${formatConnectorCategory(cat)} type`} className="p-1.5 data-[state=on]:bg-accent">
                    <ConnectorIcon connectorCategory={cat} size={16} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="group-by-type"
                checked={isGrouped}
                onCheckedChange={setIsGrouped}
              />
              <Label htmlFor="group-by-type">Group by Type</Label>
            </div>
          </div>

          <div className="pr-4">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  {tableHeaders.map(header => (
                    <TableHead key={header.key} className={header.className}> 
                      {header.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatMappings.length === 0 && (filterText || categoryFilter !== 'all') && (
                  <TableRow>
                    <TableCell colSpan={tableHeaders.length} className="text-center text-muted-foreground py-4">
                      No mappings found matching the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {isGrouped
                  ? Object.entries(groupedMappings).map(([type, items]) => { 
                      const GroupIconComponent = getDeviceTypeIcon(type as DeviceType);
                      return (
                        <React.Fragment key={type}>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableCell colSpan={tableHeaders.length - 1} className="font-semibold">
                              {type} ({items?.length} item{items?.length !== 1 ? 's' : ''})
                            </TableCell>
                            <TableCell className="text-center">
                              <GroupIconComponent className="h-4 w-4 inline-block text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                          {items?.map(({ connector, identifier, mapping }) => (
                            <TableRow key={`${connector}-${identifier}`}>
                              <TableCell className="pl-6 text-center">
                                <ConnectorIcon connectorCategory={connector} size={16} />
                              </TableCell>
                              <TableCell className="font-mono text-xs">{identifier}</TableCell>
                              <TableCell>{mapping.type}</TableCell>
                              <TableCell>{mapping.subtype || ''}</TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      );
                    })
                  : flatMappings.map(({ connector, identifier, mapping }) => { 
                      const IconComponent = getDeviceTypeIcon(mapping.type as DeviceType);
                      return (
                        <TableRow key={`${connector}-${identifier}`}>
                          <TableCell className="text-center">
                            <ConnectorIcon connectorCategory={connector} size={16} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{identifier}</TableCell>
                          <TableCell>{mapping.type}</TableCell>
                          <TableCell>{mapping.subtype || ''}</TableCell>
                          <TableCell className="text-center">
                            <IconComponent className="h-4 w-4 inline-block text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="states" className="mt-2 data-[state=inactive]:hidden overflow-y-auto max-h-[60vh]">
          <div className="space-y-3 pr-4">
            {typesViewData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No Device Types found or state mappings defined.</p>
            ) : (
              typesViewData.map(({ type, icon: TypeIcon, states: typeStates, subtypes }) => (
                <div key={type} className="p-3 border rounded-md">
                  <div className="flex items-center mb-2">
                    <TypeIcon className="h-4 w-4 text-muted-foreground mr-2" />
                    <span className="text-sm font-medium">{type}</span>
                  </div>
                  {(typeStates.length > 0 || subtypes.length > 0) ? (
                    <div className="pl-6 border-l border-dashed ml-2 space-y-2">
                      {typeStates.length > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Direct States:</div>
                          <div className="flex flex-wrap gap-1">
                            {typeStates.map(state => (
                              <Badge key={state} variant="secondary" className="px-1.5 py-0.5 text-xs font-normal">
                                {state}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {subtypes.map(({ subtype, states }) => (
                        <div key={subtype}>
                          <div className="text-xs font-medium mb-1">
                            Subtype: <span className="text-muted-foreground font-normal">{subtype}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {states.map(state => (
                              <Badge key={state} variant="secondary" className="px-1.5 py-0.5 text-xs font-normal">
                                {state}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : ( 
                    <p className="text-xs text-muted-foreground pl-6 mt-1">No specific states mapped for this type/subtypes.</p> 
                  )}
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog Footer with Close Button */}
      <DialogFooter className="pt-4 mt-4 border-t"> {/* Added spacing and border */}
        <DialogClose asChild>
          <Button type="button" variant="secondary">Close</Button>
        </DialogClose>
      </DialogFooter>

    </TooltipProvider>
  );
} 