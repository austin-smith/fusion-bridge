import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFusionStore } from '@/stores/store';
import { toast } from "sonner";
import { NodeWithConfig } from '@/types';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

// Define config types
interface YoLinkConfig {
  uaid: string;
  clientSecret: string;
}

interface PikoConfig {
  type: 'cloud';
  username: string;
  password: string;
  selectedSystem: string;
  token?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  };
}

type ConnectorConfig = YoLinkConfig | PikoConfig;

// Form schema
const formSchema = z.object({
  name: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  
  // YoLink fields
  uaid: z.string().optional(),
  clientSecret: z.string().optional(),
  yolinkHomeId: z.string().optional(),
  
  // Piko fields
  type: z.enum(['cloud']).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  selectedSystem: z.string().optional(),
}).refine((data) => {
  // Simple, single validation check based on category
  if (data.category === 'yolink') {
    return !!data.uaid && !!data.clientSecret;
  }
  if (data.category === 'piko') {
    return !!data.username && !!data.password;
  }
  return true;
}, {
  message: "Required fields missing for the selected connector type",
  path: ["category"], // Show error on category field
});

type FormValues = z.infer<typeof formSchema>;

// Define the wizard steps for Piko
type PikoWizardStep = 'credentials' | 'system-selection';

export function AddConnectorModal() {
  const {
    addConnectorOpen,
    setAddConnectorOpen,
    editConnectorOpen,
    setEditConnectorOpen,
    editingNode,
    setEditingNode,
    addNode,
    updateNode,
    setLoading,
    setError,
    isLoading
  } = useFusionStore();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Wizard state for Piko
  const [pikoWizardStep, setPikoWizardStep] = useState<PikoWizardStep>('credentials');
  const [pikoSystems, setPikoSystems] = useState<Array<{ id: string, name: string, health?: string, role?: string, version?: string }>>([]);
  const [isFetchingSystems, setIsFetchingSystems] = useState(false);
  const [pikoToken, setPikoToken] = useState<{ accessToken: string, refreshToken: string, expiresAt: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      category: '',
      uaid: '',
      clientSecret: '',
      yolinkHomeId: '',
      type: 'cloud', // Default to cloud for Piko
      username: '',
      password: '',
      selectedSystem: '',
    },
  });

  const isEditMode = !!editingNode;
  const currentOpenState = isEditMode ? editConnectorOpen : addConnectorOpen;
  const currentSetOpenState = isEditMode ? setEditConnectorOpen : setAddConnectorOpen;

  // Reset form to initial state
  const resetForm = useCallback(() => {
    form.reset({
      name: '',
      category: '',
      uaid: '',
      clientSecret: '',
      yolinkHomeId: '',
      type: 'cloud',
      username: '',
      password: '',
      selectedSystem: '',
    });
    setTestResult(null);
    setPikoWizardStep('credentials');
    setPikoSystems([]);
  }, [form]);

  useEffect(() => {
    if (isEditMode && editingNode) {
      let configValues = {};
      if (editingNode.category === 'yolink' && editingNode.config) {
        const yolinkConfig = editingNode.config as YoLinkConfig;
        configValues = {
          uaid: yolinkConfig.uaid || '',
          clientSecret: yolinkConfig.clientSecret || '',
          yolinkHomeId: editingNode.yolinkHomeId || '',
        };
      } else if (editingNode.category === 'piko' && editingNode.config) {
        const pikoConfig = editingNode.config as PikoConfig;
        configValues = {
          type: pikoConfig.type || 'cloud',
          username: pikoConfig.username || '',
          password: pikoConfig.password || '',
          selectedSystem: pikoConfig.selectedSystem || '',
        };
      }

      const defaultValues: Partial<FormValues> = {
        name: editingNode.name || '',
        category: editingNode.category,
        ...configValues,
      };
      form.reset(defaultValues);
    } else {
      resetForm();
    }
  }, [editingNode, isEditMode, form, resetForm]);

  useEffect(() => {
    if (!currentOpenState) {
      if (isEditMode) {
        setEditingNode(null);
      }
      resetForm();
    }
  }, [currentOpenState, isEditMode, setEditingNode, resetForm]);

  const selectedCategory = form.watch('category');
  const isPiko = selectedCategory === 'piko';

  // Function to fetch available Piko systems
  const fetchPikoSystems = async () => {
    try {
      setIsFetchingSystems(true);
      // Get current form values
      const values = form.getValues();
      
      // Verify credentials are present
      if (!values.username || !values.password) {
        toast.error('Please enter username and password');
        return;
      }
      
      // Call the API to get systems
      toast.loading('Authenticating with Piko...', { id: 'fetch-piko-systems' });
      
      const response = await fetch('/api/piko-systems', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: values.username,
          password: values.password,
        }),
      });
      
      const data = await response.json();
      toast.dismiss('fetch-piko-systems');
      
      if (data.success && data.systems && data.systems.length > 0) {
        // Store the systems and authentication token
        setPikoSystems(data.systems);
        setPikoToken(data.token);
        
        // Move to the next step
        setPikoWizardStep('system-selection');
        toast.success(`Found ${data.systems.length} Piko systems`);
      } else if (data.success && (!data.systems || data.systems.length === 0)) {
        toast.error('No Piko systems found for this account');
      } else {
        toast.error(data.error || 'Failed to fetch Piko systems');
      }
    } catch (error) {
      console.error('Error fetching Piko systems:', error);
      toast.dismiss('fetch-piko-systems');
      toast.error('Failed to fetch Piko systems');
    } finally {
      setIsFetchingSystems(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (isPiko && pikoWizardStep === 'system-selection' && !values.selectedSystem) {
      toast.error('Please select a system');
      return;
    }
    
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      let config: ConnectorConfig | undefined;
      let yolinkHomeId: string | null = null;

      if (values.category === 'yolink') {
        config = {
          uaid: values.uaid || '',
          clientSecret: values.clientSecret || '',
        };

        // In edit mode, use the existing yolinkHomeId if available
        if (isEditMode && editingNode?.yolinkHomeId) {
          yolinkHomeId = editingNode.yolinkHomeId;
          console.log('Using existing YoLink Home ID:', yolinkHomeId);
        } else {
          // Fetch YoLink home ID - required for YoLink connectors
          try {
            console.log('Attempting to fetch YoLink Home ID with credentials');
            
            toast.loading('Fetching YoLink Home ID...', { id: 'fetch-home-id' });
            
            // Verify credentials are present
            if (!config.uaid || !config.clientSecret) {
              throw new Error('Missing UAID or Client Secret for YoLink');
            }
            
            // Step 1: Get access token using our proxy API
            console.log('Getting YoLink Access Token via proxy...');
            const tokenResponse = await fetch('/api/yolink-proxy', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-yolink-action': 'getAccessToken'
              },
              body: JSON.stringify({
                uaid: config.uaid,
                clientSecret: config.clientSecret
              })
            });
            
            const tokenData = await tokenResponse.json();
            if (!tokenData.success || !tokenData.accessToken) {
              throw new Error(tokenData.error || 'Failed to get YoLink access token');
            }
            
            const accessToken = tokenData.accessToken;
            console.log('Access Token obtained via proxy. Fetching YoLink Home Info...');
            
            // Step 2: Get home ID using our proxy API
            const homeResponse = await fetch('/api/yolink-proxy', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-yolink-action': 'getHomeInfo'
              },
              body: JSON.stringify({
                accessToken
              })
            });
            
            const homeData = await homeResponse.json();
            if (!homeData.success || !homeData.homeId) {
              throw new Error(homeData.error || 'Failed to get YoLink home ID');
            }
            
            yolinkHomeId = homeData.homeId;
            console.log('Retrieved YoLink Home ID via proxy:', yolinkHomeId);
            toast.dismiss('fetch-home-id');
            
            if (yolinkHomeId) {
              toast.success(`Retrieved YoLink Home ID: ${yolinkHomeId.substring(0, 8)}...`);
            } else {
              console.error('YoLink Home ID returned null or empty');
              toast.error('YoLink Home ID not found');
              setLoading(false);
              return; // Stop the submission if no home ID was returned
            }
          } catch (error) {
            toast.dismiss('fetch-home-id');
            console.error('Error fetching YoLink Home ID:', error);
            
            // More detailed error message for debugging
            const errorMessage = error instanceof Error 
              ? `Failed to retrieve YoLink Home ID: ${error.message}` 
              : 'Failed to retrieve YoLink Home ID: Unknown error';
            
            console.error(errorMessage);
            toast.error(errorMessage);
            setLoading(false);
            return; // Stop the submission if home ID fetch fails
          }
        }
      } else if (values.category === 'piko') {
        config = {
          type: 'cloud',
          username: values.username || '',
          password: values.password || '',
          selectedSystem: values.selectedSystem || '',
          token: pikoToken ? {
            accessToken: pikoToken.accessToken,
            refreshToken: pikoToken.refreshToken,
            expiresAt: pikoToken.expiresAt
          } : undefined
        };
      }

      if (!config) {
        throw new Error('Invalid connector configuration');
      }

      const nodePayload: Omit<NodeWithConfig, 'id' | 'createdAt'> & { id?: string; yolinkHomeId?: string } = {
        name: values.name || 'Untitled Connector', // Default name if none provided
        category: values.category,
        config,
        eventsEnabled: true, // Add the required eventsEnabled property
      };

      // Add yolinkHomeId for YoLink connectors (required)
      if (values.category === 'yolink') {
        if (!yolinkHomeId) {
          toast.error('Cannot save connector without YoLink Home ID');
          setLoading(false);
          return; // Ensure we don't proceed without home ID
        }
        nodePayload.yolinkHomeId = yolinkHomeId;
      }

      // Explicitly define payload structure for API calls
      const apiPayload = {
        name: nodePayload.name,
        category: nodePayload.category,
        config: nodePayload.config,
        yolinkHomeId: nodePayload.yolinkHomeId, // Include yolinkHomeId in API payload
        eventsEnabled: nodePayload.eventsEnabled,
      };

      let response: Response;
      let successMessage = '';

      if (isEditMode && editingNode) {
        nodePayload.id = editingNode.id;
        response = await fetch(`/api/nodes/${editingNode.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiPayload), 
        });
        successMessage = 'Connector updated successfully!';
      } else {
        response = await fetch('/api/nodes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiPayload), 
        });
        successMessage = 'Connector added successfully!';
      }

      const data = await response.json();

      if (response.ok && data.success) {
        if (isEditMode) {
          updateNode(data.data);
        } else {
          addNode(data.data);
        }
        toast.success(successMessage);
        currentSetOpenState(false);
        form.reset();
        setTestResult(null);
        setPikoWizardStep('credentials');
        setPikoSystems([]);
        if (isEditMode) setEditingNode(null);
      } else {
        const errorMsg = data.error || (isEditMode ? 'Failed to update connector' : 'Failed to create connector');
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('Error submitting connector:', error);
      const errorMsg = isEditMode ? 'Failed to update connector' : 'Failed to create connector';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    try {
      setIsTestingConnection(true);
      setTestResult(null);
      
      // Validate the form using react-hook-form's built-in validation
      const isValid = await form.trigger();
      if (!isValid) {
        setTestResult({
          success: false,
          message: 'Please fill in all required fields.',
        });
        return;
      }
      
      // Form is valid, proceed with the test
      const values = form.getValues();
      const driver = values.category;
      
      // For Piko, we'll handle testing differently based on the wizard step
      if (driver === 'piko') {
        if (pikoWizardStep === 'credentials') {
          // For Piko in credentials step, we'll fetch systems instead of testing
          fetchPikoSystems();
          return;
        } else if (pikoWizardStep === 'system-selection') {
          // For Piko in system selection, we'll just validate that a system is selected
          if (!values.selectedSystem) {
            setTestResult({
              success: false,
              message: 'Please select a system.',
            });
            return;
          }
          setTestResult({
            success: true,
            message: 'System selected successfully!',
          });
          return;
        }
      }
      
      // Handle YoLink testing
      // Prepare the configuration based on the selected category
      let testConfig: YoLinkConfig | undefined;
      
      if (driver === 'yolink') {
        testConfig = {
          uaid: values.uaid || '',
          clientSecret: values.clientSecret || '',
        };
        
        console.log('Testing YoLink connection with:',  
          { uaid: values.uaid?.substring(0, 3) + '***', clientSecret: '***' });
      }

      // Test the connection via backend
      toast.loading('Testing connection...', { id: 'connection-test' });
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          driver,
          config: testConfig,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.dismiss('connection-test');
        if (data.data.connected) {
          toast.success('Connection test successful!');
          
          // If it's a YoLink connection, try to get the Home ID
          if (driver === 'yolink' && data.data.homeId) {
            // Store it in the form for submission
            form.setValue('yolinkHomeId', data.data.homeId);
            
            setTestResult({
              success: true,
              message: `Connection successful! YoLink Home ID: ${data.data.homeId.substring(0, 8)}...`,
            });
          } else {
            setTestResult({
              success: true,
              message: data.data.message || 'Connection successful!',
            });
          }
        } else {
          toast.error('Connection test failed');
          setTestResult({
            success: false,
            message: data.data.message || 'Connection failed. Please check your credentials and try again.',
          });
        }
      } else {
        toast.dismiss('connection-test');
        toast.error('Connection test failed');
        setTestResult({
          success: false,
          message: data.error || 'Connection test failed',
        });
      }
    } catch (error) {
      toast.dismiss('connection-test');
      toast.error('Connection test failed');
      console.error('Error testing connection:', error);
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed unexpectedly',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <Dialog open={currentOpenState} onOpenChange={currentSetOpenState}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode 
              ? 'Edit Connector' 
              : isPiko 
                ? pikoWizardStep === 'credentials' 
                  ? 'Add Piko Connector - Step 1' 
                  : 'Add Piko Connector - Step 2'
                : 'Add New Connector'
            }
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? `Update the details for the connector: ${editingNode?.name || ''}`
              : isPiko
                ? pikoWizardStep === 'credentials'
                  ? 'Enter your Piko account credentials.'
                  : 'Select your Piko system.'
                : 'Set up a new integration to connect with external systems or services.'}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information Section - only shown in non-Piko or edit modes */}
            {(!isPiko || isEditMode) && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connector Type</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Reset kind and test result when category changes
                          setTestResult(null);
                        }}
                        defaultValue={field.value}
                        disabled={isEditMode}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select connector type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="piko">Piko</SelectItem>
                          <SelectItem value="yolink">YoLink</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Show name field for all connectors, but disable it for Piko */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connector Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., My YoLink Hub" 
                          {...field} 
                          disabled={isPiko}
                          className={isPiko ? "bg-muted text-muted-foreground" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            
            {/* Divider - only if we had previous fields */}
            {(!isPiko || isEditMode) && <div className="h-px bg-border" />}
            
            {/* YoLink Settings Section */}
            {selectedCategory === 'yolink' && (
              <div className="space-y-4">
                {/* Display YoLink Home ID in edit mode */}
                {isEditMode && form.getValues("yolinkHomeId") && (
                  <FormField
                    control={form.control}
                    name="yolinkHomeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>YoLink Home ID</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            disabled={true}
                            className="bg-muted text-muted-foreground"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          This ID was automatically fetched from YoLink.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                )}
                
                <FormField
                  control={form.control}
                  name="uaid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UAID</FormLabel>
                      <FormControl>
                        <Input type="text" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="clientSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Secret</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormDescription className="mt-2 text-xs">
                  Find your UAID and Client Secret in the YoLink App (Account &gt; Advanced Settings &gt; Personal Access Credentials).{' '}
                  <a href="http://doc.yosmart.com/docs/overall/qsg_uac" target="_blank" rel="noopener noreferrer" className="underline">
                    Learn more
                  </a>.
                </FormDescription>
              </div>
            )}
            
            {/* Piko Settings Section - Credentials Step */}
            {isPiko && pikoWizardStep === 'credentials' && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection Type</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          setTestResult(null);
                        }}
                        defaultValue={field.value}
                        disabled={true} // Always disabled as we only support cloud for now
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select connection type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cloud">Cloud</SelectItem>
                          <SelectItem value="local" disabled>Local Network (Coming Soon)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input 
                          autoComplete="new-password" 
                          {...field} 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const values = form.getValues();
                              if (values.username && values.password) {
                                testConnection();
                              }
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          autoComplete="new-password" 
                          {...field} 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const values = form.getValues();
                              if (values.username && values.password) {
                                testConnection();
                              }
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            
            {/* Piko Settings Section - System Selection Step */}
            {isPiko && pikoWizardStep === 'system-selection' && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="selectedSystem"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Your Piko System</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Set the name automatically when a system is selected
                          const selectedSystem = pikoSystems.find(s => s.id === value);
                          if (selectedSystem) {
                            form.setValue('name', selectedSystem.name);
                          }
                          setTestResult(null);
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a system" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pikoSystems
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(system => (
                            <SelectItem key={system.id} value={system.id}>
                              <div className="flex items-center">
                                <span className="mr-2">{system.name}</span>
                                {system.health === 'online' && (
                                  <span className="h-2 w-2 rounded-full bg-green-500" />
                                )}
                                {system.health === 'offline' && (
                                  <span className="h-2 w-2 rounded-full bg-red-500" />
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.value && (
                        <div className="mt-2 text-sm">
                          {(() => {
                            const selectedSystem = pikoSystems.find(s => s.id === field.value);
                            if (selectedSystem) {
                              return (
                                <>
                                  <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field: nameField }) => (
                                      <FormItem className="mb-2">
                                        <FormLabel>Connector Name</FormLabel>
                                        <FormControl>
                                          <Input 
                                            {...nameField} 
                                            disabled={true}
                                            className="bg-muted text-muted-foreground"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  
                                  <div className="space-y-1 p-2 rounded border">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Status:</span>
                                      <span className={selectedSystem.health === 'online' ? 'text-green-500' : 'text-red-500'}>
                                        {selectedSystem.health || 'Unknown'}
                                      </span>
                                    </div>
                                    {selectedSystem.version && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Version:</span>
                                        <span>{selectedSystem.version}</span>
                                      </div>
                                    )}
                                    {selectedSystem.role && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Your Role:</span>
                                        <span className="capitalize">{selectedSystem.role}</span>
                                      </div>
                                    )}
                                  </div>
                                </>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                      <FormDescription className="text-xs">
                        Select the Piko system you want to connect to.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            
            {/* Test Result Section */}
            {testResult && (
              <div className={`p-3 rounded-md ${
                testResult.success 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {testResult.message}
              </div>
            )}
            
            {/* Actions Section */}
            <div className="pt-2">
              <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
                {/* Show different buttons based on category and step */}
                {selectedCategory && (
                  <>
                    {/* Back button for Piko wizard steps */}
                    {isPiko && (
                      <>
                        {pikoWizardStep === 'credentials' && (
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              form.setValue('category', '');
                              setTestResult(null);
                            }}
                            className="w-full sm:w-auto mr-auto"
                          >
                            Back
                          </Button>
                        )}
                        {pikoWizardStep === 'system-selection' && (
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              setPikoWizardStep('credentials');
                              setTestResult(null);
                            }}
                            className="w-full sm:w-auto mr-auto"
                          >
                            Back
                          </Button>
                        )}
                      </>
                    )}
                    
                    {/* Next/Test button - Only shown on step 1 for Piko */}
                    {(!isPiko || (isPiko && pikoWizardStep === 'credentials')) && (
                      <Button 
                        type="button"
                        variant="outline"
                        onClick={testConnection}
                        disabled={
                          isTestingConnection || 
                          isFetchingSystems || 
                          (isPiko && 
                           pikoWizardStep === 'credentials' && 
                           (!form.getValues('username') || !form.getValues('password')))
                        }
                        className="w-full sm:w-auto"
                      >
                        {isTestingConnection || isFetchingSystems ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {isPiko ? 'Next' : 'Test Connection'}
                      </Button>
                    )}
                    
                    {/* Only show Add Connector on second step for Piko */}
                    {(!isPiko || (isPiko && pikoWizardStep === 'system-selection')) && (
                      <Button 
                        type="submit" 
                        className="w-full sm:w-auto" 
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {isEditMode ? 'Update Connector' : 'Add Connector'}
                      </Button>
                    )}
                  </>
                )}
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 