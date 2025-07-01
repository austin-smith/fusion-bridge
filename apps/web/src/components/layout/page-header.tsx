'use client'; // Keep as client component for potential future interactive elements if needed, or can be server

import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode; // Accept an optional icon component
  actions?: React.ReactNode; // Accept optional action elements (buttons, filters, etc.)
}

export function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 flex-shrink-0">
      {/* Title, Description, and Icon Section */}
      <div className="flex items-center gap-3 flex-shrink-0 mr-4"> {/* Add margin-right for spacing on larger screens */}
        {icon && <div className="text-muted-foreground flex-shrink-0">{icon}</div>}
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5 hidden md:block">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Actions Section */}
      {actions && (
        <div className="flex flex-wrap items-center justify-start md:justify-end gap-2">
          {actions}
        </div>
      )}
    </div>
  );
} 