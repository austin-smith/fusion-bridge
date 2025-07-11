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
import { Settings, Shield, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from 'sonner';
import type { AlarmZone } from '@/types/index';
import { EventType } from '@/lib/mappings/definitions';
import { useFusionStore } from '@/stores/store';

// Define the predefined alarm event types as mentioned in the plan
const ALARM_EVENT_TYPES = [
  EventType.STATE_CHANGED,
  EventType.DOOR_FORCED_OPEN,
  EventType.DOOR_HELD_OPEN,
  EventType.ACCESS_DENIED,
  EventType.INTRUSION,
  EventType.ARMED_PERSON,
  EventType.TAILGATING,
  EventType.LOITERING,
  EventType.OBJECT_REMOVED,
  EventType.MOTION_DETECTED,
] as const;

// Get human-readable names for event types
const EVENT_TYPE_NAMES: Record<EventType, string> = {
  [EventType.STATE_CHANGED]: 'State Changed',
  [EventType.BATTERY_LEVEL_CHANGED]: 'Battery Level Changed',
  [EventType.BUTTON_PRESSED]: 'Button Pressed',
  [EventType.BUTTON_LONG_PRESSED]: 'Button Long Pressed',
  [EventType.ACCESS_GRANTED]: 'Access Granted',
  [EventType.ACCESS_DENIED]: 'Access Denied',
  [EventType.DOOR_HELD_OPEN]: 'Door Held Open',
  [EventType.DOOR_FORCED_OPEN]: 'Door Forced Open',
  [EventType.EXIT_REQUEST]: 'Exit Request',
  [EventType.ANALYTICS_EVENT]: 'Analytics Event',
  [EventType.OBJECT_DETECTED]: 'Object Detected',
  [EventType.OBJECT_REMOVED]: 'Object Removed',
  [EventType.MOTION_DETECTED]: 'Motion Detected',
  [EventType.LOITERING]: 'Loitering',
  [EventType.LINE_CROSSING]: 'Line Crossing',
  [EventType.ARMED_PERSON]: 'Armed Person',
  [EventType.TAILGATING]: 'Tailgating',
  [EventType.INTRUSION]: 'Intrusion Detected',
  [EventType.DEVICE_CHECK_IN]: 'Device Check-in',
  [EventType.POWER_CHECK_IN]: 'Power Check-in',
  [EventType.UNKNOWN_EXTERNAL_EVENT]: 'Unknown Event',
  [EventType.SYSTEM_NOTIFICATION]: 'System Notification',
};

// Get event type descriptions
const EVENT_TYPE_DESCRIPTIONS: Record<EventType, string> = {
  [EventType.STATE_CHANGED]: 'Device state changes (open/closed, on/off, etc.)',
  [EventType.BATTERY_LEVEL_CHANGED]: 'Device battery level changed',
  [EventType.BUTTON_PRESSED]: 'Button pressed on device or smart fob',
  [EventType.BUTTON_LONG_PRESSED]: 'Button held down for extended period',
  [EventType.ACCESS_GRANTED]: 'Successful authentication and access granted',
  [EventType.ACCESS_DENIED]: 'Failed authentication attempts',
  [EventType.DOOR_HELD_OPEN]: 'Door left open longer than expected',
  [EventType.DOOR_FORCED_OPEN]: 'Door opened without proper authorization',
  [EventType.EXIT_REQUEST]: 'Exit request from inside secured zone',
  [EventType.ANALYTICS_EVENT]: 'General analytics event from video analysis',
  [EventType.OBJECT_DETECTED]: 'Object detected by analytics system',
  [EventType.OBJECT_REMOVED]: 'Protected item taken without authorization',
  [EventType.MOTION_DETECTED]: 'Motion detected by camera analytics',
  [EventType.LOITERING]: 'Suspicious lingering in monitored zones',
  [EventType.LINE_CROSSING]: 'Unauthorized crossing of defined boundaries',
  [EventType.ARMED_PERSON]: 'Weapon or threat detected',
  [EventType.TAILGATING]: 'Unauthorized person following authorized entry',
  [EventType.INTRUSION]: 'Motion or presence detected in secure zones',
  [EventType.DEVICE_CHECK_IN]: 'Device reporting status or heartbeat',
  [EventType.POWER_CHECK_IN]: 'Device power status reporting',
  [EventType.UNKNOWN_EXTERNAL_EVENT]: 'Unclassified or unrecognized events',
  [EventType.SYSTEM_NOTIFICATION]: 'System-generated notification or alert',
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

  // Get store action
  const { updateAlarmZone } = useFusionStore();

  // Reset state when dialog opens/closes or zone changes
  useEffect(() => {
    if (isOpen && zone) {
      setTriggerBehavior(zone.triggerBehavior || 'standard');
      // TODO: Load custom trigger rules from zone.triggerRules or API
      // For now, initialize with standard alarm events enabled
      const initialRules = {} as Record<EventType, boolean>;
      Object.values(EventType).forEach(eventType => {
        initialRules[eventType] = ALARM_EVENT_TYPES.includes(eventType as any);
      });
      setCustomTriggerRules(initialRules);
    }
  }, [isOpen, zone]);

  const handleSubmit = async () => {
    if (!zone) return;

    setIsSubmitting(true);
    try {
      const result = await updateAlarmZone(zone.id, {
        triggerBehavior: triggerBehavior
      });
      
      if (result) {
        toast.success('Trigger rules updated successfully!');
        onOpenChange(false);
      } else {
        toast.error('Failed to update trigger rules');
      }
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

  const hasChanges = triggerBehavior !== zone.triggerBehavior;
  const enabledStandardRules = ALARM_EVENT_TYPES.filter(eventType => 
    triggerBehavior === 'standard' || customTriggerRules[eventType]
  );

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
                <Badge variant="outline" className="ml-auto">
                  {enabledStandardRules.length} enabled
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px] p-4">
                <div className="space-y-3">
                  {/* Standard/Security Events */}
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      Security Events
                    </h4>
                    <div className="space-y-2">
                      {ALARM_EVENT_TYPES.map(eventType => {
                        const isEnabled = triggerBehavior === 'standard' || customTriggerRules[eventType];
                        const isReadonly = triggerBehavior === 'standard';
                        
                        return (
                          <div
                            key={eventType}
                            className={cn(
                              "flex items-center justify-between p-3 border rounded-lg",
                              isEnabled && "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
                              !isEnabled && "bg-muted/25"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {isEnabled ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-medium text-sm">
                                  {EVENT_TYPE_NAMES[eventType]}
                                </span>
                                {isReadonly && isEnabled && (
                                  <Badge variant="outline" className="text-xs">
                                    Standard
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {EVENT_TYPE_DESCRIPTIONS[eventType]}
                              </p>
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
                  </div>

                  <Separator />

                  {/* Other Events */}
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Info className="h-3.5 w-3.5 text-blue-500" />
                      Other Events
                    </h4>
                    <div className="space-y-2">
                      {Object.values(EventType)
                        .filter(eventType => !ALARM_EVENT_TYPES.includes(eventType as any))
                        .map(eventType => {
                          const isEnabled = triggerBehavior === 'custom' && customTriggerRules[eventType];
                          
                          return (
                            <div
                              key={eventType}
                              className={cn(
                                "flex items-center justify-between p-3 border rounded-lg",
                                isEnabled && "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
                                !isEnabled && "bg-muted/25"
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {isEnabled ? (
                                    <CheckCircle className="h-4 w-4 text-blue-600" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <span className="font-medium text-sm">
                                    {EVENT_TYPE_NAMES[eventType]}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {EVENT_TYPE_DESCRIPTIONS[eventType]}
                                </p>
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
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Information Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Standard behavior</strong> uses predefined security events and is recommended for most zones.
              <strong> Custom behavior</strong> allows fine-tuned control but requires careful configuration.
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
            disabled={isSubmitting || !hasChanges}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 