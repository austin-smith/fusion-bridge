'use client';

import React, { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Map, Pencil, MapPin, FileText, Clock, Building2, ExternalLink } from 'lucide-react';
import type { Location } from '@/types/index';
import { LocationWeatherIcon } from '@/components/features/locations/location-weather-icon';
import { cn } from '@/lib/utils';

export interface LocationDetailSheetProps {
    location: Location | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEdit: (location: Location) => void;
    onViewFloorPlan: (location: Location) => void;
}

export function LocationDetailSheet({ location, open, onOpenChange, onEdit, onViewFloorPlan }: LocationDetailSheetProps) {
    const handleEdit = () => {
        if (location) onEdit(location);
    };
    const handleViewFloorPlan = () => {
        if (location) {
            window.open(`/locations/${location.id}/floor-plans`, '_blank', 'noopener,noreferrer');
        }
    };

    // Helper function to generate Google Maps URL with address + coordinates
    const generateGoogleMapsUrl = (location: Location): string => {
        const { addressStreet, addressCity, addressState, addressPostalCode, latitude, longitude } = location;

        // If we have a complete address, use it with coordinates for better accuracy
        if (addressStreet && addressCity && addressState && addressPostalCode && latitude && longitude) {
            const address = `${addressStreet}, ${addressCity}, ${addressState} ${addressPostalCode}`;
            const encodedAddress = encodeURIComponent(address);
            return `https://maps.google.com/maps?q=${encodedAddress}+@${latitude},${longitude}`;
        }

        // If we have coordinates but incomplete address
        if (latitude && longitude) {
            return `https://maps.google.com/maps?q=${latitude},${longitude}`;
        }

        // Fallback to address only
        if (addressStreet && addressCity && addressState) {
            const address = `${addressStreet}, ${addressCity}, ${addressState} ${addressPostalCode || ''}`.trim();
            const encodedAddress = encodeURIComponent(address);
            return `https://maps.google.com/maps?q=${encodedAddress}`;
        }

        return '';
    };

    // Check if we can show Google Maps
    const canShowGoogleMaps = useMemo(() => {
        if (!location) return false;
        return !!(location.latitude && location.longitude) ||
            !!(location.addressStreet && location.addressCity && location.addressState);
    }, [location]);

    const handleViewOnGoogleMaps = () => {
        if (!location || !canShowGoogleMaps) return;

        const mapUrl = generateGoogleMapsUrl(location);
        if (mapUrl) {
            window.open(mapUrl, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
            <SheetContent
                side="left"
                className="w-full sm:max-w-md p-0 flex flex-col"
                id="location-detail-sheet"
                onInteractOutside={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => e.preventDefault()}
            >
                <SheetHeader className="px-5 py-3 border-b bg-muted/20">
                    <div className="flex items-center justify-between gap-4 pr-8">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                                <SheetTitle className="text-lg font-semibold truncate">{location?.name}</SheetTitle>
                            </div>
                            {(location?.addressCity || location?.addressState) && (
                                <SheetDescription className="flex items-center gap-1.5 text-sm">
                                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    {[location?.addressCity, location?.addressState].filter(Boolean).join(', ')}
                                </SheetDescription>
                            )}
                        </div>
                        {location && (
                            <div className="shrink-0 text-smfl flex items-center">
                                <LocationWeatherIcon locationId={location.id} />
                            </div>
                        )}
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
                    {/* Address Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-sm font-medium">Address</h3>
                        </div>
                        <div className="pl-6 space-y-1">
                            {location?.addressStreet ? (
                                <div className="text-sm text-muted-foreground">{location.addressStreet}</div>
                            ) : (
                                <div className="text-sm text-muted-foreground italic">No street address</div>
                            )}
                            {(location?.addressCity || location?.addressState || location?.addressPostalCode) ? (
                                <div className="text-sm text-muted-foreground">
                                    {(() => {
                                        const cityState = [location?.addressCity, location?.addressState].filter(Boolean).join(', ');
                                        const postal = location?.addressPostalCode ?? '';
                                        return [cityState, postal].filter(Boolean).join(' ');
                                    })()}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <Separator />

                    {/* Timezone Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-sm font-medium">Time Zone</h3>
                        </div>
                        <div className="pl-6">
                            {location?.timeZone ? (
                                <Badge variant="secondary" className="font-mono text-xs">
                                    {location.timeZone}
                                </Badge>
                            ) : (
                                <div className="text-sm text-muted-foreground italic">No timezone set</div>
                            )}
                        </div>
                    </div>

                    {/* Coordinates (if available) */}
                    {location?.latitude && location?.longitude && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Map className="h-4 w-4 text-muted-foreground" />
                                    <h3 className="text-sm font-medium">Coordinates</h3>
                                </div>
                                <div className="pl-6">
                                    <Badge variant="outline" className="font-mono text-xs">
                                        {Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)}
                                    </Badge>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Notes Section - only show if notes exist */}
                    {location?.notes && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <h3 className="text-sm font-medium">Notes</h3>
                                </div>
                                <div className="pl-6">
                                    <div className="text-sm text-muted-foreground">
                                        {location.notes}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Actions Footer */}
                <div className="border-t bg-muted/10 px-5 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={handleEdit} disabled={!location}>
                            <Pencil className="h-4 w-4" />
                            Edit Location
                        </Button>
                        <Button variant="outline" onClick={handleViewFloorPlan} disabled={!location}>
                            <Map className="h-4 w-4" />
                            Floor Plans
                        </Button>
                    </div>

                    {canShowGoogleMaps && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        onClick={handleViewOnGoogleMaps}
                                        disabled={!location}
                                        className="w-full"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Open in Google Maps
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    View this location in Google Maps
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    {location?.id && (
                        <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded text-center">
                            ID: {location.id}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default LocationDetailSheet;