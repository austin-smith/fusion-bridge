// Tailwind config for React Email inlining. Keep values in sync with main theme.
// These must be static colors (no CSS variables) so they can be inlined for email clients.
const emailTailwindConfig = {
  theme: {
    extend: {
      colors: {
        brand: '#16A34A', // main system primary (approx hsl(142.1 76.2% 36.3%))
        text: '#111111',  // close to base foreground
        bg: '#ffffff',    // base background
        muted: '#6B7280', // gray-500 equivalent for helper text
      },
      borderColor: {
        DEFAULT: '#e5e7eb', // gray-200 for simple borders
      },
    },
  },
} as const;

export default emailTailwindConfig;


