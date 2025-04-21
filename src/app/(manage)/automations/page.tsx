import { Separator } from "@/components/ui/separator";
import React from "react";
import { AutomationTable } from "@/components/automations/AutomationTable";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from 'next/link';

export default function AutomationsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Automations</h2>
          <p className="text-muted-foreground">
            Configure event-driven actions between connected systems.
          </p>
        </div>
        <Button asChild>
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