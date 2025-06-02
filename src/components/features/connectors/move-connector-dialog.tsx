'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowRightLeft, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConnectorWithConfig } from '@/types';
import { ConnectorIcon } from './connector-icon';
import { formatConnectorCategory } from '@/lib/utils';

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface MoveConnectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connector: ConnectorWithConfig | null;
  currentOrganizationName: string;
  organizations: Organization[];
  onConfirm: (connectorId: string, targetOrgId: string, targetOrgName: string) => Promise<void>;
}

export function MoveConnectorDialog({ 
  open, 
  onOpenChange, 
  connector, 
  currentOrganizationName,
  organizations, 
  onConfirm 
}: MoveConnectorDialogProps) {
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);

  const handleSubmit = async () => {
    if (!connector || !selectedOrgId) return;

    const targetOrg = organizations.find(org => org.id === selectedOrgId);
    if (!targetOrg) {
      toast.error('Please select a target organization');
      return;
    }

    setIsMoving(true);
    try {
      await onConfirm(connector.id, selectedOrgId, targetOrg.name);
      onOpenChange(false);
      setSelectedOrgId('');
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsMoving(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isMoving) {
      onOpenChange(newOpen);
      if (!newOpen) {
        setSelectedOrgId('');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Move Connector
          </DialogTitle>
          <DialogDescription>
            Move this connector to a different organization. The connector will no longer be visible in the current organization.
          </DialogDescription>
        </DialogHeader>

        {connector && (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-medium">
                Connector:
              </Label>
              <div className="col-span-3 flex items-center gap-2 text-sm">
                <Tooltip>
                  <TooltipTrigger>
                    <ConnectorIcon connectorCategory={connector.category} size={16} />
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatConnectorCategory(connector.category)}
                  </TooltipContent>
                </Tooltip>
                {connector.name}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-medium">
                From:
              </Label>
              <div className="col-span-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                {currentOrganizationName}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="target-org" className="text-right font-medium">
                To:
              </Label>
              <div className="col-span-3">
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId} disabled={isMoving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {org.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => handleOpenChange(false)}
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleSubmit}
            disabled={isMoving || !selectedOrgId}
          >
            {isMoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Move Connector
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 