'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/chat/markdown-renderer";

interface LicenseInfo {
  name: string;
  packages: string[];
  license: string;
  repository?: string;
  author?: string;
  packageCount: number;
}

export function AttributionContent() {
  const [licenses, setLicenses] = useState<LicenseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLicenses, setExpandedLicenses] = useState<Set<string>>(new Set());
  const [legalNotices, setLegalNotices] = useState<string>('');
  const [legalNoticesLoading, setLegalNoticesLoading] = useState(true);

  const toggleExpanded = (licenseName: string) => {
    setExpandedLicenses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(licenseName)) {
        newSet.delete(licenseName);
      } else {
        newSet.add(licenseName);
      }
      return newSet;
    });
  };

  useEffect(() => {
    // Fetch license data from admin API endpoint
    const fetchLicenses = fetch('/api/admin/licenses')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log('License data received:', data);
        if (Array.isArray(data)) {
          setLicenses(data);
        } else {
          console.error('License data is not an array:', data);
          setLicenses([]);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load license data:', error);
        setLicenses([]);
        setLoading(false);
      });

    // Fetch legal notices (NOTICE.md content)
    const fetchLegalNotices = fetch('/api/admin/legal-notices')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        setLegalNotices(data.content || '');
        setLegalNoticesLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load legal notices:', error);
        setLegalNotices('');
        setLegalNoticesLoading(false);
      });
  }, []);



  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Attribution</h3>
        <p className="text-sm text-muted-foreground">
          Acknowledgments and licenses for third-party libraries and services used in this application.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open Source Libraries</CardTitle>
          <CardDescription>
            Third-party libraries and frameworks that power this application
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading license information...</div>
          ) : licenses.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No license information available. License data is generated during production builds.
            </div>
          ) : (
            <div className="space-y-4">
              {licenses.map((license, index) => {
                const isExpanded = expandedLicenses.has(license.name);
                
                return (
                  <div key={license.name}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">
                            {license.repository ? (
                              <a href={license.repository} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {license.name}
                              </a>
                            ) : (
                              license.name
                            )}
                          </h4>
                          <button
                            onClick={() => toggleExpanded(license.name)}
                            className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary/80 transition-colors flex items-center gap-1"
                          >
                            {license.packageCount} package{license.packageCount !== 1 ? 's' : ''}
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </button>
                          <span className="text-xs border border-border px-2 py-1 rounded">{license.license}</span>
                        </div>
                        {license.author && (
                          <p className="text-sm text-muted-foreground">by {license.author}</p>
                        )}
                        {isExpanded && (
                          <div className="mt-2 ml-4 space-y-1">
                            {license.packages.map((pkg, pkgIndex) => (
                              <div key={pkgIndex} className="text-xs text-muted-foreground font-mono">
                                • {pkg}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {index < licenses.length - 1 && <div className="border-t mt-4" />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Legal Notices
          </CardTitle>
          <CardDescription>
            Required copyright notices for Apache 2.0, ISC, and other licensed components
          </CardDescription>
        </CardHeader>
        <CardContent>
          {legalNoticesLoading ? (
            <div className="text-sm text-muted-foreground">Loading legal notices...</div>
          ) : legalNotices ? (
            <div className="max-h-96 overflow-y-auto border rounded-md p-4 text-sm">
              <MarkdownRenderer>{legalNotices}</MarkdownRenderer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Legal notices not available. Please ensure NOTICE.md exists in the project root.
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
} 