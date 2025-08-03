import { NextRequest, NextResponse } from 'next/server';
import { testLinearConnection } from '@/services/drivers/linear';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { 
          success: false,
          error: 'API key is required' 
        },
        { status: 400 }
      );
    }

    // Use existing testLinearConnection which gets both user info and teams
    const result = await testLinearConnection({ apiKey });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /api/services/linear/teams] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}