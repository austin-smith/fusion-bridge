'use client';

import React, { useState, useMemo } from 'react';
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  deviceIdentifierMap,
  getDeviceTypeIcon,
  DeviceType, // Import DeviceType enum
} from '@/lib/device-mapping';
import { TypedDeviceInfo } from '@/types/device-mapping'; // Import TypedDeviceInfo
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch'; // Import Switch
import { Label } from '@/components/ui/label';   // Import Label
import { formatConnectorCategory } from "@/lib/utils"; // Import formatter
import { Input } from "@/components/ui/input"; // Import Input
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // Import ToggleGroup
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"; // Import Tooltip components
import { ConnectorIcon } from "@/components/features/connectors/connector-icon"; // Import the new component

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

export function DeviceMappingDialogContent() {
  const [isGrouped, setIsGrouped] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all'); // State for category filter

  // Flatten, filter, and process the data
  const { flatMappings, groupedMappings } = useMemo(() => {
    let flattened: FlattenedMapping[] = [];
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

    // Sort the final filtered list (Connector -> Identifier)
    finalFiltered.sort((a, b) => {
        if (a.connector !== b.connector) {
            return a.connector.localeCompare(b.connector);
        }
        return a.identifier.localeCompare(b.identifier);
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

  const totalMappings = useMemo(() => {
    let count = 0;
    Object.values(deviceIdentifierMap).forEach(ids => count += Object.keys(ids).length);
    return count;
  }, []);

  return (
    <TooltipProvider> {/* Wrap entire return in TooltipProvider */}
      <DialogHeader>
        <DialogTitle>Device Type Mappings ({totalMappings})</DialogTitle>
        <DialogDescription>
          Internal mapping of raw device identifiers to standardized types,
          subtypes, and icons.
        </DialogDescription>
        {/* Filters Row */}
        <div className="flex items-center justify-between pt-2 gap-4">
          {/* Text Filter Input */}
          <div className="flex-grow">
            <Input 
              placeholder="Filter mappings (e.g., YoLink, Camera, COSmokeSensor)..." 
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {/* Category Filter Toggle - Use ConnectorIcon */} 
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
                // Use ConnectorIcon directly in ToggleGroupItem
                <ToggleGroupItem key={cat} value={cat} aria-label={`${formatConnectorCategory(cat)} type`} className="p-1.5 data-[state=on]:bg-accent">
                    <ConnectorIcon connectorCategory={cat} size={16} />
                </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {/* Grouping Switch Row (Optional: could be combined above) */}
        <div className="flex items-center space-x-2 pt-2">
            <Switch
              id="group-by-type"
              checked={isGrouped}
              onCheckedChange={setIsGrouped}
            />
            <Label htmlFor="group-by-type">Group by Type</Label>
        </div>
      </DialogHeader>
      <ScrollArea className="h-[60vh] pr-4 mt-2">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px] text-center"> 
                Connector
              </TableHead>
              <TableHead>Raw Identifier</TableHead>
              <TableHead>Mapped Type</TableHead>
              <TableHead>Subtype</TableHead>
              <TableHead className="w-[50px] text-center">Icon</TableHead> 
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* No Results Message */} 
            {flatMappings.length === 0 && (filterText || categoryFilter !== 'all') && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
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
                        <TableCell colSpan={4} className="font-semibold">
                          {type} ({items?.length} item{items?.length !== 1 ? 's' : ''})
                        </TableCell>
                        <TableCell className="text-center">
                          <GroupIconComponent className="h-4 w-4 inline-block" />
                        </TableCell>
                      </TableRow>
                      {items?.map(({ connector, identifier, mapping }) => {
                        return (
                          <TableRow key={`${connector}-${identifier}`}>
                            <TableCell className="pl-6 text-center">
                              {/* Use ConnectorIcon component */}
                              <ConnectorIcon connectorCategory={connector} size={16} />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{identifier}</TableCell>
                            <TableCell>{mapping.type}</TableCell>
                            <TableCell>{mapping.subtype || ''}</TableCell>
                            <TableCell></TableCell> 
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              : flatMappings.map(({ connector, identifier, mapping }) => { 
                  const IconComponent = getDeviceTypeIcon(mapping.type as DeviceType);
                  return (
                    <TableRow key={`${connector}-${identifier}`}>
                      <TableCell className="text-center">
                        {/* Use ConnectorIcon component */}
                        <ConnectorIcon connectorCategory={connector} size={16} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{identifier}</TableCell>
                      <TableCell>{mapping.type}</TableCell>
                      <TableCell>{mapping.subtype || ''}</TableCell>
                      <TableCell className="text-center">
                        <IconComponent className="h-4 w-4 inline-block" />
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </ScrollArea>
    </TooltipProvider>
  );
} 