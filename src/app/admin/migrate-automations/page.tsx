'use client';

import React, { useState, startTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface MigrationSummary {
    message: string;
    migrated?: number;
    skipped?: number;
    errors?: number;
    errorDetails?: Array<{ ruleId: string; error: any; oldConfig?: any; attemptedConfig?: any }>;
}

export default function MigrateAutomationsPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [summary, setSummary] = useState<MigrationSummary | null>(null);

    const handleMigrate = async () => {
        setIsLoading(true);
        setSummary(null);
        const toastId = toast.loading('Starting automation configuration migration...');

        try {
            const response = await fetch('/api/admin/trigger-migration', { // New, simplified API route
                method: 'POST',
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                toast.error(result.error || 'Migration request failed. Check server logs.', { id: toastId });
                setSummary({ 
                    message: result.message || 'Migration failed or completed with errors.',
                    ...(result.migrated !== undefined && {migrated: result.migrated}),
                    ...(result.skipped !== undefined && {skipped: result.skipped}),
                    ...(result.errors !== undefined && {errors: result.errors}),
                    errorDetails: result.errorDetails,
                });
            } else {
                toast.success('Migration process completed!', { id: toastId });
                setSummary(result);
            }
        } catch (error) {
            console.error("Migration trigger error:", error);
            toast.error('Failed to trigger migration. See console for details.', { id: toastId });
            setSummary({ message: 'An error occurred while trying to trigger the migration.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Migrate Automation Configurations</CardTitle>
                    <CardDescription>
                        This tool will attempt to migrate older automation rule configurations 
                        to the new format (with a dedicated trigger object).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p className="text-sm text-muted-foreground">
                        Click the button below to start the migration process. 
                        Ensure you have backed up your database if this is the first time running this.
                    </p>
                    <Button 
                        onClick={() => startTransition(handleMigrate)} 
                        disabled={isLoading}
                        className="w-full"
                    >
                        {isLoading ? 'Migrating...' : 'Run Migration'}
                    </Button>

                    {summary && (
                        <div className="mt-6 p-4 border rounded-md bg-muted/50">
                            <h3 className="font-semibold mb-2">Migration Summary:</h3>
                            <p className="text-sm">{summary.message}</p>
                            {summary.migrated !== undefined && <p className="text-sm">Migrated: {summary.migrated}</p>}
                            {summary.skipped !== undefined && <p className="text-sm">Skipped: {summary.skipped}</p>}
                            {summary.errors !== undefined && <p className="text-sm">Errors: {summary.errors}</p>}
                            {summary.errorDetails && summary.errorDetails.length > 0 && (
                                <div className="mt-2">
                                    <h4 className="text-xs font-semibold mb-1">Error Details:</h4>
                                    <pre className="text-xs p-2 bg-background rounded-md max-h-60 overflow-auto">
                                        {JSON.stringify(summary.errorDetails, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
} 