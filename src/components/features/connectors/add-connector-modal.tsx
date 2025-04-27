import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFusionStore } from '@/stores/store';
import { toast } from "sonner";
import { ConnectorWithConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto'; // Import Node crypto for secret generation
import { formatConnectorCategory } from '@/lib/utils'; // Import formatConnectorCategory
import { cn } from '@/lib/utils'; // Import cn utility

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
import { Loader2, Copy, RefreshCcw, Eye, EyeOff } from 'lucide-react';
import { ConnectorIcon } from './connector-icon';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";

// Define connector types for the dropdown
const connectorOptions = [
  { value: 'netbox', label: 'NetBox', mechanism: 'Webhook' },
  { value: 'piko', label: 'Piko', mechanism: 'WebSockets' },
  { value: 'yolink', label: 'YoLink', mechanism: 'MQTT' },
  { value: 'genea', label: 'Genea', mechanism: 'Webhook' },
];

// Sort options alphabetically by label
connectorOptions.sort((a, b) => a.label.localeCompare(b.label));

// Define config types
interface YoLinkConfig {
  uaid: string;
  clientSecret: string;
  homeId?: string;
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

// Add NetBox config type
interface NetBoxConfig {
  webhookId: string;
  webhookSecret?: string; // Added webhookSecret
}

// Add Genea config type
interface GeneaConfig {
  webhookId: string;
  apiKey: string; // Added apiKey
  webhookSecret: string; // Added webhookSecret
}

type ConnectorConfig = YoLinkConfig | PikoConfig | NetBoxConfig | GeneaConfig; // Added GeneaConfig

// Form schema
const formSchema = z.object({
  name: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  
  // YoLink fields
  uaid: z.string().optional(),
  clientSecret: z.string().optional(),
  
  // Piko fields
  type: z.enum(['cloud']).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  selectedSystem: z.string().optional(), // Keep optional here, validation done in onSubmit/wizard logic

  // NetBox fields
  webhookSecret: z.string().optional(), // Optional globally, required specifically for Genea via refine

  // Genea fields
  apiKey: z.string().optional(), // Added API Key field
}).superRefine((data, ctx) => {
  // Use superRefine to add errors to specific field paths
  if (data.category === 'yolink') {
    if (!data.uaid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'UAID is required',
        path: ['uaid'],
      });
    }
    if (!data.clientSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Client Secret is required',
        path: ['clientSecret'],
      });
    }
  } else if (data.category === 'piko') {
    // Validate credential fields for Piko (system selection is handled in onSubmit/wizard logic)
    if (!data.username) {
       ctx.addIssue({
         code: z.ZodIssueCode.custom,
         message: 'Username is required',
         path: ['username'],
       });
     }
     if (!data.password) {
       ctx.addIssue({
         code: z.ZodIssueCode.custom,
         message: 'Password is required',
         path: ['password'],
       });
     }
  } else if (data.category === 'genea') {
    if (!data.apiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'API Key is required',
        path: ['apiKey'],
      });
    }
    // Require webhookSecret for Genea
    if (!data.webhookSecret) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Webhook Secret is required for Genea',
            path: ['webhookSecret'],
        });
    }
  }
  // NetBox has no client-side required fields in this form currently.
  // selectedSystem for Piko is validated during the wizard flow/onSubmit, not here.

  // Add validation for Name field for NetBox and Genea
  if ((data.category === 'netbox' || data.category === 'genea') && !data.name) {
    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Connector Name is required',
        path: ['name'],
    });
  }
});

type FormValues = z.infer<typeof formSchema>;

// Define the wizard steps for Piko
type PikoWizardStep = 'credentials' | 'system-selection';

export function AddConnectorModal() {
  const {
    isAddConnectorOpen,
    setAddConnectorOpen,
    isEditConnectorOpen,
    setEditConnectorOpen,
    editingConnector,
    setEditingConnector,
    addConnector,
    updateConnector,
    setLoading,
    setError,
    isLoading
  } = useFusionStore();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testedYoLinkHomeId, setTestedYoLinkHomeId] = useState<string | null>(null);
  
  // Wizard state for Piko
  const [pikoWizardStep, setPikoWizardStep] = useState<PikoWizardStep>('credentials');
  const [pikoSystems, setPikoSystems] = useState<Array<{ id: string, name: string, health?: string, role?: string, version?: string }>>([]);
  const [isFetchingSystems, setIsFetchingSystems] = useState(false);
  const [pikoToken, setPikoToken] = useState<{ accessToken: string, refreshToken: string, expiresAt: string } | null>(null);
  const [generatedWebhookId, setGeneratedWebhookId] = useState<string | null>(null);
  const [generatedWebhookSecret, setGeneratedWebhookSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      category: '',
      uaid: '',
      clientSecret: '',
      type: 'cloud',
      username: '',
      password: '',
      selectedSystem: '',
      webhookSecret: '',
      apiKey: '',
    },
  });

  const isEditMode = !!editingConnector;
  const currentOpenState = isEditMode ? isEditConnectorOpen : isAddConnectorOpen;
  const currentSetOpenState = isEditMode ? setEditConnectorOpen : setAddConnectorOpen;

  // Reset form to initial state
  const resetForm = useCallback(() => {
    form.reset({
      name: '',
      category: '',
      uaid: '',
      clientSecret: '',
      type: 'cloud',
      username: '',
      password: '',
      selectedSystem: '',
      webhookSecret: '',
      apiKey: '',
    });
    setTestResult(null);
    setTestedYoLinkHomeId(null);
    setPikoWizardStep('credentials');
    setPikoSystems([]);
  }, [form]);

  useEffect(() => {
    if (isEditMode && editingConnector) {
      let configValues = {};
      if (editingConnector.category === 'yolink' && editingConnector.config) {
        const yolinkConfig = editingConnector.config as YoLinkConfig;
        configValues = {
          uaid: yolinkConfig.uaid || '',
          clientSecret: yolinkConfig.clientSecret || '',
        };
      } else if (editingConnector.category === 'piko' && editingConnector.config) {
        const pikoConfig = editingConnector.config as PikoConfig;
        configValues = {
          type: pikoConfig.type || 'cloud',
          username: pikoConfig.username || '',
          password: pikoConfig.password || '',
          selectedSystem: pikoConfig.selectedSystem || '',
        };
      } else if (editingConnector.category === 'netbox' && editingConnector.config) {
        const netboxConfig = editingConnector.config as NetBoxConfig;
        configValues = {
          webhookSecret: netboxConfig.webhookSecret || '',
        };
      } else if (editingConnector.category === 'genea' && editingConnector.config) {
        const geneaConfig = editingConnector.config as GeneaConfig;
        configValues = {
          apiKey: geneaConfig.apiKey || '',
          webhookSecret: geneaConfig.webhookSecret || '',
        };
      }

      const defaultValues: Partial<FormValues> = {
        name: editingConnector.name || '',
        category: editingConnector.category,
        ...configValues,
      };
      
      // Ensure webhookId is not passed to reset, as it's not in FormValues
      const { webhookId, ...formSafeDefaultValues } = defaultValues as any;
      
      form.reset(formSafeDefaultValues);
    } else {
      resetForm();
    }
  }, [editingConnector, isEditMode, form, resetForm]);

  useEffect(() => {
    if (!currentOpenState) {
      if (isEditMode) {
        setEditingConnector(null);
      }
      resetForm();
      setTestedYoLinkHomeId(null);
    }
  }, [currentOpenState, isEditMode, setEditingConnector, resetForm]);

  const selectedCategory = form.watch('category');

  // Effect to generate webhookId when NetBox or Genea is selected for a NEW connector
  useEffect(() => {
    if (!isEditMode && (selectedCategory === 'netbox' || selectedCategory === 'genea')) {
      setGeneratedWebhookId(uuidv4());
      // Only generate/set secret for NetBox
      if (selectedCategory === 'netbox') {
        const newSecret = crypto.randomBytes(32).toString('hex');
        setGeneratedWebhookSecret(newSecret);
        form.setValue('webhookSecret', newSecret); // Set initial generated secret in form
      } else {
        // Clear secret state/form value if Genea is selected
        setGeneratedWebhookSecret(null);
        form.setValue('webhookSecret', '');
      }
    } else if (!isEditMode) {
      // Reset if category changes away from webhook types or on initial load in add mode
      setGeneratedWebhookId(null);
      setGeneratedWebhookSecret(null);
      form.setValue('webhookSecret', ''); // Clear secret in form
      form.setValue('apiKey', ''); // Clear API key in form
    }
    // Intentionally only run when isEditMode or selectedCategory changes
  }, [isEditMode, selectedCategory, form]); // Added form dependency for setValue

  // Effect to clear generated IDs/secrets when modal closes
  useEffect(() => {
    if (!currentOpenState) {
      setGeneratedWebhookId(null);
      setGeneratedWebhookSecret(null);
    }
  }, [currentOpenState]);

  const isPiko = selectedCategory === 'piko';

  // Determine if the Copy button for webhook URL should be shown
  const shouldShowCopyButton = 
    (isEditMode && 
      ((editingConnector?.config as NetBoxConfig | GeneaConfig)?.webhookId))
    || 
    (!isEditMode && generatedWebhookId);

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
      
      const response = await fetch('/api/piko/systems', {
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
        // Reset to credentials step if auth fails
        setPikoWizardStep('credentials'); 
        toast.error(data.error || 'Failed to fetch Piko systems');
      }
    } catch (error) {
      console.error('Error fetching Piko systems:', error);
      toast.dismiss('fetch-piko-systems');
      // Reset to credentials step on error
      setPikoWizardStep('credentials'); 
      toast.error('Failed to fetch Piko systems');
    } finally {
      setIsFetchingSystems(false);
    }
  };

  const onSubmit = async (values: FormValues) => { 
    console.log("--- onSubmit entered ---"); 
    // --- Re-enabling onSubmit function ---
    if (isPiko && pikoWizardStep === 'system-selection' && !values.selectedSystem) {
      toast.error('Please select a system');
      return;
    }
    
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      let config: Partial<ConnectorConfig> | undefined; 

      if (values.category === 'yolink') {
        config = {
          uaid: values.uaid || '',
          clientSecret: values.clientSecret || '',
          homeId: testedYoLinkHomeId ?? undefined, 
        };
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
      } else if (values.category === 'netbox') {
        config = {
          webhookId: isEditMode ? undefined : generatedWebhookId ?? undefined, 
          webhookSecret: values.webhookSecret || undefined, 
        };
      } else if (values.category === 'genea') {
        config = {
          webhookId: isEditMode ? undefined : generatedWebhookId ?? undefined,
          apiKey: values.apiKey || '',
          webhookSecret: values.webhookSecret || undefined, // Include webhookSecret
        };
      }

      const apiPayload: { name: string; category: string; config?: Partial<ConnectorConfig> } = {
        name: values.name || `${formatConnectorCategory(values.category)} Connector`, 
        category: values.category,
      };

      if ( (values.category !== 'netbox' && values.category !== 'genea') || // If not a webhook type
           isEditMode || // Or if editing any type
           (!isEditMode && generatedWebhookId) ) { // Or if adding a new webhook type and ID is generated
        apiPayload.config = config || {}; 
      }

      let response: Response;
      let successMessage = '';

      if (isEditMode && editingConnector) {
        response = await fetch(`/api/connectors/${editingConnector.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: apiPayload.name, config: apiPayload.config }), 
        });
        successMessage = 'Connector updated successfully!';
      } else {
        response = await fetch('/api/connectors', {
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
          updateConnector(data.data);
        } else {
          addConnector(data.data);
        }
        toast.success(successMessage);
        currentSetOpenState(false);
        form.reset();
        setTestResult(null);
        setTestedYoLinkHomeId(null);
        setPikoWizardStep('credentials');
        setPikoSystems([]);
        if (isEditMode) setEditingConnector(null);
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
    // --- END TEMPORARY DISABLE ---
    // console.log("--- onSubmit temporarily disabled --- "); 
  };

  const testConnection = async () => {
    try {
      setIsTestingConnection(true);
      setTestResult(null);
      setTestedYoLinkHomeId(null);
      
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
      
      // Prepare config for the specific driver test
      let testApiConfig: Partial<ConnectorConfig> = {}; // Use Partial<ConnectorConfig>
      
      if (driver === 'yolink') {
        testApiConfig = {
          uaid: values.uaid || '',
          clientSecret: values.clientSecret || '',
        };
        console.log('Testing YoLink connection with:',  
          { uaid: values.uaid?.substring(0, 3) + '***', clientSecret: '***' });
      } else if (driver === 'genea') { // Add Genea case
        testApiConfig = {
          apiKey: values.apiKey || '',
        };
         console.log('Testing Genea connection...');
      }
      // Piko test is handled separately above by fetching systems

      // Test the connection via backend
      toast.loading('Testing connection...', { id: 'connection-test' });
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          driver,
          config: testApiConfig, // Send the prepared config
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.dismiss('connection-test');
        if (data.data.connected) {
          toast.success('Connection test successful!');
          
          // If it's a YoLink connection, try to get the Home ID
          if (driver === 'yolink' && data.data.homeId) {
            // Store it in the component state, not the form
            setTestedYoLinkHomeId(data.data.homeId);
            
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
                : selectedCategory === 'netbox' // Add title for NetBox
                  ? 'NetBox Configuration'
                  : selectedCategory === 'genea' // Add title for Genea
                    ? 'Genea Configuration'
                    : 'Add New Connector'
            }
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? `Update the details for the connector: ${editingConnector?.name || ''}`
              : isPiko
                ? pikoWizardStep === 'credentials'
                  ? 'Enter your Piko account credentials.'
                  : 'Select your Piko system.'
                : selectedCategory === 'netbox' // Add description for NetBox
                  ? 'Configure a webhook endpoint for NetBox integration.'
                  : selectedCategory === 'genea' // Add description for Genea
                    ? 'Configure a webhook endpoint and API key for Genea.'
                    : 'Set up a new integration to connect with external systems or services.'}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information Section */}
            <div className="space-y-4">
              {/* Category Field - Always show, disable in edit mode */}
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
                          setTestedYoLinkHomeId(null);
                        }}
                        defaultValue={field.value}
                        disabled={isEditMode}
                      >
                        <FormControl>
                          <SelectTrigger>
                            {/* Custom render: Mechanism next to Name */}
                            {field.value ? (
                                <div className="flex w-full items-center"> { /* Outer container */ }
                                  <div className="flex items-center gap-2"> { /* Icon + Text block */ }
                                    <ConnectorIcon connectorCategory={field.value} size={16} />
                                    <div className="flex items-baseline gap-1.5"> { /* Name + Mechanism block */ }
                                      <span>{connectorOptions.find(opt => opt.value === field.value)?.label}</span>
                                      <div className="text-xs text-muted-foreground">
                                        {connectorOptions.find(opt => opt.value === field.value)?.mechanism}
                                      </div>
                                    </div>
                                  </div>
                                  {/* Removed the justify-between part */}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Select connector type</span> // Placeholder text
                              )}
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {/* Dynamically render sorted options with icons and mechanism */}
                          {connectorOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2"> 
                                <ConnectorIcon connectorCategory={option.value} size={16} />
                                <div> { /* Container for label and mechanism */ }
                                  <span>{option.label}</span>
                                  <div className="text-xs text-muted-foreground">{option.mechanism}</div> { /* Mechanism subtitle */ }
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Name Field - Show unless adding a new Piko connector */}
                {(isEditMode || selectedCategory !== 'piko') && (
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Connector Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={
                              selectedCategory === 'yolink' ? "e.g., My YoLink Hub" :
                              selectedCategory === 'piko' ? "e.g., Main Piko System" :
                              selectedCategory === 'netbox' ? "e.g., NetBox Webhook" : // Placeholder for NetBox
                              selectedCategory === 'genea' ? "e.g., Genea Webhook" : // Placeholder for Genea
                              "Connector Name"
                            } 
                            {...field} 
                            className={cn(fieldState.invalid && 'border-destructive')}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {/* Divider for NetBox/Genea after Name field */}
                {(selectedCategory === 'netbox' || selectedCategory === 'genea') && <div className="h-px bg-border my-4" />}
              </div>
            
            {/* Divider only before YoLink section */}
            {selectedCategory === 'yolink' && <div className="h-px bg-border my-4" />}
            
            {/* YoLink Settings Section */}
            {selectedCategory === 'yolink' && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="uaid"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>UAID</FormLabel>
                      <FormControl>
                        <Input 
                          type="text" 
                          autoComplete="new-password" 
                          {...field} 
                          className={cn(fieldState.invalid && 'border-destructive')}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="clientSecret"
                  render={({ field, fieldState }) => (
                     <FormItem>
                      <FormLabel>Client Secret</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          autoComplete="new-password" 
                          {...field} 
                          className={cn(fieldState.invalid && 'border-destructive')}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormDescription className="mt-2 text-xs">
                  Find credentials in YoLink App (Account &gt; Advanced Settings). <a href="http://doc.yosmart.com/docs/overall/qsg_uac" target="_blank" rel="noopener noreferrer" className="underline">Learn more</a>.
                </FormDescription>
              </div>
            )}
            
            {/* Add Divider specifically for Piko Step 1 */}
            {selectedCategory === 'piko' && pikoWizardStep === 'credentials' && <div className="h-px bg-border my-4" />}
            
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
                        disabled={true}
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
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input 
                          autoComplete="new-password" 
                          {...field} 
                          className={cn(fieldState.invalid && 'border-destructive')}
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
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          autoComplete="new-password" 
                          {...field} 
                          className={cn(fieldState.invalid && 'border-destructive')}
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
                                <span>{system.name}</span>
                                {system.health === 'online' && (
                                  <span className="ml-2 h-2 w-2 rounded-full bg-green-500" />
                                )}
                                {system.health === 'offline' && (
                                  <span className="ml-2 h-2 w-2 rounded-full bg-red-500" />
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
            
            {/* NetBox or Genea Settings Section */}
            {(selectedCategory === 'netbox' || selectedCategory === 'genea') && (
              <div className="space-y-4">
                 <FormItem>
                   <FormLabel>Webhook URL</FormLabel>
                   <FormControl>
                     {/* Improved input group styling */}
                     <div className="relative flex items-center">
                       <Input
                         type="text"
                         readOnly
                         value={
                           isEditMode && ((editingConnector?.config as NetBoxConfig)?.webhookId || (editingConnector?.config as GeneaConfig)?.webhookId)
                             ? `${window.location.origin}/api/webhooks/${(editingConnector?.config as NetBoxConfig | GeneaConfig).webhookId}` 
                             : !isEditMode && generatedWebhookId
                               ? `${window.location.origin}/api/webhooks/${generatedWebhookId}`
                               : "Generating ID..." // Show temporary text while ID generates
                         }
                         // Apply shadcn input styles + padding for button + read-only look
                         className="pr-12 bg-muted text-muted-foreground read-only:focus:ring-0 read-only:focus:ring-offset-0"
                       />
                       {/* Show copy button in edit mode OR add mode once ID is generated */}
                       {shouldShowCopyButton ? (
                         <Button
                           type="button"
                           variant="ghost"
                           size="icon"
                           // Position button inside the input area
                           className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                           onClick={() => {
                             const webhookId = isEditMode 
                               ? (editingConnector?.config as NetBoxConfig | GeneaConfig).webhookId 
                               : generatedWebhookId;
                             navigator.clipboard.writeText(
                               `${window.location.origin}/api/webhooks/${webhookId}`
                             );
                             toast.success("Webhook URL copied to clipboard!");
                           }}
                         >
                           <Copy className="h-4 w-4" />
                           <span className="sr-only">Copy URL</span>
                         </Button>
                       ) : null}
                     </div>
                   </FormControl>
                   <FormDescription className="mt-2 text-xs">
                    {selectedCategory === 'genea' ? (
                        <>
                            Configure <strong>{formatConnectorCategory(selectedCategory)}</strong> to deliver events to this URL. <a href="https://help.getgenea.com/en/articles/1292571-genea-events-webhook#how-to-configure-webhooks-with-your-genea-dashboard" target="_blank" rel="noopener noreferrer" className="underline">Learn more</a>.
                        </>
                    ) : selectedCategory === 'netbox' ? (
                        <>
                            Configure <strong>Fusion Agent</strong> to subscribe to <strong>{formatConnectorCategory(selectedCategory)}</strong> events and deliver them to this webhook URL.
                        </>
                    ) : (
                        // Fallback should ideally not be reached if category is always netbox or genea here
                        `Configure ${formatConnectorCategory(selectedCategory)} to use this webhook URL.`
                    )}
                   </FormDescription>
                 </FormItem>

                 {/* Webhook Secret Field - Common for NetBox & Genea */}
                 {(selectedCategory === 'netbox' || selectedCategory === 'genea') && (
                   <FormField
                      control={form.control}
                      name="webhookSecret"
                      render={({ field, fieldState }) => (
                          <FormItem>
                          <FormLabel>Webhook Secret</FormLabel>
                          <FormControl>
                              <div className="relative flex items-center">
                              <Input
                                  type={showSecret ? 'text' : 'password'}
                                  placeholder={selectedCategory === 'genea' ? "Enter Genea webhook secret" : ""}
                                  readOnly={selectedCategory === 'netbox'}
                                  {...field}
                                  className={cn(
                                      "peer",
                                      selectedCategory === 'netbox' ? "pr-28 bg-muted" : "pr-16",
                                      fieldState.invalid && 'border-destructive'
                                  )}
                              />
                              <div className="absolute right-1 flex space-x-1">
                                  {/* Regenerate button - Only for NetBox */}
                                  {selectedCategory === 'netbox' && (
                                    <Tooltip delayDuration={300}>
                                      <TooltipTrigger asChild>
                                          <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                              onClick={(e) => { 
                                                e.preventDefault(); 
                                                const newSecret = crypto.randomBytes(32).toString('hex');
                                                form.setValue('webhookSecret', newSecret, { shouldValidate: true });
                                                setGeneratedWebhookSecret(newSecret);
                                                toast.info("New secret generated. Click Update Connector to save.");
                                                setShowSecret(true); 
                                              }}
                                          >
                                              <RefreshCcw className="h-4 w-4" />
                                              <span className="sr-only">Reset Secret</span>
                                          </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Generate a new secret.<br/>Click Update Connector to save.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  {/* Copy button - If value exists */} 
                                  {field.value && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                          navigator.clipboard.writeText(field.value || '');
                                          toast.success("Webhook Secret copied to clipboard!");
                                        }}
                                        title="Copy secret"
                                      >
                                        <Copy className="h-4 w-4" />
                                        <span className="sr-only">Copy Secret</span>
                                      </Button>
                                  )}
                                  {/* Show/Hide button - If value exists */} 
                                  {field.value && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        onClick={() => setShowSecret(!showSecret)}
                                        title={showSecret ? 'Hide secret' : 'Show secret'}
                                      >
                                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        <span className="sr-only">{showSecret ? 'Hide' : 'Show'} Secret</span>
                                      </Button>
                                  )}
                              </div>
                              </div>
                          </FormControl>
                          {/* Add description for NetBox */}
                          {selectedCategory === 'netbox' && (
                              <FormDescription className="mt-2 text-xs">
                                  Used to verify the signature of incoming webhook requests from <strong>Fusion Agent</strong>.
                              </FormDescription>
                          )}
                          {/* Add description with link for Genea */}
                          {selectedCategory === 'genea' && (
                              <FormDescription className="mt-2 text-xs">
                                  Used to verify the signature of incoming webhook requests from <strong>{formatConnectorCategory(selectedCategory)}</strong>. <a href="https://help.getgenea.com/en/articles/1292571-genea-events-webhook#webhook-security-with-payload-signature" target="_blank" rel="noopener noreferrer" className="underline">Learn more</a>.
                              </FormDescription>
                          )}
                          </FormItem>
                      )}
                    />
                 )}

                 {/* Add separator before API Key only for Genea */}
                 {selectedCategory === 'genea' && <div className="h-px bg-border my-4" />}

                 {/* API Key Field - Only for Genea */}
                 {selectedCategory === 'genea' && (
                   <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field, fieldState }) => (
                        <FormItem>
                        <FormLabel>API Key</FormLabel>
                        <FormControl>
                            <Input
                                type="password" // Use password type for masking
                                placeholder="Enter your Genea API Key"
                                autoComplete="new-password"
                                {...field}
                                className={cn(fieldState.invalid && 'border-destructive')}
                            />
                        </FormControl>
                        {/* Add description with link for Genea API Key */}
                        <FormDescription className="mt-2 text-xs">
                           Used to authenticate API requests to <strong>{formatConnectorCategory(selectedCategory)}</strong>. <a href="https://help.getgenea.com/en/articles/5366419-global-overview-api-keys" target="_blank" rel="noopener noreferrer" className="underline">Learn more</a>.
                        </FormDescription>
                        </FormItem>
                    )}
                    />
                 )}

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
              <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 justify-end">
                {/* Show different buttons based on category and step */}
                {selectedCategory && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full justify-between">
                    {/* Back button always on the left if applicable */}
                    <div className="flex-initial">
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
                                className="w-full sm:w-auto"
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
                                className="w-full sm:w-auto"
                              >
                                Back
                              </Button>
                            )}
                          </>
                        )}
                        {/* Add Back button for NetBox/Genea to go back to category selection? */} 
                        {/* Consider if needed - for now, only Piko has a clear back step */}
                    </div>

                    {/* Right-aligned action buttons */}                    
                    <div className="flex flex-col sm:flex-row gap-2">
                        {/* Test/Next button - Show for YoLink, Piko (Credentials), Genea */}
                        {(selectedCategory === 'yolink' || selectedCategory === 'genea' || (selectedCategory === 'piko' && pikoWizardStep === 'credentials')) && (
                          <Button 
                            type="button"
                            variant="outline"
                            onClick={testConnection}
                            disabled={
                              isTestingConnection || 
                              isFetchingSystems || 
                              (selectedCategory === 'yolink' && (!form.getValues('uaid') || !form.getValues('clientSecret'))) ||
                              (selectedCategory === 'genea' && !form.getValues('apiKey')) ||
                              (isPiko && 
                               pikoWizardStep === 'credentials' && 
                               (!form.getValues('username') || !form.getValues('password')))
                            }
                            className="w-full sm:w-auto"
                          >
                            {isTestingConnection || isFetchingSystems ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null }
                            {isPiko ? 'Next' : 'Test Connection'}
                          </Button>
                        )}
                        
                        {/* Submit Button - Show for NetBox (directly), YoLink, Genea, Piko (System Selection) */}
                        {(selectedCategory === 'netbox' || selectedCategory === 'yolink' || selectedCategory === 'genea' || (selectedCategory === 'piko' && pikoWizardStep === 'system-selection')) && (
                          <Button 
                            type="submit" 
                            className="w-full sm:w-auto" 
                            disabled={isLoading}
                          >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {isEditMode ? 'Update Connector' : 'Add Connector'}
                          </Button>
                        )}
                    </div>
                  </div>
                )}
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}