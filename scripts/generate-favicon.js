// This is a helper script to remind you how to generate the favicon
console.log(`
To generate the favicon:

1. Open the development server (npm run dev)
2. Navigate to http://localhost:3000/favicon-generator
3. Right-click on the icon and save it as an SVG
4. Use a tool like https://realfavicongenerator.net/ to convert the SVG to favicon.ico
5. Place the favicon.ico file in the public directory

Note: You'll need to create a new page at app/favicon-generator/page.tsx with this content:

import { FusionBridgeIcon } from "@/components/icons/FusionBridgeIcon";

export default function FaviconGenerator() {
  return (
    <div style={{ padding: '2rem' }}>
      <FusionBridgeIcon />
    </div>
  );
}
`); 