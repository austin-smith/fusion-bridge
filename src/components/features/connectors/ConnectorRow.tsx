import React from 'react';
import { ConnectorWithConfig } from '@/types';
import { ConnectorMqttState, ConnectorPikoState, ConnectorWebhookState } from '@/stores/store'; // Assuming types exported from store
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, Trash2, Check, Copy } from "lucide-react";
import { SiMqtt } from "react-icons/si";
import { LuArrowRightLeft } from "react-icons/lu";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TableCell, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { formatConnectorCategory } from "@/lib/utils";
import { formatDistanceToNow } from 'date-fns';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// <<< Add ConnectionStatus type back >>>
type ConnectionStatus = 'connected' | 'disconnected' | 'unknown' | 'reconnecting' | 'error'; 

// Props definition
interface ConnectorRowProps {
  connector: ConnectorWithConfig;
  mqttState: ConnectorMqttState;
  pikoState: ConnectorPikoState;
  webhookState: ConnectorWebhookState;
  isToggling: boolean;
  copiedPayloadId: string | null;
  onMqttToggle: (connector: ConnectorWithConfig, currentCheckedState: boolean) => void;
  onWebSocketToggle: (connector: ConnectorWithConfig, currentCheckedState: boolean) => void;
  onEdit: (connector: ConnectorWithConfig) => void;
  onDelete: (connectorId: string) => void;
  onCopy: (text: string, id: string) => void;
}

export const ConnectorRow: React.FC<ConnectorRowProps> = ({
  connector,
  mqttState,
  pikoState,
  webhookState,
  isToggling,
  copiedPayloadId,
  onMqttToggle,
  onWebSocketToggle,
  onEdit,
  onDelete,
  onCopy,
}) => {

  // --- Helper functions (will be moved/adapted here) ---

  // Get status color class based on MQTT status
  const getStatusColorClass = (state: ConnectorMqttState, enabled: boolean): string => {
    if (!enabled) {
      return 'bg-slate-300/20 text-slate-500 border border-slate-300/20';
    }
    switch (state.status) {
      case 'connected': return 'bg-green-500/20 text-green-600 border border-green-500/20';
      case 'reconnecting': return 'bg-yellow-500/20 text-yellow-600 border border-yellow-500/20';
      case 'disconnected': return 'bg-red-500/25 text-red-600 border border-red-500/30';
      case 'error': return 'bg-red-500/25 text-red-600 border border-red-500/30';
      case 'unknown': return 'bg-slate-300/20 text-slate-500 border border-slate-300/20';
      default: return 'bg-muted text-muted-foreground border border-muted-foreground/20';
    }
  };
  
  // Get status text based on MQTT status
  const getMqttStatusText = (state: ConnectorMqttState, enabled: boolean): string => {
    if (!enabled) {
      return 'Disabled';
    }
    switch (state.status) {
      case 'connected': return 'Connected';
      case 'reconnecting': return 'Reconnecting';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Disconnected'; // Treat any error as Disconnected for display
      case 'unknown': return 'Unknown';
      default: return 'Unknown';
    }
  };

  // Get status color class based on Piko WebSocket status 
  const getPikoStatusColorClass = (state: ConnectorPikoState, enabled: boolean): string => {
    if (!enabled) {
      return 'bg-slate-300/20 text-slate-500 border border-slate-300/20';
    }
    switch (state?.status) { // Use optional chaining as state might not exist yet
      case 'connected': return 'bg-green-500/20 text-green-600 border border-green-500/20';
      case 'reconnecting': return 'bg-yellow-500/20 text-yellow-600 border border-yellow-500/20';
      case 'disconnected': return 'bg-red-500/25 text-red-600 border border-red-500/30';
      case 'error': return 'bg-red-500/25 text-red-600 border border-red-500/30';
      case 'unknown': return 'bg-slate-300/20 text-slate-500 border border-slate-300/20';
      default: return 'bg-muted text-muted-foreground border border-muted-foreground/20';
    }
  };

  const getStatusText = (status: ConnectionStatus, enabled: boolean, error: string | null = null): string => {
    if (!enabled) {
      return 'Disabled';
    }
    switch (status) {
      case 'connected': return 'Connected';
      case 'reconnecting': return 'Reconnecting';
      case 'disconnected': return 'Disconnected';
      case 'error': 
        // For display in the badge, just show "Error". Tooltip will show details.
        return 'Error'; 
      case 'unknown': return 'Unknown';
      default: return 'Unknown';
    }
  };

  // --- Popover Data Logic ---
  let lastActivityTime: number | null = null;
  let lastPayload: Record<string, any> | null = null;
  let copyIdSuffix: string = 'unknown';
  const popoverWidthClass: string = 'w-[600px]'; // Default width

  if (connector.category === 'yolink') {
    lastActivityTime = mqttState.lastActivity;
    lastPayload = mqttState.lastStandardizedPayload;
    copyIdSuffix = 'mqtt';
  } else if (connector.category === 'piko') {
    lastActivityTime = pikoState?.lastActivity;
    lastPayload = pikoState?.lastStandardizedPayload;
    copyIdSuffix = 'piko';
  } else if (connector.category === 'netbox' || connector.category === 'genea') {
    lastActivityTime = webhookState.lastActivity;
    lastPayload = null; // No standardized payload stored for simple webhook activity yet
    copyIdSuffix = 'webhook'; // Could use this if needed
  }
  // NetBox connectors don't use MQTT/WebSocket state for last activity in this context.
  const isNetBox = connector.category === 'netbox'; // <-- Check if NetBox

  const eventsEnabled = connector.eventsEnabled === true;

  // Log the connector prop just before rendering the row
  console.log(`[ConnectorRow] Rendering row for Connector ID: ${connector.id}, Category: ${connector.category}`, connector);

  // --- Render ---
  return (
    <TableRow key={connector.id}>
      <TableCell className="font-medium">{connector.name}</TableCell>
      <TableCell>
        <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
          <ConnectorIcon connectorCategory={connector.category} size={12} />
          <span className="text-xs">{formatConnectorCategory(connector.category)}</span>
        </Badge>
      </TableCell>
      <TableCell>
        {(connector.category === 'yolink' || connector.category === 'piko') ? (
          <div className="flex items-center">
            <Switch
              checked={eventsEnabled}
              onCheckedChange={() => {
                  if (connector.category === 'yolink') {
                    onMqttToggle(connector, eventsEnabled);
                  } else if (connector.category === 'piko') {
                    onWebSocketToggle(connector, eventsEnabled);
                  }
              }}
              disabled={isToggling}
            />
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {isToggling ? (
          // Common Loader for both types while toggling
          <div className="flex items-center justify-start px-2.5 py-1">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : connector.category === 'yolink' ? (
          // YoLink MQTT Status
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getStatusColorClass(mqttState, eventsEnabled)}`}>
                <SiMqtt className="h-3.5 w-3.5" />
                <span>{getStatusText(mqttState.status, eventsEnabled)}</span>
                {mqttState.status === 'reconnecting' && (
                  <Loader2 className="h-3 w-3 animate-spin ml-1" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {mqttState.status === 'error' ?
                `Error: ${mqttState.error || 'Unknown error'}` :
                getStatusText(mqttState.status, eventsEnabled)
              }
            </TooltipContent>
          </Tooltip>
        ) : connector.category === 'piko' ? (
          // Piko WebSocket Status
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getPikoStatusColorClass(pikoState, eventsEnabled)}`}>
                <LuArrowRightLeft className="h-3.5 w-3.5" /> {/* WebSocket Icon */}
                <span>{getStatusText(pikoState?.status, eventsEnabled)}</span>
                {pikoState?.status === 'reconnecting' && (
                  <Loader2 className="h-3 w-3 animate-spin ml-1" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {pikoState?.status === 'error' ?
                `Error: ${pikoState?.error || 'Unknown error'}` :
                 getStatusText(pikoState?.status, eventsEnabled)
              }
            </TooltipContent>
          </Tooltip>
        ) : (
          // Default for other types (or if state not ready)
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {/* Display lastActivityTime consistently */} 
        {lastActivityTime ? (
          <Popover>
            <PopoverTrigger asChild>
              <span className="cursor-pointer hover:text-foreground underline decoration-dashed underline-offset-2 decoration-muted-foreground/50 hover:decoration-foreground/50">
                  {formatDistanceToNow(new Date(lastActivityTime), { addSuffix: true })}
              </span>
            </PopoverTrigger>
            {/* Keep Popover only if there might be payload data */}
            {(connector.category === 'yolink' || connector.category === 'piko') && lastPayload && (
              <PopoverContent className={`${popoverWidthClass} max-h-[600px] overflow-y-auto p-0`}>
                <div className="text-sm font-semibold mb-2 pt-3 px-3">Last Event Payload</div> {/* Standardized Heading */}
                <div className="relative">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-1 right-1 h-7 w-7 z-50 bg-slate-800/70 hover:bg-slate-700/80"
                    onClick={() => onCopy(JSON.stringify(lastPayload, null, 2), `${connector.id}-${copyIdSuffix}`)}
                    disabled={copiedPayloadId === `${connector.id}-${copyIdSuffix}`}
                  >
                    {copiedPayloadId === `${connector.id}-${copyIdSuffix}` ?
                      <Check className="h-4 w-4 text-green-400" /> :
                      <Copy className="h-4 w-4 text-neutral-400" />
                    }
                    <span className="sr-only">{copiedPayloadId === `${connector.id}-${copyIdSuffix}` ? 'Copied' : 'Copy JSON'}</span>
                  </Button>
                  <SyntaxHighlighter
                    language="json"
                    style={atomDark}
                    customStyle={{
                      maxHeight: '50rem',
                      overflowY: 'auto',
                      borderRadius: '0px',
                      fontSize: '13px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: '0',
                      padding: '12px'
                    }}
                  >
                    {JSON.stringify(lastPayload, null, 2)}
                  </SyntaxHighlighter>
                </div>
              </PopoverContent>
            )}
            {/* Add simple tooltip for webhook timestamps */} 
            {(connector.category === 'netbox' || connector.category === 'genea') && (
                <Tooltip>
                  <TooltipTrigger asChild><span></span></TooltipTrigger> {/* Dummy trigger */} 
                  <TooltipContent>
                    Last Webhook: {new Date(lastActivityTime).toLocaleString()}
                  </TooltipContent>
                </Tooltip>
            )}
          </Popover>
        ) : (
          '-' // Display dash if no activity time
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end space-x-2">
          <Tooltip>
            <TooltipTrigger asChild>
               <Button variant="ghost" size="icon" onClick={() => onEdit(connector)}>
                 <Pencil className="h-4 w-4" />
                 <span className="sr-only">Edit connector</span>
               </Button>
            </TooltipTrigger>
            <TooltipContent>Edit connector</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => onDelete(connector.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete connector</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete connector</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}; 