import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';

// license-checker output format
interface LicenseCheckerEntry {
  licenses: string;
  repository?: string;
  publisher?: string;
  email?: string;
  path: string;
  licenseFile?: string;
}

// license-checker output is an object with "name@version" keys
type LicenseCheckerOutput = Record<string, LicenseCheckerEntry>;

interface LicensePackage {
  name: string;
  version: string;
  license: string;
  repository?: string;
  author?: string;
}

interface GroupedLicense {
  name: string;
  packages: string[];
  license: string;
  repository?: string;
  author?: string;
  packageCount: number;
}

function groupPackagesByOrg(licenses: LicensePackage[]): GroupedLicense[] {
  const groups: Record<string, LicensePackage[]> = {};
  
  // Group packages by organization
  licenses.forEach(pkg => {
    let orgName: string;
    
    if (pkg.name.startsWith('@')) {
      // Scoped package: @radix-ui/react-dialog -> @radix-ui
      const scopeEnd = pkg.name.indexOf('/', 1);
      orgName = pkg.name.substring(0, scopeEnd);
    } else {
      // Non-scoped package: use full name
      orgName = pkg.name;
    }
    
    if (!groups[orgName]) {
      groups[orgName] = [];
    }
    groups[orgName].push(pkg);
  });
  
  // Convert groups to consolidated entries
  return Object.entries(groups).map(([orgName, packages]) => {
    const firstPackage = packages[0];
    
    // Use the actual org name as-is
    const displayName = orgName;
    
    return {
      name: displayName,
      packages: packages.map(p => `${p.name}@${p.version}`),
      license: firstPackage.license,
      repository: firstPackage.repository,
      author: firstPackage.author,
      packageCount: packages.length
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export const GET = withApiRouteAuth(async (req: NextRequest, context) => {
  try {
    // Check if user is admin
    if ((context.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Read the generated licenses file from project root
    const licensesPath = join(process.cwd(), 'licenses.json');
    
    if (!existsSync(licensesPath)) {
      // In development mode, the file might not exist yet
      return NextResponse.json([]);
    }

    const licensesData = readFileSync(licensesPath, 'utf8');
    const licensesRaw: LicenseCheckerOutput = JSON.parse(licensesData);

    // Read package.json to get direct dependencies
    const packageJsonPath = join(process.cwd(), 'package.json');
    const packageJsonData = readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonData);
    
    // Get list of direct dependencies (runtime only, not dev dependencies)
    const directDeps = new Set(Object.keys(packageJson.dependencies || {}));

    // Convert license-checker format to our format
    const licenses: LicensePackage[] = Object.entries(licensesRaw).map(([nameVersion, entry]) => {
      // Parse "name@version" format
      const lastAtIndex = nameVersion.lastIndexOf('@');
      const name = nameVersion.substring(0, lastAtIndex);
      const version = nameVersion.substring(lastAtIndex + 1);
      
      return {
        name,
        version,
        license: entry.licenses,
        repository: entry.repository,
        author: entry.publisher
      };
    });

    // Filter licenses to only include direct dependencies
    const filteredLicenses = licenses.filter((pkg: LicensePackage) => 
      directDeps.has(pkg.name)
    );

    // Add manual entries for copy-paste libraries
    const manualEntries: GroupedLicense[] = [
      {
        name: "shadcn-ui/ui",
        packages: ["shadcn-ui/ui (copy-paste components)"],
        license: "MIT", 
        repository: "https://github.com/shadcn-ui/ui",
        author: "shadcn",
        packageCount: 1
      }
    ];

    // Group packages by organization
    const groupedLicenses = groupPackagesByOrg(filteredLicenses);

    // Combine manual entries with auto-detected ones
    const allLicenses = [...manualEntries, ...groupedLicenses].sort((a, b) => 
      a.name.localeCompare(b.name)
    );

    return NextResponse.json(allLicenses);
  } catch (error) {
    console.error('Failed to read licenses file:', error);
    return NextResponse.json(
      { error: 'Failed to load license information' },
      { status: 500 }
    );
  }
}); 