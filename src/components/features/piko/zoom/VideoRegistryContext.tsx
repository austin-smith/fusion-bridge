/**
 * VideoRegistryContext
 *
 * Purpose
 * - Centralized, lightweight registry for sharing live HTMLVideoElement instances
 *   keyed by deviceId across the Play grid subtree (e.g., camera tiles and zoom windows).
 * - Prevents multiple decodes/streams by allowing zoom windows to sample from the
 *   same underlying <video> element rather than spinning up new players.
 *
 * API
 * - register(deviceId, el): Register (or clear) the <video> element for a device.
 * - get(deviceId): Retrieve the registered <video> or null if not yet available.
 * - getVideoSize(deviceId): Convenience helper returning { w, h } when known.
 *
 * Usage
 * - Wrap the grid subtree with <VideoRegistryProvider>.
 * - In the camera player (e.g., DewarpablePikoPlayer), call register(deviceId, el)
 *   via exposeVideoRef once the <video> is ready.
 * - Consumers (e.g., ZoomWindowTile) call useVideoRegistry().get(deviceId) to sample
 *   the same feed or use getVideoSize(deviceId) for ROI math before the video is ready.
 *
 * Notes
 * - While currently used by zoom windows, the registry itself is feature-agnostic and
 *   can be reused anywhere shared access to device <video> elements is beneficial.
 */
'use client';

import React, { createContext, useContext, useMemo, useRef } from 'react';

interface VideoRegistryValue {
	register: (deviceId: string, el: HTMLVideoElement | null) => void;
	get: (deviceId: string) => HTMLVideoElement | null;
	getVideoSize: (deviceId: string) => { w: number; h: number } | undefined;
}

const VideoRegistryContext = createContext<VideoRegistryValue | null>(null);

export const VideoRegistryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const mapRef = useRef<Record<string, HTMLVideoElement | null>>({});
	const api = useMemo<VideoRegistryValue>(
		() => ({
			register: (deviceId, el) => {
				mapRef.current[deviceId] = el || null;
			},
			get: (deviceId) => mapRef.current[deviceId] ?? null,
			getVideoSize: (deviceId) => {
				const el = mapRef.current[deviceId];
				if (el && el.videoWidth && el.videoHeight) return { w: el.videoWidth, h: el.videoHeight };
				return undefined;
			},
		}),
		[]
	);
	return <VideoRegistryContext.Provider value={api}>{children}</VideoRegistryContext.Provider>;
};

export function useVideoRegistry(): VideoRegistryValue {
	const ctx = useContext(VideoRegistryContext);
	if (!ctx) throw new Error('useVideoRegistry must be used within VideoRegistryProvider');
	return ctx;
}
