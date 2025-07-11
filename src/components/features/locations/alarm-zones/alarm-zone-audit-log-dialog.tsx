'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Shield, User, Clock, AlertTriangle, CheckCircle, XCircle, Info, RefreshCw, Calendar } from 'lucide-react';
import { cn } from "@/lib/utils";
import type { AlarmZone } from '@/types/index';
import { ArmedState, ArmedStateDisplayNames } from '@/lib/mappings/definitions';

// Define audit log entry interface
interface AuditLogEntry {
  id: string;
  zoneId: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: 'armed' | 'disarmed' | 'triggered' | 'acknowledged';
  previousState: ArmedState;
  newState: ArmedState;
  reason: string;
  triggerEventId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

// Mock audit log data for demonstration
const mockAuditLogs: AuditLogEntry[] = [
  {
    id: '1',
    zoneId: 'zone-1',
    userId: 'user-1',
    userName: 'John Smith',
    userEmail: 'john.smith@example.com',
    action: 'triggered',
    previousState: ArmedState.ARMED,
    newState: ArmedState.TRIGGERED,
    reason: 'security_event',
    triggerEventId: 'event-123',
    metadata: {
      ipAddress: '192.168.1.100',
      deviceName: 'Front Door Sensor',
      eventType: 'DOOR_FORCED_OPEN'
    },
    createdAt: '2024-01-15T14:30:00Z'
  },
  {
    id: '2',
    zoneId: 'zone-1',
    userId: 'user-2',
    userName: 'Sarah Johnson',
    userEmail: 'sarah.johnson@example.com',
    action: 'disarmed',
    previousState: ArmedState.TRIGGERED,
    newState: ArmedState.DISARMED,
    reason: 'manual',
    metadata: {
      ipAddress: '192.168.1.101',
      location: 'Management Office'
    },
    createdAt: '2024-01-15T14:25:00Z'
  },
  {
    id: '3',
    zoneId: 'zone-1',
    userId: 'user-1',
    userName: 'John Smith',
    userEmail: 'john.smith@example.com',
    action: 'armed',
    previousState: ArmedState.DISARMED,
    newState: ArmedState.ARMED,
    reason: 'scheduled',
    metadata: {
      ipAddress: '192.168.1.100',
      scheduleId: 'schedule-456',
      scheduleName: 'Evening Security'
    },
    createdAt: '2024-01-15T18:00:00Z'
  },
  {
    id: '4',
    zoneId: 'zone-1',
    userId: 'user-3',
    userName: 'Mike Davis',
    userEmail: 'mike.davis@example.com',
    action: 'disarmed',
    previousState: ArmedState.ARMED,
    newState: ArmedState.DISARMED,
    reason: 'automation',
    metadata: {
      automationId: 'automation-789',
      automationName: 'Morning Disarm'
    },
    createdAt: '2024-01-16T08:00:00Z'
  },
];

interface AlarmZoneAuditLogDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  zone: AlarmZone | null;
}

export const AlarmZoneAuditLogDialog: React.FC<AlarmZoneAuditLogDialogProps> = ({
  isOpen,
  onOpenChange,
  zone
}) => {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/alarm-zones/${zone.id}/audit-log`);
      // const data = await response.json();
      // setAuditLogs(data.logs || []);
      
      // For now, use mock data
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate loading
      const zoneAuditLogs = mockAuditLogs.filter(log => log.zoneId === zone?.id);
      setAuditLogs(zoneAuditLogs);
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setError('Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [zone]);

  // Load audit logs when dialog opens
  useEffect(() => {
    if (isOpen && zone) {
      loadAuditLogs();
    }
  }, [isOpen, zone, loadAuditLogs]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'armed':
        return <Shield className="h-4 w-4 text-green-600" />;
      case 'disarmed':
        return <XCircle className="h-4 w-4 text-gray-600" />;
      case 'triggered':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'acknowledged':
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      default:
        return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'armed':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'disarmed':
        return 'text-gray-700 bg-gray-50 border-gray-200';
      case 'triggered':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'acknowledged':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getReasonDisplayName = (reason: string) => {
    switch (reason) {
      case 'manual':
        return 'Manual Action';
      case 'scheduled':
        return 'Scheduled Action';
      case 'automation':
        return 'Automation';
      case 'security_event':
        return 'Security Event';
      default:
        return 'Unknown';
    }
  };

  if (!zone) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Audit Log for &quot;{zone.name}&quot;
          </DialogTitle>
          <DialogDescription>
            View the complete history of all state changes for this alarm zone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {auditLogs.length} {auditLogs.length === 1 ? 'entry' : 'entries'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Showing all audit log entries
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadAuditLogs}
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <ScrollArea className="flex-1 border rounded-lg">
          <div className="p-4">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="h-4 w-4 bg-muted rounded" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Audit Logs</h3>
                <p className="text-muted-foreground">
                  This alarm zone has no recorded state changes yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {auditLogs.map((log, index) => (
                  <Card key={log.id} className={cn(
                    "border-l-4",
                    log.action === 'triggered' && "border-l-red-500",
                    log.action === 'armed' && "border-l-green-500",
                    log.action === 'disarmed' && "border-l-gray-500",
                    log.action === 'acknowledged' && "border-l-blue-500"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {getActionIcon(log.action)}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm capitalize">
                              {log.action}
                            </span>
                            <Badge variant="outline" className={getActionColor(log.action)}>
                              {ArmedStateDisplayNames[log.previousState]} → {ArmedStateDisplayNames[log.newState]}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>{log.userName}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatDate(log.createdAt)}</span>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {getReasonDisplayName(log.reason)}
                            </Badge>
                          </div>
                          
                          {log.metadata && (
                            <div className="space-y-1 text-xs">
                              {log.metadata.deviceName && (
                                <div className="text-muted-foreground">
                                  <span className="font-medium">Device:</span> {log.metadata.deviceName}
                                </div>
                              )}
                              {log.metadata.eventType && (
                                <div className="text-muted-foreground">
                                  <span className="font-medium">Event Type:</span> {log.metadata.eventType}
                                </div>
                              )}
                              {log.metadata.scheduleName && (
                                <div className="text-muted-foreground">
                                  <span className="font-medium">Schedule:</span> {log.metadata.scheduleName}
                                </div>
                              )}
                              {log.metadata.automationName && (
                                <div className="text-muted-foreground">
                                  <span className="font-medium">Automation:</span> {log.metadata.automationName}
                                </div>
                              )}
                              {log.metadata.ipAddress && (
                                <div className="text-muted-foreground">
                                  <span className="font-medium">IP Address:</span> {log.metadata.ipAddress}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                    
                    {index < auditLogs.length - 1 && (
                      <Separator className="my-0" />
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 