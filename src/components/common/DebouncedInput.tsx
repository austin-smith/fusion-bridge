'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { X } from 'lucide-react';

interface DebouncedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string; // This is the actual filter value from the table state
  onChange: (value: string) => void; // This is header.column.setFilterValue
  debounce?: number;
}

export function DebouncedInput({
  value: externalValue,
  onChange: reportChangeToParent,
  debounce = 300,
  ...props
}: DebouncedInputProps) {
  const [inputValue, setInputValue] = useState(externalValue);

  // Store the latest reportChangeToParent function in a ref to ensure the debounced callback uses the freshest version.
  const reportChangeCallbackRef = useRef(reportChangeToParent);
  useEffect(() => {
    reportChangeCallbackRef.current = reportChangeToParent;
  }, [reportChangeToParent]);

  // Effect to update internal inputValue ONLY when externalValue prop changes.
  useEffect(() => {
    // No need to check if they are different here, as this effect only runs when externalValue changes.
    setInputValue(externalValue);
  }, [externalValue]); // Only depend on externalValue

  // Debounce effect for inputValue changes (i.e., user typing)
  useEffect(() => {
    // If the internal input value is the same as what the parent already knows,
    // then we don't need to schedule a report. This can happen if externalValue
    // changed and the effect above just synced inputValue.
    if (inputValue === externalValue) {
      return;
    }

    // If they are different, it means the user has typed something new.
    const timerId = setTimeout(() => {
      reportChangeCallbackRef.current(inputValue);
    }, debounce);

    return () => {
      clearTimeout(timerId);
    };
  // IMPORTANT: We only want this effect to re-run if inputValue or debounce changes.
  // externalValue is used in the condition but shouldn't trigger re-running the timeout setup
  // itself, only the logic inside it. reportChangeCallbackRef is stable due to useRef.
  }, [inputValue, debounce]); 

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value); // Update internal state immediately as user types
  };

  const handleClear = () => {
    setInputValue('');
    reportChangeCallbackRef.current(''); // Report clear immediately to parent
  };

  return (
    <div className="relative">
      <Input
        {...props}
        value={inputValue} // Display the internal state
        onChange={handleChange}
        className="text-xs px-2 py-1 h-8"
      />
      {inputValue && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
} 