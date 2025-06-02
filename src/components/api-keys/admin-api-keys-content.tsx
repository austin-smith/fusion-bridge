'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Search, 
  MoreHorizontal, 
  Eye, 
  EyeOff, 
  Trash2, 
  Key as KeyIcon,
  AlertTriangle 
} from 'lucide-react';
import { toast } from 'sonner';

interface ApiKeyWithUser {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  rateLimitEnabled: boolean;
  rateLimitMax: number | null;
  remaining: number | null;
  lastRequest: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // User information
  userId: string;
  userName: string;
  userEmail: string;
  requestCount: number;
  // Organization information
  organizationId: string | null;
  organizationInfo: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export function AdminApiKeysContent() {
  const [apiKeys, setApiKeys] = useState<ApiKeyWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  // Load API keys from the server
  useEffect(() => {
    const loadApiKeys = async () => {
      setLoading(true);
      
      try {
        const response = await fetch('/api/admin/api-keys');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch API keys: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Convert date strings back to Date objects
        const apiKeysWithDates = (data.apiKeys || []).map((key: any) => ({
          ...key,
          lastRequest: key.lastRequest ? new Date(key.lastRequest) : null,
          expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
          createdAt: new Date(key.createdAt),
          updatedAt: new Date(key.updatedAt),
        }));
        
        setApiKeys(apiKeysWithDates);
      } catch (error) {
        console.error('Error loading API keys:', error);
        toast.error('Failed to load API keys');
        setApiKeys([]);
      } finally {
        setLoading(false);
      }
    };

    loadApiKeys();
  }, []);

  const handleToggleStatus = async (keyId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/admin/api-keys/${keyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update API key: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Update local state
      setApiKeys(prev => prev.map(key => 
        key.id === keyId ? { ...key, enabled } : key
      ));

      toast.success(result.message || `API key ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error('Error updating API key status:', error);
      toast.error('Failed to update API key status');
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/api-keys/${keyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete API key: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Remove from local state
      setApiKeys(prev => prev.filter(key => key.id !== keyId));
      toast.success(result.message || 'API key deleted successfully');
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'Never';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Check if the date is valid
    if (isNaN(dateObj.getTime())) return 'Invalid date';
    
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  };

  const formatRelativeTime = (date: Date | string | null) => {
    if (!date) return 'Never';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Check if the date is valid
    if (isNaN(dateObj.getTime())) return 'Invalid date';
    
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateObj);
  };

  const maskApiKey = (start: string | null) => {
    if (!start) return '••••••••••••••••';
    return `${start}••••••••••••••••`;
  };

  // Filter logic
  const filteredKeys = apiKeys.filter(key => {
    const matchesSearch = !searchTerm || 
      key.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      key.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      key.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      key.start?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && key.enabled) ||
      (statusFilter === 'disabled' && !key.enabled) ||
      (statusFilter === 'expired' && key.expiresAt && !isNaN(key.expiresAt.getTime()) && key.expiresAt < new Date());
    
    const matchesUser = userFilter === 'all' || key.userId === userFilter;
    
    return matchesSearch && matchesStatus && matchesUser;
  });

  // Get unique users for filter
  const uniqueUsers = Array.from(new Set(apiKeys.map(key => ({ id: key.userId, name: key.userName, email: key.userEmail }))))
    .filter((user, index, arr) => arr.findIndex(u => u.id === user.id) === index);

  const stats = {
    total: apiKeys.length,
    active: apiKeys.filter(k => k.enabled).length,
    disabled: apiKeys.filter(k => !k.enabled).length,
    expired: apiKeys.filter(k => k.expiresAt && !isNaN(k.expiresAt.getTime()) && k.expiresAt < new Date()).length,
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <KeyIcon className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Total Keys</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Eye className="h-4 w-4 text-green-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <EyeOff className="h-4 w-4 text-gray-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Disabled</p>
                <p className="text-2xl font-bold text-gray-600">{stats.disabled}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 gap-4">
              <div className="flex-1">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by name, user, or key..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="status-filter">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="user-filter">User</Label>
                <Select value={userFilter} onValueChange={setUserFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {uniqueUsers.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>API Key</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {apiKey.name || 'Unnamed API Key'}
                        </div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {maskApiKey(apiKey.start)}
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div>
                        <div className="font-medium">{apiKey.userName}</div>
                        <div className="text-sm text-muted-foreground">{apiKey.userEmail}</div>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div>
                        {apiKey.organizationInfo ? (
                          <>
                            <div className="font-medium">{apiKey.organizationInfo.name}</div>
                            <div className="text-sm text-muted-foreground">/{apiKey.organizationInfo.slug}</div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            <Badge variant="outline">Legacy Key</Badge>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={apiKey.enabled ? 'default' : 'secondary'}>
                          {apiKey.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                        {apiKey.expiresAt && !isNaN(apiKey.expiresAt.getTime()) && apiKey.expiresAt < new Date() && (
                          <Badge variant="destructive">Expired</Badge>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="text-sm">
                        <div>{apiKey.requestCount} requests</div>
                        {apiKey.rateLimitEnabled && (
                          <div className="text-muted-foreground">
                            {apiKey.rateLimitMax ? (
                              <>
                                {apiKey.remaining !== null 
                                  ? `${apiKey.remaining} remaining` 
                                  : `${apiKey.rateLimitMax} limit`
                                }
                              </>
                            ) : (
                              'No limit'
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="text-sm">
                        {formatRelativeTime(apiKey.lastRequest)}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="text-sm">
                        {formatDate(apiKey.createdAt)}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => handleToggleStatus(apiKey.id, !apiKey.enabled)}
                          >
                            {apiKey.enabled ? (
                              <>
                                <EyeOff className="h-4 w-4 mr-2" />
                                Disable Key
                              </>
                            ) : (
                              <>
                                <Eye className="h-4 w-4 mr-2" />
                                Enable Key
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDeleteKey(apiKey.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Key
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {!loading && filteredKeys.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <KeyIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No API keys found</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || userFilter !== 'all' 
                  ? 'Try adjusting your filters.' 
                  : 'No API keys have been created yet.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 