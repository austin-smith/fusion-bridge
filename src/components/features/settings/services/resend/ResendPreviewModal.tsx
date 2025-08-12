'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ResendPreviewModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRecipientEmail?: string;
}

export function ResendPreviewModal({ isOpen, onOpenChange }: ResendPreviewModalProps) {
  const [template, setTemplate] = useState<'test' | 'verification'>('test');
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {}
  };

  const fetchPreview = async (tpl: 'test' | 'verification') => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('template', tpl);
      const res = await fetch(`/api/services/resend/preview?${params.toString()}`, { method: 'GET' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to load preview');
      }
      const json = await res.json();
      setHtml(json.html || null);
      setText(json.text || null);
    } catch (e) {
      setHtml(null);
      setText(String((e as any)?.message || e) || '');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTemplate('test');
          setLoading(true);
          setHtml(null);
          setText(null);
          void fetchPreview('test');
        }}
      >
        <DialogHeader>
          <DialogTitle>Email Preview</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-2 mb-4">
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Template</label>
            <Select
              value={template}
              onValueChange={(v: 'test' | 'verification') => {
                setTemplate(v);
                setLoading(true);
                void fetchPreview(v);
              }}
            >
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test Email</SelectItem>
                <SelectItem value="verification">Verification Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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
                srcDoc={
                  loading
                    ? '<!doctype html><html><body><p style="font-family: sans-serif; color: #6B7280; padding: 16px;">Loading…</p></body></html>'
                    : (html || '<!doctype html><html><body><p style="font-family: sans-serif; color: #6B7280; padding: 16px;">No preview available.</p></body></html>')
                }
              />
            </div>
          </TabsContent>
          <TabsContent value="html">
            <div className="flex items-center justify-end mb-2">
              <Button variant="outline" size="sm" onClick={() => handleCopy(html || '')} disabled={!html}>Copy HTML</Button>
            </div>
            <div className="border rounded-md overflow-auto max-h-[600px]">
              <pre className="whitespace-pre-wrap break-words p-4 text-xs">{loading ? 'Loading…' : (html || 'No HTML available.')}</pre>
            </div>
          </TabsContent>
          <TabsContent value="text">
            <div className="flex items-center justify-end mb-2">
              <Button variant="outline" size="sm" onClick={() => handleCopy(text || '')} disabled={!text}>Copy Text</Button>
            </div>
            <div className="border rounded-md overflow-auto max-h-[600px]">
              <pre className="whitespace-pre-wrap break-words p-4 text-sm">{loading ? 'Loading…' : (text || 'No text available.')}</pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default ResendPreviewModal;


