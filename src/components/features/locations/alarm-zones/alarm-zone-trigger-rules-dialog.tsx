'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Shield, CheckCircle, XCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from 'sonner';
import type { AlarmZone, AlarmZoneTriggerOverride, CreateTriggerOverrideData } from '@/types/index';
import { 
  EventType, 
  EventCategory, 
  EVENT_TYPE_DISPLAY_MAP, 
  EVENT_CATEGORY_DISPLAY_MAP,
  getEventsByCategory
} from '@/lib/mappings/definitions';
import { getEventCategoryIcon } from '@/lib/mappings/presentation';
import { SIMPLE_ALARM_EVENT_TYPES } from '@/lib/alarm-event-types';
import { useFusionStore } from '@/stores/store';

// Define the predefined alarm event types by combining simple events with STATE_CHANGED
const ALARM_EVENT_TYPES = [
  EventType.STATE_CHANGED,
  ...SIMPLE_ALARM_EVENT_TYPES,
  EventType.DOOR_HELD_OPEN,
] as const;

// Type-safe helper to check if an event type is in the standard alarm events list
const isStandardAlarmEvent = (eventType: string): boolean => {
  return ALARM_EVENT_TYPES.includes(eventType as EventType);
};

interface AlarmZoneTriggerRulesDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  zone: AlarmZone | null;
}

export const AlarmZoneTriggerRulesDialog: React.FC<AlarmZoneTriggerRulesDialogProps> = ({
  isOpen,
  onOpenChange,
  zone
}) => {
  const [triggerBehavior, setTriggerBehavior] = useState<'standard' | 'custom'>('standard');
  const [customTriggerRules, setCustomTriggerRules] = useState<Partial<Record<EventType, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCustomRules, setIsLoadingCustomRules] = useState(false);

  // Get store actions
  const { updateAlarmZone, fetchAlarmZoneTriggerOverrides, saveAlarmZoneTriggerOverrides } = useFusionStore();

  // Reset state when dialog opens/closes or zone changes
  useEffect(() => {
    const loadTriggerRules = async () => {
      if (isOpen && zone) {
        setTriggerBehavior(zone.triggerBehavior || 'standard');
        
        // Load custom trigger rules from API if zone uses custom behavior
        if (zone.triggerBehavior === 'custom') {
          setIsLoadingCustomRules(true);
          try {
            const overrides = await fetchAlarmZoneTriggerOverrides(zone.id);
            const rulesMap = {} as Record<EventType, boolean>;
            // Start with standard alarm events as the base
            Object.values(EventType).forEach(eventType => {
              rulesMap[eventType] = isStandardAlarmEvent(eventType);
            });
            // Apply custom overrides
            overrides.forEach((override: AlarmZoneTriggerOverride) => {
              rulesMap[override.eventType as EventType] = override.shouldTrigger;
            });
            setCustomTriggerRules(rulesMap);
          } catch (error) {
            console.error('Error loading custom trigger rules:', error);
            toast.error('Failed to load custom trigger rules');
                      // Fallback to standard rules
          const initialRules = {} as Record<EventType, boolean>;
          Object.values(EventType).forEach(eventType => {
            initialRules[eventType] = isStandardAlarmEvent(eventType);
          });
            setCustomTriggerRules(initialRules);
          } finally {
            setIsLoadingCustomRules(false);
          }
        } else {
          // For standard zones, initialize with standard alarm events enabled
          setIsLoadingCustomRules(false);
          const initialRules = {} as Record<EventType, boolean>;
          Object.values(EventType).forEach(eventType => {
            initialRules[eventType] = isStandardAlarmEvent(eventType);
          });
          setCustomTriggerRules(initialRules);
        }
      }
    };

    loadTriggerRules();
  }, [isOpen, zone, fetchAlarmZoneTriggerOverrides]);

  const handleSubmit = async () => {
    if (!zone) return;

    setIsSubmitting(true);
    try {
      // First, update the zone's trigger behavior
      const result = await updateAlarmZone(zone.id, {
        triggerBehavior: triggerBehavior
      });
      
      if (!result) {
        throw new Error('Failed to update trigger behavior');
      }

      // If using custom behavior, save the custom rules
      if (triggerBehavior === 'custom') {
        const overrides: CreateTriggerOverrideData[] = Object.entries(customTriggerRules)
          .filter(([eventType, enabled]) => enabled !== isStandardAlarmEvent(eventType))
          .map(([eventType, shouldTrigger]): CreateTriggerOverrideData => ({
            eventType,
            shouldTrigger: shouldTrigger as boolean
          }));

        const rulesResult = await saveAlarmZoneTriggerOverrides(zone.id, overrides);
        if (!rulesResult) {
          throw new Error('Failed to save custom trigger rules');
        }
      }
      
      toast.success('Trigger rules updated successfully!');
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating trigger rules:', error);
      toast.error('An error occurred while updating trigger rules');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomRuleToggle = (eventType: EventType, enabled: boolean) => {
    setCustomTriggerRules(prev => ({
      ...prev,
      [eventType]: enabled
    }));
  };

  if (!zone) {
    return null;
  }

  // Check for changes in trigger behavior
  const behaviorChanged = triggerBehavior !== zone.triggerBehavior;
  
  // Check for changes in custom rules (only relevant if using custom behavior)
  const customRulesChanged = triggerBehavior === 'custom' && Object.entries(customTriggerRules)
    .some(([eventType, enabled]) => enabled !== isStandardAlarmEvent(eventType));
  
  const hasChanges = behaviorChanged || customRulesChanged;
  
  const enabledStandardRules = ALARM_EVENT_TYPES.filter(eventType => 
    triggerBehavior === 'standard' || customTriggerRules[eventType]
  );
  
  // Calculate customization stats for custom zones
  const customizationStats = triggerBehavior === 'custom' ? Object.entries(customTriggerRules)
    .map(([eventType, enabled]) => ({
      eventType,
      enabled,
      isStandardValue: isStandardAlarmEvent(eventType),
      isCustomized: enabled !== isStandardAlarmEvent(eventType)
    }))
    .filter(stat => stat.isCustomized) : [];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Trigger Rules for &quot;{zone.name}&quot;
          </DialogTitle>
          <DialogDescription>
            Configure which events will trigger this alarm zone. Armed zones evaluate triggers, disarmed zones ignore all events.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Trigger Behavior Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trigger Behavior</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={triggerBehavior}
                onValueChange={(value) => setTriggerBehavior(value as 'standard' | 'custom')}
                className="space-y-3"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="standard" id="standard-triggers" />
                  <Label htmlFor="standard-triggers" className="cursor-pointer">
                    <div>
                      <div className="font-medium">Standard (Recommended)</div>
                      <div className="text-sm text-muted-foreground">
                        Use predefined security event types for triggering
                      </div>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom-triggers" />
                  <Label htmlFor="custom-triggers" className="cursor-pointer">
                    <div>
                      <div className="font-medium">Custom</div>
                      <div className="text-sm text-muted-foreground">
                        Configure specific event types for this zone
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Event Types Display */}
          <Card className="flex-1 min-h-0">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Event Types
                <div className="flex items-center gap-2 ml-auto">
                  <Badge variant="outline">
                    {enabledStandardRules.length} enabled
                  </Badge>
                  {triggerBehavior === 'custom' && customizationStats.length > 0 && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {customizationStats.length} customized
                    </Badge>
                  )}
                </div>
              </CardTitle>
              {triggerBehavior === 'custom' && customizationStats.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Rules with blue borders have been customized from standard behavior
                </p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px] px-4 pb-4 pt-2">
                {isLoadingCustomRules ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-3">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading custom trigger rules...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(getEventsByCategory()).map(([category, eventTypes]) => {
                      const eventCategory = category as EventCategory;
                      const CategoryIcon = getEventCategoryIcon(eventCategory);
                      
                      return (
                        <div key={category}>
                          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                            <CategoryIcon className="h-3.5 w-3.5" />
                            {EVENT_CATEGORY_DISPLAY_MAP[eventCategory]}
                          </h4>
                          <div className="space-y-2">
                                                        {eventTypes.map(eventType => {
                              const isEnabled = triggerBehavior === 'standard' 
                                ? isStandardAlarmEvent(eventType)
                                : customTriggerRules[eventType];
                              const isReadonly = triggerBehavior === 'standard';
                              
                              // For custom zones, determine if this rule differs from standard behavior
                              const isStandardValue = isStandardAlarmEvent(eventType);
                              const isCustomized = triggerBehavior === 'custom' && isEnabled !== isStandardValue;
                              
                              return (
                                <div
                                  key={eventType}
                                  className={cn(
                                    "flex items-center justify-between p-3 border rounded-lg",
                                    // Standard styling for enabled/disabled
                                    isEnabled && !isCustomized && "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
                                    !isEnabled && !isCustomized && "bg-muted/25",
                                    // Subtle styling for customized rules - just different colors, same border weight
                                    isCustomized && isEnabled && "bg-blue-50 border-blue-300 dark:bg-blue-950/30 dark:border-blue-600",
                                    isCustomized && !isEnabled && "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-700"
                                  )}
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {isEnabled ? (
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">
                                          {EVENT_TYPE_DISPLAY_MAP[eventType]}
                                        </span>
                                        {isCustomized && (
                                          <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                            Customized
                                          </Badge>
                                        )}
                                      </div>
                                      {eventType === EventType.STATE_CHANGED && (
                                        <span className="text-xs text-muted-foreground">
                                          Motion detected, doors/windows opened, vibration detected
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {triggerBehavior === 'custom' && (
                                    <Switch
                                      checked={customTriggerRules[eventType] || false}
                                      onCheckedChange={(checked) => handleCustomRuleToggle(eventType, checked)}
                                      className="ml-3"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {category !== EventCategory.UNKNOWN && <Separator className="mt-3" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Information Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Standard behavior</strong> uses predefined security events and is recommended for most zones.
              <strong> Custom behavior</strong> allows fine-tuned control but requires careful configuration.
              {triggerBehavior === 'custom' && (
                <>
                  <br />
                  <span className="text-blue-600 dark:text-blue-400">
                    Rules with blue borders and &quot;Customized&quot; badges differ from standard behavior.
                  </span>
                </>
              )}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !hasChanges || isLoadingCustomRules}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 