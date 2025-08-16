'use client';

import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings2, GripVertical } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Table } from '@tanstack/react-table';

interface ColumnSettingsMenuProps {
  table: Table<any>;
}

function DraggableMenuItem({ column }: { column: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: column.id === 'actions',
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  const header = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-sm"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
      <Checkbox
        checked={column.getIsVisible()}
        onCheckedChange={() => column.toggleVisibility()}
        className="h-4 w-4"
      />
      <span
        className="flex-1 cursor-pointer select-none"
        onClick={() => column.toggleVisibility()}
      >
        {header}
      </span>
    </div>
  );
}

export function ColumnSettingsMenu({ table }: ColumnSettingsMenuProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8, delay: 100, tolerance: 5 },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;

      const currentOrder = table.getState().columnOrder;
      const activeIndex = currentOrder.indexOf(activeId);
      const overIndex = currentOrder.indexOf(overId);
      if (activeIndex === -1 || overIndex === -1) return;

      const newOrder = arrayMove(currentOrder, activeIndex, overIndex);
      table.setColumnOrder(newOrder);
    },
    [table]
  );

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4" />
                <span className="sr-only">Column Settings</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Column Settings</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent className="w-64" align="end">
        <div className="px-2 py-1.5 text-sm font-semibold">Column Settings</div>
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={table.getState().columnOrder} strategy={verticalListSortingStrategy}>
            <div className="py-1">
              {table
                .getState()
                .columnOrder.map((columnId) => table.getColumn(columnId))
                .filter((column) => column && column.getCanHide())
                .map((column) => (
                  <DraggableMenuItem key={column!.id} column={column} />
                ))}
            </div>
          </SortableContext>
        </DndContext>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ColumnSettingsMenu;


