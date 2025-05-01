import { Separator } from "@/components/ui/separator";
import React from "react";
import { AutomationTable } from "@/components/automations/AutomationTable";
import { Button } from "@/components/ui/button";
import { PlusCircle, Workflow } from "lucide-react";
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Automations // Fusion',
};

export default function AutomationsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-6">
        <div className="flex items-center gap-4">
          <Workflow className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-semibold text-foreground tracking-tight">
              Automations
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure event-driven actions between connected systems.
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href="/automations/new">
            <PlusCircle className="h-4 w-4" /> Add Automation
          </Link>
        </Button>
      </div>
      <Separator />
      <AutomationTable />
    </div>
  );
} 