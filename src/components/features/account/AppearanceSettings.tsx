'use client';

import React, { useState, useLayoutEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PREFERRED_THEME_FAMILY_KEY } from "@/components/common/theme-provider";

interface ThemeOption {
    value: string;
    label: string;
}

interface ExtendedThemeOption extends ThemeOption {
    dotColor: string;
}

export function AppearanceSettings() {
    const [selectedThemeFamily, setSelectedThemeFamily] = useState<string>('default');

    // Initialize with value from localStorage
    React.useEffect(() => {
        const currentThemeFamily = localStorage.getItem(PREFERRED_THEME_FAMILY_KEY) || 'default';
        setSelectedThemeFamily(currentThemeFamily);
    }, []);

    // Setup dynamic theme options using computed CSS variables
    const baseThemeOptions: ThemeOption[] = React.useMemo(() => [
      { value: 'default', label: 'Default' },
      { value: 'cosmic-night', label: 'Cosmic Night' },
      { value: 'mono', label: 'Mono' },
      { value: 't3-chat', label: 'T3 Chat' },
    ], []);

    const [themeOptions, setThemeOptions] = useState<ExtendedThemeOption[]>([]);

    useLayoutEffect(() => {
      const root = document.documentElement;
      const originalClasses = Array.from(root.classList);
      const themeValues = baseThemeOptions.map(opt => opt.value);
      
      const computedOptions = baseThemeOptions.map(opt => {
        // restore original classes
        root.className = '';
        originalClasses.forEach(cls => root.classList.add(cls));
        // remove theme classes
        themeValues.forEach(tv => root.classList.remove(tv));
        // apply this theme for preview (skip default)
        if (opt.value !== 'default') root.classList.add(opt.value);
        const cssValue = getComputedStyle(root).getPropertyValue('--primary').trim();
        return { ...opt, dotColor: `hsl(${cssValue})` };
      });
      
      // restore original classes
      root.className = '';
      originalClasses.forEach(cls => root.classList.add(cls));
      setThemeOptions(computedOptions);
    }, [baseThemeOptions]);

    const handleThemeFamilyChange = (newThemeFamilyValue: string) => {
        setSelectedThemeFamily(newThemeFamilyValue);
        localStorage.setItem(PREFERRED_THEME_FAMILY_KEY, newThemeFamilyValue);
        
        // Manually add/remove the class for immediate effect
        const root = document.documentElement;
        
        // Remove all theme classes
        baseThemeOptions.forEach(opt => {
            if (opt.value !== 'default') {
                root.classList.remove(opt.value);
            }
        });
        
        // Add the new theme class (if not default)
        if (newThemeFamilyValue !== 'default') {
            root.classList.add(newThemeFamilyValue);
        }
        
        // Dispatch storage event for cross-tab synchronization
        window.dispatchEvent(new StorageEvent('storage', {
            key: PREFERRED_THEME_FAMILY_KEY,
            newValue: newThemeFamilyValue,
            oldValue: selectedThemeFamily,
            storageArea: localStorage,
        }));
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize the look and feel of the application.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="theme-family-select">Theme</Label>
                    <Select value={selectedThemeFamily} onValueChange={handleThemeFamilyChange}>
                        <SelectTrigger id="theme-family-select" className="w-[200px]">
                            <SelectValue placeholder="Select theme family" />
                        </SelectTrigger>
                        <SelectContent>
                            {themeOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    <div className="flex items-center">
                                        <span 
                                            className="inline-block h-3 w-3 rounded-full mr-2" 
                                            style={{ backgroundColor: opt.dotColor }} 
                                        />
                                        {opt.label}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                        Choose a theme that suits your preference. Changes apply immediately.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
} 