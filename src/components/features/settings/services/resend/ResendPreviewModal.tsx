'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface ResendPreviewModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  html: string | null;
  text?: string | null;
}

export function ResendPreviewModal({ isOpen, onOpenChange, html, text }: ResendPreviewModalProps) {
  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {}
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Email Preview</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="preview">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <div className="border rounded-md overflow-hidden">
              <iframe
                title="Email Preview"
                sandbox="allow-same-origin"
                className="w-full h-[600px]"
                srcDoc={html || '<!doctype html><html><body><p style="font-family: sans-serif; color: #6B7280; padding: 16px;">No preview available.</p></body></html>'}
              />
            </div>
          </TabsContent>
          <TabsContent value="html">
            <div className="flex items-center justify-end mb-2">
              <Button variant="outline" size="sm" onClick={() => handleCopy(html || '')} disabled={!html}>Copy HTML</Button>
            </div>
            <div className="border rounded-md overflow-auto max-h-[600px]">
              <pre className="whitespace-pre-wrap break-words p-4 text-xs">{html || 'No HTML available.'}</pre>
            </div>
          </TabsContent>
          <TabsContent value="text">
            <div className="flex items-center justify-end mb-2">
              <Button variant="outline" size="sm" onClick={() => handleCopy(text || '')} disabled={!text}>Copy Text</Button>
            </div>
            <div className="border rounded-md overflow-auto max-h-[600px]">
              <pre className="whitespace-pre-wrap break-words p-4 text-sm">{text || 'No text available.'}</pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default ResendPreviewModal;


