'use client';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function SwaggerPage() {
  return (
    <div className="w-full h-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">API Documentation</h1>
        <p className="text-muted-foreground mt-2">
          Interactive documentation for the Fusion API
        </p>
      </div>
      
      <div className="border rounded-lg overflow-hidden">
        <SwaggerUI 
          url="/api/swagger" 
          docExpansion="list"
          defaultModelsExpandDepth={1}
          defaultModelExpandDepth={1}
        />
      </div>
    </div>
  );
} 