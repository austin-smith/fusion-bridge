"use client";

import { useMemo, useState, useCallback } from "react";
import type {
  OnChangeFn,
  ColumnSizingState,
  ColumnSizingInfoState,
  VisibilityState,
} from "@tanstack/react-table";

export interface UsePersistedTableStateOptions {
  storageKey: string;
  initialColumnOrder: string[]; // pass [] initially, then set via setter
  defaultVisibility?: VisibilityState;
  lockedColumnIds?: string[]; // e.g., ["actions"]
  versionSuffix?: string; // optional versioning, defaults to "v1"
}

export interface UsePersistedTableStateResult {
  columnOrder: string[];
  setColumnOrder: (order: string[]) => void;
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  columnSizingInfo: ColumnSizingInfoState;
  onColumnOrderChange: OnChangeFn<string[]>;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  onColumnSizingChange: OnChangeFn<ColumnSizingState>;
  onColumnSizingInfoChange: OnChangeFn<ColumnSizingInfoState>;
}

function getLocalStorageItem<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function setLocalStorageItem<T>(key: string, value: T): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function enforceLockedColumns(order: string[], locked: string[]): string[] {
  if (!locked.length) return order;
  const withoutLocked = order.filter((id) => !locked.includes(id));
  return [...withoutLocked, ...locked.filter((id) => order.includes(id))];
}

export function usePersistedTableState(
  options: UsePersistedTableStateOptions
): UsePersistedTableStateResult {
  const {
    storageKey,
    initialColumnOrder,
    defaultVisibility = {},
    lockedColumnIds = [],
    versionSuffix = "v1",
  } = options;

  const orderKey = `${storageKey}:columnOrder:${versionSuffix}`;
  const visibilityKey = `${storageKey}:columnVisibility:${versionSuffix}`;
  const sizingKey = `${storageKey}:columnSizing:${versionSuffix}`;

  // Column Order
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const stored = getLocalStorageItem<string[]>(orderKey);
    if (stored && Array.isArray(stored)) {
      // Filter to only known ids and ensure locked columns are last
      const filtered = initialColumnOrder.length
        ? stored.filter((id) => initialColumnOrder.includes(id))
        : stored;
      const missing = initialColumnOrder.length
        ? initialColumnOrder.filter((id) => !filtered.includes(id))
        : [];
      const merged = [...filtered, ...missing];
      return enforceLockedColumns(merged, lockedColumnIds);
    }
    return initialColumnOrder.length
      ? enforceLockedColumns(initialColumnOrder, lockedColumnIds)
      : [];
  });

  // Column Visibility
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => {
      const stored = getLocalStorageItem<VisibilityState>(visibilityKey);
      if (stored) {
        // Merge defaults for only missing keys; never override stored prefs
        const result: VisibilityState = { ...stored };
        Object.keys(defaultVisibility).forEach((key) => {
          if (!(key in stored)) {
            (result as Record<string, boolean>)[key] = (
              defaultVisibility as Record<string, boolean>
            )[key] as boolean;
          }
        });
        return result;
      }
      return { ...defaultVisibility };
    }
  );

  // Column Sizing
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    return getLocalStorageItem<ColumnSizingState>(sizingKey) ?? {};
  });

  // Column Sizing Info (not persisted)
  const [columnSizingInfo, setColumnSizingInfo] =
    useState<ColumnSizingInfoState>({
      startOffset: null,
      startSize: null,
      deltaOffset: null,
      deltaPercentage: null,
      isResizingColumn: false,
      columnSizingStart: [],
    });

  // Handlers compatible with TanStack
  const onColumnOrderChange: OnChangeFn<string[]> = useCallback(
    (updater) => {
      setColumnOrder((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (old: string[]) => string[])(prev)
            : updater;
        const enforced = enforceLockedColumns(next, lockedColumnIds);
        setLocalStorageItem(orderKey, enforced);
        return enforced;
      });
    },
    [lockedColumnIds, orderKey]
  );

  const onColumnVisibilityChange: OnChangeFn<VisibilityState> = useCallback(
    (updater) => {
      setColumnVisibility((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (old: VisibilityState) => VisibilityState)(prev)
            : updater;
        setLocalStorageItem(visibilityKey, next);
        return next;
      });
    },
    [visibilityKey]
  );

  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = useCallback(
    (updater) => {
      setColumnSizing((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (old: ColumnSizingState) => ColumnSizingState)(prev)
            : updater;
        setLocalStorageItem(sizingKey, next);
        return next;
      });
    },
    [sizingKey]
  );

  const onColumnSizingInfoChange: OnChangeFn<ColumnSizingInfoState> =
    useCallback((updater) => {
      setColumnSizingInfo((prev) =>
        typeof updater === "function"
          ? (updater as (old: ColumnSizingInfoState) => ColumnSizingInfoState)(
              prev
            )
          : updater
      );
    }, []);

  return useMemo(
    () => ({
      columnOrder,
      setColumnOrder: (order: string[]) => {
        setColumnOrder(order);
        setLocalStorageItem(
          orderKey,
          enforceLockedColumns(order, lockedColumnIds)
        );
      },
      columnVisibility,
      columnSizing,
      columnSizingInfo,
      onColumnOrderChange,
      onColumnVisibilityChange,
      onColumnSizingChange,
      onColumnSizingInfoChange,
    }),
    [
      columnOrder,
      columnVisibility,
      columnSizing,
      columnSizingInfo,
      onColumnOrderChange,
      onColumnVisibilityChange,
      onColumnSizingChange,
      onColumnSizingInfoChange,
      orderKey,
      lockedColumnIds,
    ]
  );
}

export default usePersistedTableState;
