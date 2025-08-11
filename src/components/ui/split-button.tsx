import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SplitButtonItem {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SplitButtonProps {
  primaryLabel: string;
  onPrimaryClick: () => void;
  primaryIcon?: LucideIcon;
  items: SplitButtonItem[];
  size?: "sm" | "md";
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  ariaPrimaryLabel?: string;
}

/**
 * A generic split button composed of a primary action button and a caret button
 * that opens a dropdown of secondary actions.
 */
export default function SplitButton({
  primaryLabel,
  onPrimaryClick,
  primaryIcon: PrimaryIcon,
  items,
  size = "sm",
  disabled = false,
  isLoading = false,
  className,
  ariaPrimaryLabel,
}: SplitButtonProps) {
  const buttonSize = size === "sm" ? "sm" : undefined;
  const compactClasses = size === "sm" ? "h-7 px-2 text-xs" : "";
  const iconClasses = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border divide-x divide-border/40",
        className
      )}
    >
      <Button
        variant="outline"
        size={buttonSize}
        className={cn("rounded-none", compactClasses)}
        onClick={onPrimaryClick}
        disabled={disabled || isLoading}
        aria-label={ariaPrimaryLabel || primaryLabel}
      >
        {isLoading ? (
          <Loader2 className={cn(iconClasses, "animate-spin")} />
        ) : (
          <>
            {PrimaryIcon ? <PrimaryIcon className={cn(iconClasses)} /> : null}
            {primaryLabel}
          </>
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={buttonSize}
            className={cn("rounded-none px-1", compactClasses)}
            disabled={disabled || isLoading || items.length === 0}
            aria-label="More actions"
          >
            <ChevronDown className={iconClasses} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {items.map((item, idx) => (
            <DropdownMenuItem
              key={`${item.label}-${idx}`}
              onClick={() => !item.disabled && item.onSelect()}
              disabled={disabled || isLoading || item.disabled}
              className="text-xs"
            >
              {item.icon ? <item.icon className={cn(iconClasses)} /> : null}
              <span>{item.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
