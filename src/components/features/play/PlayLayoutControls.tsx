'use client';

import React, { useMemo, useState } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MoreHorizontal, Save, LayoutTemplate, Plus, Pencil, Trash2, SlidersHorizontal, Pin, Check } from 'lucide-react';

export interface LayoutOption {
	id: string;
	name: string;
}

interface PlayLayoutControlsProps {
	layouts: LayoutOption[];
	activeLayoutId: string | 'auto';
	onSelect: (id: string | 'auto') => void;
	onCreate: (name: string) => void;
	onRename: (id: string, name: string) => void;
	onDelete: (id: string) => void;
	onSave: () => void;
  isDirty?: boolean;
  onEditCameras?: () => void;
  defaultLayoutId?: string | null;
  onSetDefault?: (id: string | 'auto') => void;
}

export const PlayLayoutControls: React.FC<PlayLayoutControlsProps> = ({
  layouts, activeLayoutId, onSelect, onCreate, onRename, onDelete, onSave, isDirty = false, onEditCameras,
  defaultLayoutId = null, onSetDefault,
}) => {
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isRenameOpen, setIsRenameOpen] = useState(false);
	const [pendingName, setPendingName] = useState('');
	const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
	const [deleteTargetName, setDeleteTargetName] = useState('');

	const canSave = useMemo(() => activeLayoutId !== 'auto', [activeLayoutId]);

	const activeLabel = useMemo(() => {
		if (activeLayoutId === 'auto') return 'Auto';
		const found = layouts.find(l => l.id === activeLayoutId);
		return found?.name ?? 'Select layout';
	}, [activeLayoutId, layouts]);

	const handleSelectChange = (v: string) => {
		if (v === '__new__') {
			setPendingName('');
			setIsCreateOpen(true);
			return;
		}
		onSelect(v as any);
	};

  const orderedLayouts = React.useMemo(() => {
    return [...layouts].sort((a, b) => a.name.localeCompare(b.name));
  }, [layouts]);

  return (
		<div className="flex items-center gap-2">
			<div className="inline-flex items-center gap-2 rounded-md bg-background/80 backdrop-blur-sm border px-1.5 py-1">
				<LayoutTemplate className="h-4 w-4 text-muted-foreground" />
				<Select value={activeLayoutId} onValueChange={handleSelectChange}>
					<SelectTrigger className="h-8 w-[200px] min-w-0">
						<div className="min-w-0 truncate">
							<span className="truncate">{activeLabel}</span>
						</div>
					</SelectTrigger>
					<SelectContent>
						{/* New layout item with icon that won't mirror into trigger */}
						<SelectPrimitive.Item
							value="__new__"
							className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
						>
							<span className="mr-2 inline-flex items-center justify-center"><Plus className="h-4 w-4" /></span>
							<SelectPrimitive.ItemText className="truncate">New layout…</SelectPrimitive.ItemText>
							<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
								<SelectPrimitive.ItemIndicator>
									<Check className="h-4 w-4" />
								</SelectPrimitive.ItemIndicator>
							</span>
						</SelectPrimitive.Item>
						<SelectSeparator />
						{/* Auto item with pin icon, not mirrored in trigger */}
						<SelectPrimitive.Item
							value="auto"
							className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
						>
							<Pin className={`mr-2 h-3.5 w-3.5 text-muted-foreground ${defaultLayoutId === null ? '' : 'invisible'}`} />
							<SelectPrimitive.ItemText className="truncate">Auto</SelectPrimitive.ItemText>
							<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
								<SelectPrimitive.ItemIndicator>
									<Check className="h-4 w-4" />
								</SelectPrimitive.ItemIndicator>
							</span>
						</SelectPrimitive.Item>
						{orderedLayouts.map(l => (
							<SelectPrimitive.Item
								key={l.id}
								value={l.id}
								className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
							>
								<Pin className={`mr-2 h-3.5 w-3.5 text-muted-foreground ${defaultLayoutId === l.id ? '' : 'invisible'}`} />
								<SelectPrimitive.ItemText className="truncate">{l.name}</SelectPrimitive.ItemText>
								<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
									<SelectPrimitive.ItemIndicator>
										<Check className="h-4 w-4" />
									</SelectPrimitive.ItemIndicator>
								</span>
							</SelectPrimitive.Item>
						))}
					</SelectContent>
				</Select>
				<div className="h-5 w-px bg-border mx-0" />
				<TooltipProvider delayDuration={150}>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button size="sm" className="h-8 w-8 p-0" variant="ghost" onClick={onSave} disabled={!canSave || !isDirty} aria-label="Save layout">
								<Save className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Save positions to this layout</TooltipContent>
					</Tooltip>
				</TooltipProvider>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" className="h-8 w-8 p-0" variant="ghost" aria-label="Manage layouts">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
						<DropdownMenuItem
						onSelect={() => { onSetDefault?.(activeLayoutId); }}
						>
						<Pin className="mr-2 h-4 w-4" />
						Set as default
					</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled={activeLayoutId === 'auto'} onSelect={() => onEditCameras?.()}>
							<SlidersHorizontal className="mr-2 h-4 w-4" />
							Edit cameras
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={activeLayoutId === 'auto'}
							onSelect={() => {
								if (activeLayoutId === 'auto') return;
								setRenameTargetId(activeLayoutId);
								setPendingName(layouts.find(l => l.id === activeLayoutId)?.name || '');
								setIsRenameOpen(true);
							}}
						>
							<Pencil className="mr-2 h-4 w-4" />
							Rename
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="text-destructive focus:text-destructive"
							disabled={activeLayoutId === 'auto'}
							onSelect={() => {
								if (activeLayoutId === 'auto') return;
								setDeleteTargetId(activeLayoutId);
								setDeleteTargetName(layouts.find(l => l.id === activeLayoutId)?.name || '');
								setIsDeleteOpen(true);
							}}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				{isDirty && <span className="h-1.5 w-1.5 rounded-full bg-foreground/60" aria-label="Unsaved changes" />}
			</div>

			<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<DialogContent>
					<form
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							const name = pendingName.trim();
							if (name) {
								onCreate(name);
								setIsCreateOpen(false);
							}
						}}
					>
						<DialogHeader>
							<DialogTitle>New Layout</DialogTitle>
						</DialogHeader>
						<Input placeholder="Layout name" value={pendingName} onChange={(e) => setPendingName(e.target.value)} />
						<DialogFooter>
							<Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
							<Button type="submit" disabled={!pendingName.trim()}>
								Create
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
				<DialogContent>
					<form
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							const name = pendingName.trim();
							if (name && renameTargetId) {
								onRename(renameTargetId, name);
								setIsRenameOpen(false);
							}
						}}
					>
						<DialogHeader>
							<DialogTitle>Rename Layout</DialogTitle>
						</DialogHeader>
						<Input placeholder="Layout name" value={pendingName} onChange={(e) => setPendingName(e.target.value)} />
						<DialogFooter>
							<Button type="button" variant="secondary" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
							<Button type="submit" disabled={!pendingName.trim() || !renameTargetId}>Save</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Layout</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Are you sure you want to delete layout {deleteTargetName ? (<span className="font-semibold">{deleteTargetName}</span>) : 'this layout'}?
						This action cannot be undone.
					</p>
					<DialogFooter>
						<Button variant="secondary" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (deleteTargetId) {
									onDelete(deleteTargetId);
								}
								setIsDeleteOpen(false);
							}}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};


