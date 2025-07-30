import React, { useState, useMemo } from 'react';
import { 
  EventCategory, 
  EventType, 
  EventSubtype, 
  EVENT_CATEGORY_DISPLAY_MAP, 
  EVENT_TYPE_DISPLAY_MAP,
  EVENT_SUBTYPE_DISPLAY_MAP
} from '@/lib/mappings/definitions';
import { EVENT_HIERARCHY } from '@/lib/mappings/event-hierarchy';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getEventCategoryIcon, getSeverityBadgeStyle, getSeverityDisplayName } from '@/lib/mappings/presentation';
import { 
    Collapsible, 
    CollapsibleContent, 
    CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { ChevronRight, PlusSquare, MinusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeverityLevel, getEventSeverity } from '@/lib/mappings/severity';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import { badgeVariants } from '@/components/ui/badge';

// Define the type for standard badge variants used
type StandardBadgeVariant = VariantProps<typeof badgeVariants>["variant"];

// List of known standard badge variants used for severity
const standardSeverityVariants: StandardBadgeVariant[] = ['destructive', 'secondary', 'default', 'outline'];

// Generate display hierarchy from the central EVENT_HIERARCHY
const eventHierarchy = Object.fromEntries(
  Object.entries(EVENT_HIERARCHY).map(([category, types]) => [
    category,
    {
      displayName: EVENT_CATEGORY_DISPLAY_MAP[category as EventCategory],
      types: Object.fromEntries(
        Object.entries(types).map(([eventType, subtypes]) => [
          eventType,
          {
            displayName: EVENT_TYPE_DISPLAY_MAP[eventType as EventType],
            subtypes: (subtypes as EventSubtype[]).sort()
          }
        ])
      )
    }
  ])
);

export const EventHierarchyViewer: React.FC = () => {
    // Initialize state with all categories open
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() => {
        const initiallyOpen: Record<string, boolean> = {};
        for (const key of Object.keys(eventHierarchy)) {
            initiallyOpen[key] = true;
        }
        return initiallyOpen;
    });

    const sortedHierarchyEntries = useMemo(() => 
        Object.entries(eventHierarchy).sort(([, a], [, b]) => 
            a.displayName.localeCompare(b.displayName)
        ), 
    []);

    const toggleCategory = (categoryKey: string) => {
        setOpenCategories(prev => ({ ...prev, [categoryKey]: !prev[categoryKey] }));
    };

    // --- Calculate if all are expanded --- 
    const allExpanded = useMemo(() => {
        if (sortedHierarchyEntries.length === 0) return false; // No categories, nothing expanded
        return sortedHierarchyEntries.every(([key]) => openCategories[key]);
    }, [openCategories, sortedHierarchyEntries]);

    // --- Single Toggle Function --- 
    const toggleAll = () => {
        if (allExpanded) {
            // Collapse all
            setOpenCategories({});
        } else {
            // Expand all
            const allOpen = sortedHierarchyEntries.reduce((acc, [key]) => {
                acc[key] = true;
                return acc;
            }, {} as Record<string, boolean>);
            setOpenCategories(allOpen);
        }
    };

    return (
        <div className="flex flex-col h-[calc(60vh+40px)]"> 
            {/* --- Single Toggle Button --- */}
            <div className="flex items-center justify-end gap-2 mb-2 px-1 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={toggleAll} className="text-xs h-7">
                    {allExpanded ? (
                        <MinusSquare className="h-3.5 w-3.5" />
                    ) : (
                        <PlusSquare className="h-3.5 w-3.5" />
                    )}
                    {allExpanded ? 'Collapse All' : 'Expand All'}
                </Button>
            </div>
            {/* --- End Single Toggle Button --- */}

            <ScrollArea className="flex-grow pr-4"> 
                <div className="space-y-1"> 
                    {sortedHierarchyEntries.map(([categoryKey, categoryData], index) => {
                        const IconComponent = getEventCategoryIcon(categoryKey as EventCategory);
                        const isOpen = openCategories[categoryKey] || false;

                        return (
                            <React.Fragment key={categoryKey}>
                                <Collapsible 
                                    open={isOpen} 
                                    onOpenChange={() => toggleCategory(categoryKey)}
                                    className="space-y-2"
                                >
                                    <CollapsibleTrigger className="flex w-full items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                                        <ChevronRight 
                                            className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} 
                                        />
                                        {IconComponent && <IconComponent className="h-5 w-5 text-muted-foreground" />} 
                                        <span className="text-md font-semibold">{categoryData.displayName}</span>
                                        <Badge variant="secondary" className="ml-auto font-mono text-xs">{categoryKey}</Badge>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pl-8 pr-2 pb-2">
                                        <div className="space-y-4 pl-4 border-l-2 border-muted/80">
                                            {Object.entries(categoryData.types).map(([typeKey, typeData]) => {
                                                // --- Calculate Severity --- 
                                                const severity = getEventSeverity({ eventType: typeKey } as any); 
                                                const severityStyle = getSeverityBadgeStyle(severity);
                                                const severityName = getSeverityDisplayName(severity);
                                                // --- Determine if it's a standard variant --- 
                                                const isStandardVariant = typeof severityStyle === 'string' && standardSeverityVariants.includes(severityStyle as StandardBadgeVariant);
                                                // --- End Calculate Severity --- 
                                                return (
                                                    <div key={typeKey} className="relative pt-2">
                                                        <div className="absolute -left-[9px] top-[18px] h-px w-2 bg-muted/80"></div>
                                                        <h4 className="text-sm font-medium mb-1 inline-flex items-center gap-1.5 flex-wrap">
                                                            <span>{typeData.displayName}</span>
                                                            <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">{typeKey}</Badge>
                                                            <Badge 
                                                               className={cn(
                                                                   "font-mono text-[10px] px-1 py-0 uppercase", 
                                                                   !isStandardVariant && typeof severityStyle === 'string' ? severityStyle : ''
                                                               )}
                                                               variant={isStandardVariant ? (severityStyle as StandardBadgeVariant) : undefined}
                                                            >
                                                                {severityName}
                                                            </Badge>
                                                        </h4>
                                                        {typeData.subtypes.length > 0 ? (
                                                            <ul className="list-disc list-inside space-y-1 pl-4 text-xs text-muted-foreground">
                                                                {typeData.subtypes.map((subtypeKey: EventSubtype) => (
                                                                    <li key={subtypeKey}>
                                                                        {EVENT_SUBTYPE_DISPLAY_MAP[subtypeKey] || subtypeKey}
                                                                        <Badge variant="outline" className="ml-1 font-mono text-[10px] px-1 py-0">{subtypeKey}</Badge>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="text-xs text-muted-foreground pl-4 italic">No defined subtypes</p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                                {index < sortedHierarchyEntries.length - 1 && (
                                    <Separator className="my-2" /> 
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}; 