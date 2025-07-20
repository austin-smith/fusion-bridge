import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';

export const GET = withApiRouteAuth(async (req: NextRequest, context) => {
  try {
    // Check if user is admin
    if ((context.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Read the NOTICE.md file from project root
    const noticePath = join(process.cwd(), 'NOTICE.md');
    
    if (!existsSync(noticePath)) {
      return NextResponse.json({ error: 'NOTICE.md file not found' }, { status: 404 });
    }

    const noticeContent = readFileSync(noticePath, 'utf8');
    
    // Replace dynamic placeholders with current values
    const processedContent = noticeContent.replace('{CURRENT_YEAR}', new Date().getFullYear().toString());

    return NextResponse.json({ content: processedContent });
  } catch (error) {
    console.error('Failed to read NOTICE.md file:', error);
    return NextResponse.json(
      { error: 'Failed to load legal notices' },
      { status: 500 }
    );
  }
}); 