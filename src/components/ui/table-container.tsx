import React from 'react';
import { cn } from '@/lib/utils';

interface TableContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function TableContainer({ 
  children, 
  className, 
  ...props 
}: TableContainerProps) {
  return (
    <div className={cn('table-container', className)} {...props}>
      {children}
    </div>
  );
} 