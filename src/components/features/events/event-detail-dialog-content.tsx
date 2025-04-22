import React, { useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, EyeIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from 'sonner';
import { getDeviceTypeIcon } from '@/lib/device-mapping';
import { TypedDeviceInfo } from '@/types/device-mapping'; // Assuming Event type includes this
import { cn, formatConnectorCategory } from "@/lib/utils";

// Interface matching the event data structure passed from the events page
interface EventData {
  event: string;
  time: number;
  msgid: string;
  data: Record<string, unknown>;
  payload?: Record<string, unknown>;
  deviceId: string;
  deviceName?: string;
  connectorName?: string;
  deviceTypeInfo: TypedDeviceInfo;
  connectorCategory: string;
}

interface EventDetailDialogContentProps {
  event: EventData;
}

// Define DetailRow component locally for now
const DetailRow = ({label, value, monospace = false, breakAll = false}: {label: string, value: React.ReactNode, monospace?: boolean, breakAll?: boolean}) => (
  <div className="flex flex-row py-1.5 border-b border-muted/40 last:border-0">
    <div className="w-1/3 font-medium text-muted-foreground pl-2">{label}</div>
    <div className={cn("w-2/3 pr-2",
      monospace && "font-mono text-xs",
      breakAll && "break-all"
    )}>
      {value}
    </div>
  </div>
);

export const EventDetailDialogContent: React.FC<EventDetailDialogContentProps> = ({ event }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success("Copied JSON to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      toast.error("Failed to copy JSON.");
    }
  };

  const eventData = event.payload || event.data || {};
  const jsonString = JSON.stringify(eventData, null, 2);

  // Get mapped type info for the modal
  const deviceName = event.deviceName || event.deviceId || 'Unknown Device';
  const typeInfo = event.deviceTypeInfo;
  const DeviceIcon = getDeviceTypeIcon(typeInfo.type);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <EyeIcon className="h-4 w-4" />
           <span className="sr-only">View Event Details</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <DeviceIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <DialogTitle>{event.event}</DialogTitle>
          </div>
          <DialogDescription className="pt-1 text-sm flex items-center gap-1.5">
             <span>
               {typeInfo.type}
             </span>
             <span className="text-muted-foreground">·</span>
             <span>{formatConnectorCategory(event.connectorCategory)}</span>
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Key Details</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <div className="max-h-96 overflow-y-auto rounded-md border p-0 text-sm">
              {
                (() => {
                  const deviceName = event.deviceName || event.deviceId || 'Unknown Device';
                  const typeInfo = event.deviceTypeInfo;
                  const DeviceIcon = getDeviceTypeIcon(typeInfo.type);
                  const eventData = event.payload || event.data || {};

                  // Prepare entries for the Device Information section
                  const deviceInfoEntries: { key: string, value: React.ReactNode }[] = [
                    { key: 'Device Name', value: deviceName },
                    {
                      key: 'Device Type',
                      value: (
                        <div className="flex items-center gap-1.5">
                          <DeviceIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span>
                            {typeInfo.type}
                          </span>
                        </div>
                      )
                    },
                  ];

                  // Extract non-object payload entries for Event Data section
                  let payloadEntries: { key: string, value: unknown }[] = [];
                  if (eventData && typeof eventData === 'object') {
                    payloadEntries = Object.entries(eventData)
                      .filter(([, value]) => typeof value !== 'object' && value !== null && value !== undefined)
                      .map(([key, value]) => ({ key, value }));
                  }

                  // Check if there's nothing to display
                  if (deviceInfoEntries.length === 0 && payloadEntries.length === 0) {
                    return <p className="p-4 text-muted-foreground">No details available.</p>; // Add padding back if empty
                  }

                  // Render using DetailRow
                  return (
                    <div className="flex flex-col"> {/* Main container */}
                      {/* Device Info Section */}
                      {deviceInfoEntries.length > 0 && (
                        <>
                          <div className="py-2"> {/* Section header */} 
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-medium text-muted-foreground pl-2">DEVICE INFORMATION</span>
                              <div className="h-px grow bg-border"></div>
                            </div>
                          </div>
                          {deviceInfoEntries.map(({ key, value }) => (
                            <DetailRow key={key} label={key} value={value} />
                          ))}
                        </>
                      )}

                      {/* Event Data Section */}
                      {payloadEntries.length > 0 && (
                        <>
                          <div className="py-2"> {/* Section header */} 
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-medium text-muted-foreground pl-2">EVENT DATA</span>
                              <div className="h-px grow bg-border"></div>
                            </div>
                          </div>
                          {payloadEntries.map(({ key, value }) => (
                            <DetailRow 
                              key={key} 
                              label={key.charAt(0).toUpperCase() + key.slice(1)} // Capitalize key
                              value={String(value)} 
                            />
                          ))}
                        </>
                      )}
                    </div>
                  );
                })()
              }
            </div>
          </TabsContent>

          <TabsContent value="raw" className="mt-4">
             <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 h-7 w-7 z-50"
                onClick={() => handleCopy(jsonString)}
                disabled={isCopied}
              >
                {isCopied ?
                  <Check className="h-4 w-4 text-green-500" /> :
                  <Copy className="h-4 w-4 text-neutral-400" />
                }
                <span className="sr-only">{isCopied ? 'Copied' : 'Copy JSON'}</span>
              </Button>
              <SyntaxHighlighter
                language="json"
                style={atomDark}
                customStyle={{
                  maxHeight: '24rem',
                  overflowY: 'auto',
                  borderRadius: '6px',
                  fontSize: '13px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}
              >
                {jsonString}
              </SyntaxHighlighter>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter className="pt-4 border-t mt-4">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 