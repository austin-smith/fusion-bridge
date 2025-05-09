'use client';

import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { X } from 'lucide-react';

interface DebouncedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  debounce?: number;
}

// A debounced input component for filtering
export function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 300,
  ...props
}: DebouncedInputProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (value !== initialValue) {
        onChange(value);
      }
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value, initialValue, debounce, onChange]);

  return (
    <div className="relative">
      <Input
        {...props}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-xs px-2 py-1 h-8" // Keep existing styling
      />
      {value && (
        <button
          onClick={() => {
            setValue(''); // Clear local state
            onChange(''); // Immediately trigger onChange with empty value
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
} 