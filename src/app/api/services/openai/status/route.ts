import { NextResponse } from 'next/server';
import { withOrganizationAuth } from '@/lib/auth/withOrganizationAuth';
import { db } from '@/data/db';
import { serviceConfigurations } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const OpenAIStatusSchema = z.object({
  enabled: z.boolean(),
});

export const GET = withOrganizationAuth(async (req, authContext) => {
  try {
    // Query the service_configurations table for OpenAI config
    // Note: service_configurations is not organization-scoped, it's global
    const openAiConfig = await db
      .select()
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'OPENAI'))  // Fixed: Use uppercase to match storage
      .limit(1);

    const enabled = openAiConfig[0]?.isEnabled || false;

    const response = {
      enabled,
    };

    const validatedResponse = OpenAIStatusSchema.parse(response);

    return NextResponse.json({
      success: true,
      data: validatedResponse,
    });

  } catch (error) {
    console.error('[OpenAI Status API] Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch OpenAI service status' 
      },
      { status: 500 }
    );
  }
}); 