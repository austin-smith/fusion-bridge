import { NextRequest, NextResponse } from 'next/server';
import { generateOpenApiSpec } from '@/lib/openapi/generator';

// Cache the OpenAPI spec in production
let cachedSpec: any = null;

export const GET = async (_req: NextRequest) => {
  try {
    // Use cached spec in production for better performance
    if (process.env.NODE_ENV === 'production' && cachedSpec) {
      return NextResponse.json(cachedSpec);
    }

    // Generate the OpenAPI specification
    const spec = generateOpenApiSpec();

    // Cache in production
    if (process.env.NODE_ENV === 'production') {
      cachedSpec = spec;
    }

    return NextResponse.json(spec);
  } catch (error) {
    console.error('Error generating OpenAPI spec:', error);
    return NextResponse.json(
      { error: 'Failed to generate OpenAPI specification' },
      { status: 500 }
    );
  }
}; 