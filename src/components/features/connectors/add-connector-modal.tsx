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
import * as React from 'react'; // Import React
import { Badge } from "@/components/ui/badge";

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
import { Cloud, EthernetPort } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  type: 'cloud' | 'local';
  username: string;
  password: string;
  host?: string;
  port?: number;
  selectedSystem?: string;
  token?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    expiresIn?: number | string;
    sessionId?: string;
  };
  ignoreTlsErrors?: boolean;
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
  type: z.enum(['cloud', 'local']).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  selectedSystem: z.string().optional(),
  host: z.string().optional(),
  port: z.coerce.number().optional(),
  ignoreTlsErrors: z.boolean().optional(),

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
     // Add validation for local Piko fields
     if (data.type === 'local') {
        if (!data.host) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Host/URL is required',
            path: ['host'],
          });
        }
        if (data.port === undefined || data.port === null || isNaN(data.port)) { // Check if port is a valid number
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Port is required',
            path: ['port'],
          });
        }
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
  const [testedGeneaCustomerUuid, setTestedGeneaCustomerUuid] = useState<string | null>(null);
  
  // Wizard state for Piko
  const [pikoWizardStep, setPikoWizardStep] = useState<PikoWizardStep>('credentials');
  const [pikoSystems, setPikoSystems] = useState<Array<{ id: string, name: string, health?: string, role?: string, version?: string }>>([]);
  const [isFetchingSystems, setIsFetchingSystems] = useState(false);
  const [pikoToken, setPikoToken] = useState<PikoConfig['token'] | null>(null);
  const [generatedWebhookId, setGeneratedWebhookId] = useState<string | null>(null);
  const [generatedWebhookSecret, setGeneratedWebhookSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [selectedPikoType, setSelectedPikoType] = useState<'cloud' | 'local'>('cloud');

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
      host: '',
      port: 7001,
      ignoreTlsErrors: false,
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
      host: '',
      port: 7001,
      ignoreTlsErrors: false,
    });
    setTestResult(null);
    setTestedYoLinkHomeId(null);
    setTestedGeneaCustomerUuid(null);
    setPikoWizardStep('credentials');
    setPikoSystems([]);
  }, [form]);

  useEffect(() => {
    // Reset wizard step for any mode change
    setPikoWizardStep('credentials');
    // Reset piko type for add mode or non-piko edit mode
    if (!isEditMode || (editingConnector && editingConnector.category !== 'piko')) {
        setSelectedPikoType('cloud');
    }

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
          host: pikoConfig.host || '',
          port: pikoConfig.port || undefined,
          ignoreTlsErrors: pikoConfig.ignoreTlsErrors || false,
        };
        // Set the Piko type state based on the connector being edited
        setSelectedPikoType(pikoConfig.type || 'cloud');
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
      resetForm(); // Resets form, wizard step, piko systems, but not selectedPikoType explicitly here
      setTestedYoLinkHomeId(null);
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

  // Function to fetch available Piko systems OR test local connection
  const fetchPikoSystems = async (): Promise<{
      connected: boolean;
      message?: string;
      token?: PikoConfig['token']; // Return token on success
      systems?: Array<{ id: string, name: string }>; // Return systems for cloud
    }> => {
    let result: { connected: boolean; message?: string; token?: PikoConfig['token']; systems?: Array<{ id: string, name: string }> } = { connected: false }; // Explicit type for result
    try {
      setIsFetchingSystems(true);
      // Get current form values
      const values = form.getValues();

      // Verify credentials are present
      if (!values.username || !values.password) {
        toast.error('Please enter username and password');
        result = { connected: false, message: 'Missing username or password' }; // Assign to typed result
        return result;
      }
       // Add local-specific validation
       if (values.type === 'local' && (!values.host || values.port === undefined || values.port === null || isNaN(Number(values.port)))) {
         toast.error('Please enter Host/URL and Port for local connection');
         result = { connected: false, message: 'Missing host or port' }; // Assign to typed result
         return result;
       }

      // Call the API to get systems (or test local connection)
      const apiEndpoint = '/api/piko/systems'; // Use the same endpoint for both cloud and local
      const toastAction = values.type === 'local' ? 'Testing local Piko connection...' : 'Authenticating with Piko...';

      toast.loading(toastAction, { id: 'piko-connect' });

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: values.type, // Pass type
          username: values.username,
          password: values.password,
          host: values.host, // Pass host
          port: values.port, // Pass port
          ignoreTlsErrors: values.ignoreTlsErrors // Ensure TLS flag is sent
        }),
      });

      const data = await response.json();
      toast.dismiss('piko-connect');

      if (data.success && data.token) { // Check for token presence as sign of success
          // Store the authentication token temporarily in component state
          setPikoToken(data.token);

          if (values.type === 'cloud') {
              // Existing cloud logic: check systems and move step
              if (data.systems && data.systems.length > 0) {
                  setPikoSystems(data.systems);
                  setPikoWizardStep('system-selection');
                  toast.success(`Found ${data.systems.length} Piko systems`);
                  result = { connected: true, message: `Found ${data.systems.length} systems`, token: data.token, systems: data.systems };
              } else {
                  toast.error('No Piko systems found for this account');
                  setPikoWizardStep('credentials'); // Stay on credentials
                  result = { connected: false, message: 'No systems found' };
              }
          } else {
              // Local logic: Connection successful, set test result (will be potentially overridden by system info fetch)
              setTestResult({ success: true, message: data.message || 'Local connection successful!' });
              // Don't change wizard step for local
              // toast.success(data.message || 'Local Piko connection successful!'); // Delay success toast until sysinfo fetch
              result = { connected: true, message: data.message || 'Local connection successful!', token: data.token };
          }

      } else {
          // Handle failure for both types
          setPikoWizardStep('credentials'); // Reset to credentials step on failure
          setTestResult({ success: false, message: data.error || 'Failed to connect to Piko' });
          toast.error(data.error || 'Failed to connect to Piko');
          result = { connected: false, message: data.error || 'Failed to connect' };
      }
    } catch (error) {
        console.error('Error testing Piko connection:', error);
        toast.dismiss('piko-connect');
        setPikoWizardStep('credentials'); // Reset to credentials step on error
        setTestResult({ success: false, message: 'Failed to connect to Piko' });
        toast.error('Failed to connect to Piko');
        result = { connected: false, message: 'Client-side error during connection test' };
    } finally {
        setIsFetchingSystems(false); // Use existing loading state var
    }
    return result; // Return the outcome
  };

  const testConnection = async () => {
    try {
      setIsTestingConnection(true);
      setTestResult(null);
      setTestedYoLinkHomeId(null);
      setTestedGeneaCustomerUuid(null);
      // Reset name field for local piko before test
      const currentValues = form.getValues();
      if (currentValues.category === 'piko' && currentValues.type === 'local') {
         form.setValue('name', ''); // Clear name before test
      }

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

      // Handle Piko test (calls fetchPikoSystems which now handles both types)
      if (driver === 'piko') {
        // This function handles the *initial* auth test for both cloud and local
        // We'll add the system info fetch *after* this returns successfully for local.
        // Renaming to clarify its primary role now
        const initialAuthResult = await fetchPikoSystems(); 

        // If it was a local test AND initial auth succeeded, fetch system info
        if (values.type === 'local' && initialAuthResult?.connected && initialAuthResult.token) {
           console.log('Local Piko auth successful, attempting to fetch system info...');
           toast.loading('Fetching system name...', { id: 'piko-sysinfo' });
           try {
             const sysInfoResponse = await fetch('/api/piko/system-info', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 config: { // Pass only necessary local config fields
                   type: 'local',
                   host: values.host,
                   port: values.port,
                   username: values.username, // Needed for context? API doesn't strictly need it if token is valid
                   password: values.password, // Needed for context?
                   ignoreTlsErrors: values.ignoreTlsErrors
                 },
                 token: initialAuthResult.token // Pass the token received from initial auth
               })
             });
             const sysInfoData = await sysInfoResponse.json();
             toast.dismiss('piko-sysinfo');

             if (sysInfoData.success && sysInfoData.name) {
                form.setValue('name', sysInfoData.name);
                toast.success(`Connection successful! System Name: ${sysInfoData.name}`);
                // Update testResult to reflect overall success including name fetch
                setTestResult({ success: true, message: `Connection successful! System Name: ${sysInfoData.name}` });
             } else {
                toast.warning('Connection successful, but failed to automatically fetch system name.');
                console.error('Failed to fetch Piko system info:', sysInfoData.error);
                // Keep the original success message from initial auth
                setTestResult({ success: true, message: initialAuthResult.message || 'Local connection successful!' });
             }
           } catch (sysInfoError) {
              toast.dismiss('piko-sysinfo');
              toast.warning('Connection successful, but failed to automatically fetch system name.');
              console.error('Error fetching Piko system info:', sysInfoError);
              setTestResult({ success: true, message: initialAuthResult.message || 'Local connection successful!' });
           }
        }
        // Note: We don't need to explicitly set testResult here anymore for the initial local auth success,
        // as it's handled by the fetchPikoSystems function OR the subsequent system info fetch logic above.
        // The fetchPikoSystems already sets testResult/toasts for cloud or initial local failures.
        return; // Stop further execution in testConnection for Piko
      }

      // Prepare config for other driver tests (YoLink, Genea)
      let testApiConfig: Partial<ConnectorConfig> = {};

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

          // Reset results before potentially setting new ones
          setTestedYoLinkHomeId(null); 
          setTestedGeneaCustomerUuid(null);

          // If it's a YoLink connection, try to get the Home ID
          if (driver === 'yolink' && data.data.homeId) {
            setTestedYoLinkHomeId(data.data.homeId);
            setTestResult({
              success: true,
              message: `Connection successful! YoLink Home ID: ${data.data.homeId.substring(0, 8)}...`,
            });
          } else if (driver === 'genea' && data.data.customerUuid) {
            // If it's a Genea connection, store the customerUuid
            setTestedGeneaCustomerUuid(data.data.customerUuid);
            setTestResult({
              success: true,
              message: data.data.message || 'Connection successful!', // Use message from API
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
      // Dismiss piko-specific toasts if they exist
      toast.dismiss('piko-connect');
      toast.dismiss('piko-sysinfo');
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

  const onSubmit = async (values: FormValues) => { 
    console.log("--- onSubmit entered ---"); 
    
    // Specific Piko validation before proceeding
    if (values.category === 'piko') {
        if (values.type === 'cloud' && pikoWizardStep === 'system-selection' && !values.selectedSystem) {
            toast.error('Please select a system');
            return;
        }
        // For local, ensure connection was tested successfully before submitting
        if (values.type === 'local' && !testResult?.success) {
            toast.error('Please test the local connection successfully before adding.');
            return;
        }
    }
    
    setLoading(true);
    setError(null);
    // Keep testResult visible until submission starts processing
    // setTestResult(null); 

    try {
      let config: Partial<ConnectorConfig> & { customerUuid?: string } = {}; 
      let fetchedCustomerUuidOnSubmit: string | null = null; // Store implicitly fetched UUID for add mode

      // --- Implicit Test for Genea Add --- 
      if (!isEditMode && values.category === 'genea') {
        console.log("Attempting implicit Genea API key verification on submit...");
        try {
          const testResponse = await fetch('/api/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              driver: 'genea', 
              config: { apiKey: values.apiKey } 
            }),
          });
          const testData = await testResponse.json();

          if (testData.success && testData.data.connected && testData.data.customerUuid) {
            fetchedCustomerUuidOnSubmit = testData.data.customerUuid;
            console.log(`Implicit verification successful. Customer UUID: ${fetchedCustomerUuidOnSubmit}`);
            // Optionally clear any previous explicit test error message if submit test passes
            setTestResult(null); 
          } else {
            const errorMsg = testData.data?.message || testData.error || 'Failed to verify API key and retrieve Customer UUID.';
            console.error("Implicit Genea verification failed:", errorMsg);
            toast.error(`Add Connector Failed: ${errorMsg}`);
            setError(errorMsg);
            setLoading(false);
            return; // Abort submission
          }
        } catch (error) {
          console.error("Error during implicit Genea verification:", error);
          const errorMsg = error instanceof Error ? error.message : 'Network error during API key verification.';
          toast.error(`Add Connector Failed: ${errorMsg}`);
          setError(errorMsg);
          setLoading(false);
          return; // Abort submission
        }
      }
      // --- End Implicit Test ---

      // --- Construct Config --- 
      if (values.category === 'yolink') {
        config = {
          uaid: values.uaid || '',
          clientSecret: values.clientSecret || '',
          homeId: testedYoLinkHomeId ?? undefined, 
        };
      } else if (values.category === 'piko') {
        if (values.type === 'cloud') {
            config = {
              type: 'cloud',
              username: values.username || '',
              password: values.password || '',
              selectedSystem: values.selectedSystem || '',
              token: pikoToken || undefined,
              ignoreTlsErrors: values.ignoreTlsErrors || false,
            };
        } else { // type === 'local'
            config = {
                type: 'local',
                username: values.username || '',
                password: values.password || '',
                host: values.host || '',
                port: values.port || 7001,
                token: pikoToken || undefined,
                ignoreTlsErrors: values.ignoreTlsErrors || false,
            };
        }
      } else if (values.category === 'netbox') {
        config = {
          webhookId: isEditMode ? undefined : generatedWebhookId ?? undefined, 
          webhookSecret: values.webhookSecret || undefined, 
        };
      } else if (values.category === 'genea') {
        const existingConfig = editingConnector?.config as GeneaConfig & { customerUuid?: string };
        config = {
          webhookId: isEditMode ? undefined : generatedWebhookId ?? undefined,
          apiKey: values.apiKey || '',
          webhookSecret: values.webhookSecret || undefined, 
          // Use implicitly fetched UUID for add, fallback to explicit test/existing for edit
          customerUuid: isEditMode 
            ? (testedGeneaCustomerUuid || existingConfig?.customerUuid)
            : (fetchedCustomerUuidOnSubmit || undefined), // Use the UUID fetched during *this* submit
        };
      }
      // --- End Construct Config ---

      const apiPayload: { name: string; category: string; config?: typeof config } = { // Use typeof config here
        name: values.name || `${formatConnectorCategory(values.category)} Connector`, 
        category: values.category,
        // config: config || {} // Assign config below
      };
      // Only include config if it has properties (or for specific types)
      if (Object.keys(config).length > 0) {
          apiPayload.config = config;
      }

      let response: Response;
      let successMessage = '';

      if (isEditMode && editingConnector) {
        // Construct the payload for PUT, ensuring customerUuid is handled correctly
        const updatePayload: { name?: string; config?: typeof config } = {};
        if (values.name !== editingConnector.name) {
          updatePayload.name = values.name || `${formatConnectorCategory(values.category)} Connector`;
        }
        // Only include config if it has changed (relevant fields for the category)
        // For Genea, check apiKey, webhookSecret, customerUuid
        const currentGeneaConfig = editingConnector.config as GeneaConfig & { customerUuid?: string };
        if (values.category === 'genea' && 
            (values.apiKey !== currentGeneaConfig.apiKey || 
             values.webhookSecret !== currentGeneaConfig.webhookSecret ||
             // Check if customerUuid changed (either by re-testing or if it was missing before)
             config.customerUuid !== currentGeneaConfig.customerUuid) 
            ) {
             updatePayload.config = config; 
        } else if (values.category !== 'genea') { // Include config for non-Genea if necessary (add checks here)
          // TODO: Add similar diff checks for other connector types if needed
          updatePayload.config = config; // Defaulting to include for now
        }

        response = await fetch(`/api/connectors/${editingConnector.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload), // Send only changed fields
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
        setTestedGeneaCustomerUuid(null); // Reset Genea customerUuid
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
  };

  return (
    <Dialog open={currentOpenState} onOpenChange={currentSetOpenState}>
      <DialogContent className="sm:max-w-[425px] flex flex-col max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>
            {isEditMode 
              ? 'Edit Connector' 
              : isPiko 
                ? selectedPikoType === 'local'
                  ? 'Add Piko Connector - Local'
                  : pikoWizardStep === 'credentials'
                    ? 'Add Piko Connector - Step 1 (Cloud)'
                    : 'Add Piko Connector - Step 2 (Cloud)'
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
                  ? `Enter your Piko account credentials ${selectedPikoType === 'local' ? 'and local connection details.' : '.'}`
                  : 'Select your Piko system.'
                : selectedCategory === 'netbox' // Add description for NetBox
                  ? 'Configure a webhook endpoint for NetBox integration.'
                  : selectedCategory === 'genea' // Add description for Genea
                    ? 'Configure a webhook endpoint and API key for Genea.'
                    : 'Set up a new integration to connect with external systems or services.'}
          </DialogDescription>
        </DialogHeader>
        
        <div 
          // Reverted: Removed CSS mask classes
          className="relative overflow-y-auto"
        > 
          {/* Form components directly inside */}
          <Form {...form}>
            {/* Remove extra padding-bottom */}
            <form id="connector-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-6 pb-6">
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
                  
                  {/* Name Field - Only show when editing, or when adding non-Piko connectors */}
                  {(isEditMode || selectedCategory !== 'piko') ? (
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
                                selectedCategory === 'piko' && selectedPikoType === 'local' ? "Auto-set after successful test" : // Specific placeholder for local Piko
                                selectedCategory === 'piko' ? "e.g., Main Piko System" :
                                selectedCategory === 'netbox' ? "e.g., NetBox Webhook" : // Placeholder for NetBox
                                selectedCategory === 'genea' ? "e.g., Genea Webhook" : // Placeholder for Genea
                                "Connector Name"
                              } 
                              {...field} 
                              readOnly={selectedCategory === 'piko' && selectedPikoType === 'local' && !!field.value} // Make read-only if piko local + name set
                              className={cn(
                                  fieldState.invalid && 'border-destructive',
                                  selectedCategory === 'piko' && selectedPikoType === 'local' && !!field.value && 'bg-muted text-muted-foreground cursor-not-allowed' // Style as read-only
                              )}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}

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
                        <FormItem className="flex flex-col mb-6">
                          <FormLabel>Connection Type</FormLabel>
                          <FormControl> 
                           <Tabs 
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedPikoType(value as 'cloud' | 'local');
                                setTestResult(null); // Reset test result on type change
                              }}
                              className="w-full" // Use full width of the parent
                            >
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="cloud">
                                  <Cloud className="h-4 w-4 mr-2" />
                                  Cloud
                                </TabsTrigger>
                                <TabsTrigger value="local">
                                  <EthernetPort className="h-4 w-4 mr-2" />
                                  Local
                                </TabsTrigger>
                              </TabsList>
                            </Tabs>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Conditionally show Host/Port/TLS/Credentials for Local Piko */}
                    {selectedPikoType === 'local' && (
                        <div className="space-y-6"> { /* Add space between groups */ }
                            {/* Host Settings Group */}
                            <fieldset className="rounded-md border p-4">
                                <legend className="text-sm font-medium leading-none px-1 text-muted-foreground">Host Settings</legend>
                                {/* Host and Port on the same row */}
                                <div className="flex items-start gap-4 mt-2">
                                    <FormField
                                      control={form.control}
                                      name="host"
                                      render={({ field, fieldState }) => (
                                        <FormItem className="flex-grow">
                                          <FormLabel>Host/URL</FormLabel>
                                          <FormControl>
                                            <Input 
                                              placeholder="127.0.0.1" 
                                              {...field} 
                                              className={cn(fieldState.invalid && 'border-destructive')}
                                            />
                                          </FormControl>
                                          <FormMessage /> { /* Add message under input */ }
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="port"
                                      render={({ field, fieldState }) => (
                                        <FormItem className="w-[100px]"> { /* Fixed width for port */ }
                                          <FormLabel>Port</FormLabel>
                                          <FormControl>
                                            <Input 
                                              type="number" 
                                              placeholder="7001" 
                                              {...field} 
                                              onChange={event => field.onChange(event.target.value === '' ? undefined : Number(event.target.value))} // Ensure number or undefined
                                              className={cn(fieldState.invalid && 'border-destructive')}
                                            />
                                          </FormControl>
                                          <FormMessage /> { /* Add message under input */ }
                                        </FormItem>
                                      )}
                                    />
                                </div>
                                <div className="mt-4"> { /* Wrapper div for spacing */ }
                                  <FormField
                                      control={form.control} 
                                      name="ignoreTlsErrors"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm bg-background"> { /* Adjusted padding/bg */ }
                                          <FormControl>
                                            <Checkbox
                                              id="ignoreTlsErrors"
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <div className="space-y-1 leading-none">
                                            <FormLabel htmlFor="ignoreTlsErrors" className="cursor-pointer"> { /* Make label clickable */ }
                                              Ignore TLS Certificate Errors
                                            </FormLabel>
                                            <FormDescription className="text-xs">
                                              Enable if using a self-signed/invalid certificate.
                                            </FormDescription>
                                            { /* Removed badge for cleaner look, description is sufficient */ }
                                          </div>
                                        </FormItem>
                                      )}
                                    />
                                </div>
                            </fieldset>

                             {/* Authentication Credentials Group */}
                             <fieldset className="rounded-md border p-4">
                                <legend className="text-sm font-medium leading-none px-1 text-muted-foreground">Authentication Credentials</legend>
                                <FormField
                                    control={form.control}
                                    name="username"
                                    render={({ field, fieldState }) => (
                                        <FormItem className="mb-4"> { /* Added mb-4 */ }
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
                            </fieldset>
                        </div>
                    )}

                    {/* Render Username/Password only for Cloud Piko - Now inside the main Piko conditional block */}
                     {selectedPikoType === 'cloud' && (
                         <fieldset className="rounded-md border p-4 mt-6"> { /* Added mt-6 for space below Tabs */ }
                             <legend className="text-sm font-medium leading-none px-1 text-muted-foreground">Authentication Credentials</legend>
                               <FormField
                                   control={form.control}
                                   name="username"
                                   render={({ field, fieldState }) => (
                                      <FormItem className="mb-4"> { /* Added mb-4 */ }
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
                         </fieldset>
                     )}
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
                               isEditMode && ((editingConnector?.config as NetBoxConfig | GeneaConfig)?.webhookId)
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
            </form> { /* END form */}
          </Form> { /* END Form */}

        </div> { /* END scroll container */}
      

        {/* Actions Section - Remove mt-auto */}
         <div className="border-t border-border px-6 pt-6 pb-6">
            <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 justify-end">
              {/* Show different buttons based on category and step */}
              {selectedCategory && (
                <div className="flex flex-col sm:flex-row gap-2 w-full justify-between">
                  {/* Back button always on the left if applicable */}
                  <div className="flex-initial">
                      {/* Only show Back button for Piko Cloud on Step 2 */}
                      {isPiko && selectedPikoType === 'cloud' && pikoWizardStep === 'system-selection' && (
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
                            (isPiko && pikoWizardStep === 'credentials' && 
                              (
                               (!form.getValues('username') || !form.getValues('password')) ||
                               (form.getValues('type') === 'local' && (!form.getValues('host') || form.getValues('port') === undefined || form.getValues('port') === null || isNaN(Number(form.getValues('port')))))
                              )
                            )
                          }
                          className="w-full sm:w-auto"
                        >
                          {isTestingConnection || isFetchingSystems ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null }
                          {/* Adjust button text based on piko type */}
                          {isPiko ? (selectedPikoType === 'local' ? 'Test Connection' : 'Next') : 'Test Connection'}
                        </Button>
                      )}
                      
                      {/* Submit Button - Show for NetBox, YoLink, Genea, Piko (System Selection - Cloud), Piko (Credentials - Local after successful test) */}
                       {(
                          selectedCategory === 'netbox' || 
                          selectedCategory === 'yolink' || 
                          selectedCategory === 'genea' || 
                          (selectedCategory === 'piko' && selectedPikoType === 'cloud' && pikoWizardStep === 'system-selection') ||
                          (selectedCategory === 'piko' && selectedPikoType === 'local' && pikoWizardStep === 'credentials') // Show in credentials step for local
                        ) && (
                        <Button 
                          type="submit" 
                          form="connector-form"
                          className="w-full sm:w-auto" 
                          disabled={
                              isLoading || 
                              (selectedCategory === 'yolink' && !isEditMode && !testedYoLinkHomeId) ||
                              (selectedCategory === 'piko' && selectedPikoType === 'local' && !testResult?.success) ||
                              (selectedCategory === 'piko' && selectedPikoType === 'cloud' && pikoWizardStep === 'system-selection' && !form.getValues('selectedSystem'))
                          }
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
      </DialogContent>
    </Dialog>
  );
}