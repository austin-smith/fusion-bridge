import { ApiReference } from '@scalar/nextjs-api-reference';

const config = {
  url: '/api/docs/spec',
  theme: 'default' as const,
  metaData: {
    title: 'Fusion API Documentation',
    description: 'Interactive documentation for the Fusion API',
  },
};

export const GET = ApiReference(config); 