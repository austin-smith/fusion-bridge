import { auth } from "@/lib/auth/server"; // Updated import path
import { toNextJsHandler } from "better-auth/next-js";

// Export the GET and POST handlers
// This single file will handle all routes under /api/auth/* 
// (e.g., /api/auth/signin/credentials, /api/auth/callback/github, /api/auth/session, etc.)
export const { GET, POST } = toNextJsHandler(auth); 