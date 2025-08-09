'use client';

import React, { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2, Upload, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FloorPlan } from '@/types';

interface FloorPlanTabsProps {
  floorPlans: FloorPlan[];
  activeFloorPlanId: string | null;
  onFloorPlanSelect: (id: string) => void;
  onFloorPlanUpdate: (id: string, name?: string, file?: File) => Promise<void>;
  onFloorPlanDelete: (id: string) => Promise<void>;
  isLoading?: boolean;
  onReplaceRequest?: (id: string) => void;
  onCreateRequest?: () => void;
}

export function FloorPlanTabs({
  floorPlans,
  activeFloorPlanId,
  onFloorPlanSelect,
  onFloorPlanUpdate,
  onFloorPlanDelete,
  isLoading = false,
  onReplaceRequest,
  onCreateRequest
}: FloorPlanTabsProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [floorPlanToDelete, setFloorPlanToDelete] = useState<FloorPlan | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [floorPlanToRename, setFloorPlanToRename] = useState<FloorPlan | null>(null);
  const [newName, setNewName] = useState('');

  const handleDeleteClick = (floorPlan: FloorPlan) => {
    setFloorPlanToDelete(floorPlan);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (floorPlanToDelete) {
      await onFloorPlanDelete(floorPlanToDelete.id);
      setDeleteDialogOpen(false);
      setFloorPlanToDelete(null);
    }
  };

  const handleRenameClick = (floorPlan: FloorPlan) => {
    setFloorPlanToRename(floorPlan);
    setNewName(floorPlan.name);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (floorPlanToRename && newName.trim() && newName.trim() !== floorPlanToRename.name) {
      await onFloorPlanUpdate(floorPlanToRename.id, newName.trim());
      setRenameDialogOpen(false);
      setFloorPlanToRename(null);
      setNewName('');
    }
  };

  const handleRenameCancel = () => {
    setRenameDialogOpen(false);
    setFloorPlanToRename(null);
    setNewName('');
  };

  if (floorPlans.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Tabs value={activeFloorPlanId ?? undefined} className="flex-1 overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <TabsList className="min-w-max">
              {floorPlans.map((floorPlan) => (
                <TabsTrigger
                  key={floorPlan.id}
                  value={floorPlan.id}
                  onClick={() => onFloorPlanSelect(floorPlan.id)}
                  disabled={isLoading}
                  title={floorPlan.name}
                  className="truncate max-w-[240px]"
                >
                  {floorPlan.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        {/* Add Floor Plan (icon-only) */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label="Add floor plan"
                onClick={onCreateRequest}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Add floor plan</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Active tab context menu */}
        {activeFloorPlanId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Floor plan options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleRenameClick(floorPlans.find(fp => fp.id === activeFloorPlanId)!)}>
                <Pencil className="h-4 w-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReplaceRequest?.(activeFloorPlanId!)}>
                <Upload className="h-4 w-4 mr-2" />
                Replace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => handleDeleteClick(floorPlans.find(fp => fp.id === activeFloorPlanId)!)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Floor Plan</DialogTitle>
            <DialogDescription>
              Enter a new name for &ldquo;{floorPlanToRename?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="col-span-3"
                placeholder="Enter floor plan name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRenameConfirm();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleRenameCancel();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleRenameCancel}>
              Cancel
            </Button>
            <Button 
              onClick={handleRenameConfirm}
              disabled={!newName.trim() || newName.trim() === floorPlanToRename?.name}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Floor Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{floorPlanToDelete?.name}&rdquo;? 
              This will also remove all device positions on this floor plan. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}