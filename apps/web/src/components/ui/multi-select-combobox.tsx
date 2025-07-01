"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type Option = {
  value: string
  label: string
}

interface MultiSelectProps {
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  emptyText?: string
  className?: string
  popoverContentClassName?: string;
  disabled?: boolean;
}

export function MultiSelectComboBox({
  options,
  selected,
  onChange,
  placeholder = "Select options...",
  emptyText = "No options found.",
  className,
  popoverContentClassName,
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [popoverWidth, setPopoverWidth] = React.useState("auto");

  const handleSelect = React.useCallback(
    (value: string) => {
      if (disabled) return;
      const updatedSelected = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
      onChange(updatedSelected)
    },
    [selected, onChange, disabled],
  )

  const selectedLabels = React.useMemo(
    () =>
      selected
        .map((value) => options.find((option) => option.value === value)?.label)
        .filter(Boolean)
        .join(", "),
    [selected, options],
  )

  React.useEffect(() => {
    if (open && triggerRef.current) {
      setPopoverWidth(`${triggerRef.current.offsetWidth}px`);
    } else if (!open) {
      // Optional: Reset width when closed if it can cause layout shifts, 
      // or keep it to prevent resizing flicker if re-opened quickly.
      // setPopoverWidth("auto"); 
    }
  }, [open, options]); // Re-evaluate if options change while open affecting trigger width indirectly

  return (
    <Popover open={open && !disabled} onOpenChange={(newOpenState) => !disabled && setOpen(newOpenState)}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className, disabled && "cursor-not-allowed opacity-50")}
          disabled={disabled}
        >
          <span className="truncate">{selected.length > 0 ? selectedLabels : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        side="top"
        className={cn("p-0", popoverContentClassName)}
        style={{ width: popoverWidth }}
      >
        <Command>
          <CommandInput placeholder="Search options..." className="h-9" disabled={disabled} />
          <CommandList className="flex-1">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem 
                  key={option.value} 
                  value={option.label}
                  onSelect={() => {
                    if (!disabled) {
                        handleSelect(option.value);
                    }
                  }}
                  disabled={disabled}
                  className={cn(disabled && "cursor-not-allowed text-muted-foreground")}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", selected.includes(option.value) ? "opacity-100" : "opacity-0")}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
} 