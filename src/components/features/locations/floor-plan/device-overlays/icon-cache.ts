"use client";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getIconComponentByName } from "@/lib/mappings/presentation";

type IconCacheKey = string; // `${iconName}:${color}:${size}`

const loadedImageCache = new Map<IconCacheKey, HTMLImageElement>();
const pendingImageCache = new Map<IconCacheKey, Promise<HTMLImageElement>>();

function svgToDataUrl(svgString: string): string {
  // Ensure SVG has xmlns to render consistently
  const svgWithNs = svgString.includes("xmlns=")
    ? svgString
    : svgString.replace(
        "<svg",
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
  const encoded = encodeURIComponent(svgWithNs)
    // Encode special characters for data URL safety
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

export interface GetIconImageOptions {
  size: number; // pixel size of the source image (consider DPR)
  color?: string; // stroke color, defaults to currentColor if omitted
  strokeWidth?: number; // lucide stroke width (1-3 typical)
}

/**
 * Returns a cached HTMLImageElement for a Lucide icon name, lazily rendering
 * the React icon to an SVG string and loading it as an image on first use.
 */
export function getLucideIconImage(
  iconName: string,
  { size, color = "#6b7280", strokeWidth = 2 }: GetIconImageOptions
): Promise<HTMLImageElement> {
  const cacheKey: IconCacheKey = `${iconName}:${color}:${size}:${strokeWidth}`;

  const cached = loadedImageCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  const pending = pendingImageCache.get(cacheKey);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    try {
      const IconComponent = getIconComponentByName(iconName);
      // Render the Lucide icon component to an SVG string
      const svgString = renderToStaticMarkup(
        React.createElement(IconComponent, { size, color, strokeWidth })
      );
      const dataUrl = svgToDataUrl(svgString);

      const img = new Image();
      img.onload = () => {
        loadedImageCache.set(cacheKey, img);
        pendingImageCache.delete(cacheKey);
        resolve(img);
      };
      img.onerror = (e) => {
        pendingImageCache.delete(cacheKey);
        reject(new Error(`Failed to load icon image for ${iconName}`));
      };
      img.src = dataUrl;
    } catch (err) {
      pendingImageCache.delete(cacheKey);
      reject(err instanceof Error ? err : new Error("Unknown icon render error"));
    }
  });

  pendingImageCache.set(cacheKey, promise);
  return promise;
}


