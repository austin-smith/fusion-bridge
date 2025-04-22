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
import { cn } from "@/lib/utils";

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
}

interface EventDetailDialogContentProps {
  event: EventData;
}

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
  const connectorName = event.connectorName || 'System';

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <EyeIcon className="h-4 w-4" />
           <span className="sr-only">View Event Details</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Event Data</DialogTitle>
          {/* Maybe add event type here? */}
          {/* <DialogDescription>{event.event}</DialogDescription> */}
        </DialogHeader>
        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Key Details</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <div className="max-h-96 overflow-y-auto rounded-md border p-4 text-sm">
              {
                (() => {
                  // Prepare entries for the Key Details dl list
                  const detailEntries: { key: string, value: React.ReactNode }[] = [
                    { key: 'Device Name', value: deviceName },
                    // Updated Device Type display with icon and optional subtype
                    {
                      key: 'Device Type',
                      value: (
                        <div className="flex items-center gap-1.5">
                          <DeviceIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span>
                            {typeInfo.type}
                            {typeInfo.subtype && (
                               <span className="text-muted-foreground"> / {typeInfo.subtype}</span>
                            )}
                          </span>
                        </div>
                      )
                    },
                    { key: 'Connector', value: connectorName },
                  ];

                  // Extract non-object payload entries
                  let payloadEntries: { key: string, value: unknown }[] = [];
                  if (eventData && typeof eventData === 'object') {
                    payloadEntries = Object.entries(eventData)
                      .filter(([, value]) => typeof value !== 'object' && value !== null && value !== undefined)
                      .map(([key, value]) => ({ key, value }));
                  }

                  if (detailEntries.length === 0 && payloadEntries.length === 0) {
                    return <p className="text-muted-foreground">No details available.</p>;
                  }

                  return (
                    <div className="flex flex-col gap-4">
                      {/* Device Info */}
                      {detailEntries.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold text-foreground">Device Information</h4>
                          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                            {detailEntries.map(({ key, value }) => (
                              <React.Fragment key={key}>
                                <dt className="font-medium text-muted-foreground">{key}</dt>
                                <dd className="text-foreground">{typeof value === 'string' ? value : value}</dd>
                              </React.Fragment>
                            ))}
                          </dl>
                        </div>
                      )}

                      {detailEntries.length > 0 && payloadEntries.length > 0 && <div className="border-b border-border"></div>}

                      {/* Event Data */}
                      {payloadEntries.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold text-foreground">Event Data</h4>
                          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                            {payloadEntries.map(({ key, value }) => (
                              <React.Fragment key={key}>
                                <dt className="font-medium text-muted-foreground capitalize truncate">{key}</dt>
                                <dd className="text-foreground">{String(value)}</dd>
                              </React.Fragment>
                            ))}
                          </dl>
                        </div>
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