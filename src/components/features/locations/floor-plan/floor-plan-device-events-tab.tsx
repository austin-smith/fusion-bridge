'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Activity, ImageOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDisplayStateColorClass, getDisplayStateIcon, getEventCategoryIcon } from '@/lib/mappings/presentation';
import { EVENT_CATEGORY_DISPLAY_MAP, EVENT_SUBTYPE_DISPLAY_MAP, EVENT_TYPE_DISPLAY_MAP, type EventSubtype, type EventType } from '@/lib/mappings/definitions';
import { format, formatDistanceToNow } from 'date-fns';
import { buildThumbnailUrl, getThumbnailSource } from '@/services/event-thumbnail-resolver';
import { EventDetailDialogContent } from '@/components/features/events/event-detail-dialog-content';
import Image from 'next/image';

function Section({
  title,
  icon: Icon,
  className,
  headerRight,
  children,
}: {
  title: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  className?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-md border bg-card/50 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
          <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
        </div>
        {headerRight}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export interface FloorPlanDeviceEventsTabProps {
  deviceId: string;
  spaceCameras: any[];
}

export function FloorPlanDeviceEventsTab({ deviceId, spaceCameras }: FloorPlanDeviceEventsTabProps) {
  const [isLoadingEvents, setIsLoadingEvents] = React.useState(false);
  const [eventsError, setEventsError] = React.useState<string | null>(null);
  const [deviceEvents, setDeviceEvents] = React.useState<any[]>([]);
  const [failedThumbEventIds, setFailedThumbEventIds] = React.useState<Set<string>>(new Set());
  const [loadedThumbEventIds, setLoadedThumbEventIds] = React.useState<Set<string>>(new Set());
  const [isEventDialogOpen, setIsEventDialogOpen] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState<any | null>(null);

  const lastFetchTsRef = React.useRef<number>(0);
  const lastFetchedKeyRef = React.useRef<string | null>(null);
  const inFlightKeyRef = React.useRef<string | null>(null);
  const eventsAbortRef = React.useRef<AbortController | null>(null);

  const allCategoryKeys = React.useMemo(() => Object.keys(EVENT_CATEGORY_DISPLAY_MAP), []);
  const defaultCategoryKeys = React.useMemo(
    () => allCategoryKeys.filter((k) => k.toLowerCase() !== 'diagnostics'),
    [allCategoryKeys]
  );
  const [categoryFilter, setCategoryFilter] = React.useState<string[]>(defaultCategoryKeys);

  const fetchRecentEventsForDevice = React.useCallback(async (categories?: string[]) => {
    if (!deviceId) return;
    const nowTs = Date.now();
    const categoriesKey = Array.isArray(categories) && categories.length > 0 ? [...categories].sort().join(',') : '';
    const uniqueKey = `${deviceId}::${categoriesKey}`;
    if (nowTs - lastFetchTsRef.current < 1500 && lastFetchedKeyRef.current === uniqueKey) return;
    if (inFlightKeyRef.current === uniqueKey) return;
    if (eventsAbortRef.current) eventsAbortRef.current.abort();

    lastFetchedKeyRef.current = uniqueKey;
    inFlightKeyRef.current = uniqueKey;
    const controller = new AbortController();
    eventsAbortRef.current = controller;
    setIsLoadingEvents(true);
    setEventsError(null);
    // Clear thumbnail load/error tracking for fresh results
    setFailedThumbEventIds(new Set());
    setLoadedThumbEventIds(new Set());
    try {
      const params = new URLSearchParams({ page: '1', limit: '20', deviceInternalId: deviceId });
      if (categories && categories.length > 0) params.append('eventCategories', categories.join(','));
      const res = await fetch(`/api/events?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch events');
      }
      const json = await res.json();
      const events = json?.data ?? [];
      setDeviceEvents(Array.isArray(events) ? events : []);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setEventsError(e?.message || 'Failed to load events');
    } finally {
      setIsLoadingEvents(false);
      lastFetchTsRef.current = Date.now();
      if (inFlightKeyRef.current === uniqueKey) inFlightKeyRef.current = null;
    }
  }, [deviceId]);

  const handleMount = React.useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    if (!deviceId) return;
    setDeviceEvents([]);
    setEventsError(null);
    setFailedThumbEventIds(new Set());
    setLoadedThumbEventIds(new Set());
    fetchRecentEventsForDevice(categoryFilter);
  }, [deviceId, categoryFilter, fetchRecentEventsForDevice]);

  return (
    <div ref={handleMount}>
      <Section
        title="Recent Events"
        icon={Activity}
        headerRight={(
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2">
                <span className="text-xs">Categories ({categoryFilter.length === allCategoryKeys.length ? 'All' : categoryFilter.length})</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Event Categories</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(EVENT_CATEGORY_DISPLAY_MAP).map(([key, label]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={categoryFilter.includes(key)}
                  onCheckedChange={(checked) => {
                    setCategoryFilter((prev) => {
                      const set = new Set(prev);
                      if (checked) set.add(key); else set.delete(key);
                      let next = Array.from(set);
                      if (next.length === 0) next = defaultCategoryKeys;
                      if (deviceId) {
                        setDeviceEvents([]);
                        setEventsError(null);
                         setFailedThumbEventIds(new Set());
                         setLoadedThumbEventIds(new Set());
                        fetchRecentEventsForDevice(next);
                      }
                      return next;
                    });
                  }}
                  onSelect={(e) => e.preventDefault()}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      >
        {isLoadingEvents ? (
          <div className="py-8 text-sm text-muted-foreground">Loading…</div>
        ) : eventsError ? (
          <div className="py-4 text-sm text-destructive">{eventsError}</div>
        ) : deviceEvents.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">No recent events.</div>
        ) : (
          <div className="divide-y border rounded-md overflow-hidden">
            {deviceEvents.map((evt: any) => {
              const CatIcon = getEventCategoryIcon?.(evt.eventCategory) || Activity;
              const eventTime = new Date(evt.timestamp);
              const now = new Date();
              const isToday = eventTime.getDate() === now.getDate() &&
                eventTime.getMonth() === now.getMonth() &&
                eventTime.getFullYear() === now.getFullYear();
              const isThisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) < eventTime;
              const displayTime = isToday ? format(eventTime, 'h:mm a') : (isThisWeek ? format(eventTime, 'EEE h:mm a') : format(eventTime, 'MMM d, yyyy'));
              const timeText = `${displayTime} · ${formatDistanceToNow(eventTime, { addSuffix: true })}`;
              const StateIcon = evt.displayState ? getDisplayStateIcon(evt.displayState) : null;
              const stateColorClass = evt.displayState ? getDisplayStateColorClass(evt.displayState) : '';

              let thumbUrl: string | null = null;
              try {
                const src = getThumbnailSource(evt, spaceCameras);
                // Request a smaller thumbnail since list items render at ~64px width
                if (src) thumbUrl = buildThumbnailUrl(src, '192x0');
              } catch {}
              const hasThumb = !!thumbUrl && !failedThumbEventIds.has(evt.eventUuid);

              return (
                <button
                  key={evt.eventUuid}
                  type="button"
                  className="group w-full text-left px-3 py-1.5 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                  onClick={() => {
                    setSelectedEvent(evt);
                    setIsEventDialogOpen(true);
                  }}
                >
                  <div className="flex items-start gap-3">
                    {hasThumb ? (
                      <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-sm border">
                        <Image
                          src={thumbUrl!}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                          loading="lazy"
                          unoptimized
                          onLoad={() => {
                            setLoadedThumbEventIds((prev) => {
                              const next = new Set(prev);
                              next.add(evt.eventUuid);
                              return next;
                            });
                          }}
                          onError={() => {
                            setFailedThumbEventIds((prev) => {
                              const next = new Set(prev);
                              next.add(evt.eventUuid);
                              return next;
                            });
                            setLoadedThumbEventIds((prev) => {
                              const next = new Set(prev);
                              next.add(evt.eventUuid);
                              return next;
                            });
                          }}
                        />
                        {(!loadedThumbEventIds.has(evt.eventUuid)) && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                      </div>
                    ) : thumbUrl ? (
                      <div className="h-12 w-16 shrink-0 rounded-sm border bg-muted/30 grid place-items-center">
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex items-center" aria-label="No thumbnail available">
                                <ImageOff className="h-5 w-5 text-muted-foreground" />
                                <span className="sr-only">No thumbnail available</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">No thumbnail available</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ) : (
                      <div className="h-12 w-16 shrink-0 rounded-sm border bg-muted/30 grid place-items-center">
                        <CatIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 grow">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {(() => {
                          const typeDisplay = EVENT_TYPE_DISPLAY_MAP[evt.eventType as EventType] || evt.eventType;
                          const subtypeDisplay = evt.eventSubtype ? (EVENT_SUBTYPE_DISPLAY_MAP[evt.eventSubtype as EventSubtype] ?? evt.eventSubtype) : null;
                          return (
                            <>
                              <span className="truncate text-sm font-medium">{typeDisplay}</span>
                              {subtypeDisplay ? (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{subtypeDisplay}</Badge>
                              ) : null}
                            </>
                          );
                        })()}
                        {evt.displayState && StateIcon ? (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] inline-flex items-center gap-1">
                            {React.createElement(StateIcon, { className: `h-3 w-3 ${stateColorClass}` })}
                            {evt.displayState}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground truncate">{timeText}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
        <DialogContent className="max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          {selectedEvent ? (
            <EventDetailDialogContent event={selectedEvent} events={deviceEvents} asContent />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FloorPlanDeviceEventsTab;


