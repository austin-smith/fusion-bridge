'use client';

import { useEffect, useState } from 'react';

export function ServerInit() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initServer = async () => {
      try {
        // Only attempt to initialize once
        if (initialized) return;
        
        console.log('Initializing server services...');
        const response = await fetch('/api/startup');
        
        // Check if response is valid before parsing
        if (!response.ok) {
          console.error(`Server initialization failed with status ${response.status}`);
          return;
        }
        
        // Check content type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('Server initialization returned non-JSON response');
          const text = await response.text();
          console.error('Response content:', text.substring(0, 200) + '...');
          return;
        }
        
        const data = await response.json();
        
        console.log('Server initialization response:', data);
        setInitialized(true);
      } catch (error) {
        console.error('Failed to initialize server services:', error);
      }
    };

    // Call initialization on mount
    initServer();
  }, [initialized]);

  // Render nothing - just used for initialization
  return null;
} 