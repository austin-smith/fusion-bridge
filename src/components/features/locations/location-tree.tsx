'use client';

import React from 'react';
import type { Location } from '@/types/index';
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from 'lucide-react';

// --- Type Definition for Action Callbacks ---
type LocationActionCallback = (location: Location | null) => void;

// --- Updated Component Props ---
interface LocationTreeProps {
  locations: Location[]; 
  onAdd: LocationActionCallback;    // Callback to add child or root
  onEdit: LocationActionCallback;   // Callback to edit
  onDelete: LocationActionCallback; // Callback to delete (placeholder for now)
}

// Interface for a location node in the tree structure
interface LocationNode extends Location {
  children: LocationNode[];
}

// Helper function to build the tree structure from the flat list
const buildLocationTree = (locations: Location[]): LocationNode[] => {
  const locationMap: { [key: string]: LocationNode } = {};
  const tree: LocationNode[] = [];

  // First pass: create nodes and map them by ID
  locations.forEach(location => {
    locationMap[location.id] = { ...location, children: [] };
  });

  // Second pass: build the hierarchy
  locations.forEach(location => {
    const node = locationMap[location.id];
    if (location.parentId && locationMap[location.parentId]) {
      locationMap[location.parentId].children.push(node);
      // Optional: Sort children by name or path if needed
      locationMap[location.parentId].children.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Root node
      tree.push(node);
    }
  });

  // Sort root nodes
  tree.sort((a, b) => a.name.localeCompare(b.name));

  return tree;
};

// --- Updated Location Item Component ---
interface LocationItemProps {
  node: LocationNode;
  level: number;
  onAdd: LocationActionCallback;
  onEdit: LocationActionCallback;
  onDelete: LocationActionCallback;
}

const LocationItem: React.FC<LocationItemProps> = ({ node, level, onAdd, onEdit, onDelete }) => {
  const indent = level * 20; // Indentation in pixels

  return (
    <div className="mb-1">
      <div 
        className="flex items-center justify-between p-2 rounded group hover:bg-muted/50" // Added group class
        style={{ paddingLeft: `${indent + 8}px` }} // Apply indentation
      >
        <span>{node.name}</span>
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
           {/* Use callbacks for actions */}
           <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAdd(node)} title="Add Child Location">
             <Plus className="h-4 w-4" />
           </Button>
           <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(node)} title="Edit Location">
             <Pencil className="h-4 w-4" />
           </Button>
           <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(node)} title="Delete Location">
             <Trash2 className="h-4 w-4" />
           </Button>
         </div>
      </div>
      {node.children.length > 0 && (
        <div className="mt-1">
          {node.children.map(childNode => (
            <LocationItem 
              key={childNode.id} 
              node={childNode} 
              level={level + 1} 
              onAdd={onAdd} 
              onEdit={onEdit} 
              onDelete={onDelete} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Updated Main LocationTree Component ---
export const LocationTree: React.FC<LocationTreeProps> = ({ locations, onAdd, onEdit, onDelete }) => {
  const locationTree = buildLocationTree(locations);

  if (locations.length === 0) {
     return (
        <div className="text-center text-muted-foreground p-4">
             <p className="mb-2">No locations created yet.</p>
             <Button variant="outline" size="sm" onClick={() => onAdd(null)}>
                 <Plus className="h-4 w-4" /> Add Root Location
             </Button>
        </div>
    );
  }

  return (
    <div className="space-y-1">
       <Button variant="outline" size="sm" className="mb-4" onClick={() => onAdd(null)}>
         <Plus className="h-4 w-4" /> Add Root Location
       </Button>
      {locationTree.map(rootNode => (
        <LocationItem 
            key={rootNode.id} 
            node={rootNode} 
            level={0} 
            onAdd={onAdd} 
            onEdit={onEdit} 
            onDelete={onDelete} 
        />
      ))}
    </div>
  );
}; 