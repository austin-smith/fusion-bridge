'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Key, MoreHorizontal, Copy, Trash2, Calendar, Activity, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CreateApiKeyDialog } from '@/components/api-keys/CreateApiKeyDialog';
import { CopyKeyDialog } from '@/components/api-keys/CopyKeyDialog';
import { listApiKeys, deleteApiKey } from '@/lib/actions/auth-actions';

interface ApiKey {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  userId: string;
  enabled: boolean;
  rateLimitEnabled: boolean;
  rateLimitMax: number | null;
  rateLimitTimeWindow: number | null;
  requestCount: number;
  remaining: number | null;
  lastRequest: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: { [key: string]: string[] } | null;
  metadata: Record<string, any> | null;
  organizationId?: string;
  organizationName?: string;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  image: string | null;
  twoFactorEnabled: boolean;
}

interface ApiKeysSettingsProps {
  user: UserData;
}

export function ApiKeysSettings({ user }: ApiKeysSettingsProps) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newApiKey, setNewApiKey] = useState<any>(null);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const result = await listApiKeys();
      
      if (!result.success) {
        console.error('Error loading API keys:', result.error);
        return;
      }

      if (result.apiKeys) {
        setApiKeys(result.apiKeys);
      }
    } catch (error) {
      console.error('Error loading API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeyCreated = (apiKey: any) => {
    setNewApiKey(apiKey);
    setShowCopyDialog(true);
    loadApiKeys();
  };

  const handleDeleteApiKey = async () => {
    if (!keyToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteApiKey(keyToDelete.id);
      
      if (!result.success) {
        console.error('Error deleting API key:', result.error);
        return;
      }

      setApiKeys(prev => prev.filter(key => key.id !== keyToDelete.id));
    } catch (error) {
      console.error('Error deleting API key:', error);
    } finally {
      setIsDeleting(false);
      setKeyToDelete(null);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleOpenDeleteDialog = (apiKey: ApiKey) => {
    setKeyToDelete(apiKey);
    setIsDeleteDialogOpen(true);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateString);
  };

  const maskApiKey = (start: string | null) => {
    if (!start) return '••••••••••••••••';
    return `${start}••••••••••••••••`;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys ({apiKeys.length})
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Create and manage API keys for external integrations.
              </p>
            </div>
            <CreateApiKeyDialog onApiKeyCreated={handleApiKeyCreated} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Key className="h-8 w-8 text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-2">No API keys yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first API key to start integrating with external services.
              </p>
              <CreateApiKeyDialog 
                onApiKeyCreated={handleApiKeyCreated}
                trigger={
                  <Button size="sm" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create your first API key
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="space-y-6">
              {/* API Keys List */}
              <div className="space-y-3">
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm">
                            {apiKey.name || 'Unnamed API Key'}
                          </h4>
                          <Badge 
                            variant={apiKey.enabled ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {apiKey.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                          {apiKey.organizationId && (
                            <Badge variant="outline" className="text-xs">
                              <Building2 className="h-3 w-3 mr-1" />
                              {apiKey.organizationName || 'Organization'}
                            </Badge>
                          )}
                          {apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date() && (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          )}
                        </div>
                        
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="font-mono">{maskApiKey(apiKey.start)}</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Created {formatDate(apiKey.createdAt.toISOString())}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {apiKey.lastRequest && (
                              <span className="flex items-center gap-1">
                                <Activity className="h-3 w-3" />
                                Last used {formatRelativeTime(apiKey.lastRequest.toISOString())}
                              </span>
                            )}
                            {apiKey.rateLimitEnabled && (
                              <span>
                                {apiKey.rateLimitMax || 1000} req/day
                                {apiKey.remaining !== null && (
                                  <span className="ml-1">({apiKey.remaining} remaining)</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(apiKey.id)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Key ID
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleOpenDeleteDialog(apiKey)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {/* Usage Information Section */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Usage & Integration</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Authentication</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Include your API key in the <code className="px-1 py-0.5 bg-muted rounded text-xs">x-api-key</code> header:
                    </p>
                    <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
                      <code>curl -H &quot;x-api-key: your_api_key_here&quot; http://fusion-bridge-production.up.railway.app/api/endpoint</code>
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Organization Scoping</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      API keys are scoped to the organization you were active in when creating them. 
                      They will only have access to data within that organization.
                    </p>
                    <div className="text-xs text-muted-foreground p-3 bg-blue-50 rounded border-l-2 border-blue-200">
                      <strong>Note:</strong> To create API keys for different organizations, 
                      switch to that organization first, then create the key.
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Security</h4>
                    <p className="text-sm text-muted-foreground">
                      Keep your API keys secure and never expose them in client-side code. 
                      Rotate keys regularly for enhanced security. Each key can only access 
                      data from its assigned organization.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Copy Key Dialog */}
      <CopyKeyDialog
        apiKey={newApiKey}
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the API key
              <span className="font-semibold"> {keyToDelete?.name || 'Unnamed API Key'}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} onClick={() => setKeyToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteApiKey} 
              disabled={isDeleting} 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 