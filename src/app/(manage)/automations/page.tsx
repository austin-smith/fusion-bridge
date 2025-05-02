'use client';

import { Separator } from "@/components/ui/separator";
import React, { useEffect } from "react";
import { AutomationTable } from "@/components/automations/AutomationTable";
import { Button } from "@/components/ui/button";
import { PlusCircle, Workflow } from "lucide-react";
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';

export default function AutomationsPage() {

  useEffect(() => {
    document.title = 'Automations // Fusion';
  }, []);
  
  const pageActions = (
    <Button asChild size="sm">
      <Link href="/automations/new">
        <PlusCircle className="h-4 w-4" /> Add Automation
      </Link>
    </Button>
  );

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <PageHeader 
        title="Automations"
        description="Configure event-driven actions between connected systems."
        icon={<Workflow className="h-6 w-6" />}
        actions={pageActions}
      />
      <AutomationTable />
    </div>
  );
} 