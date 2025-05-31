'use client';

import React, { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth/client';
import type { User } from "@/lib/actions/user-actions"; // Assuming User type is still relevant
import { UsersTable, UsersTableSkeleton } from "./users-table"; // Correct path to users-table.tsx
import { useFusionStore } from '@/stores/store'; // Import useFusionStore

export function UsersTableLoader() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastUserListUpdateTimestamp = useFusionStore((state) => state.lastUserListUpdateTimestamp); // Get timestamp from store

  useEffect(() => {
    async function fetchUsers() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await authClient.admin.listUsers({
          query: { limit: 100 }, 
        });

        if (result.error) {
          throw result.error;
        }
        setUsers(result.data?.users as User[] || []); 
      } catch (err: any) {
        console.error("Error fetching users via authClient.admin.listUsers:", err);
        setError(err.message || 'Failed to load users.');
        setUsers([]);
      }
      setIsLoading(false);
    }
    fetchUsers();
  }, [lastUserListUpdateTimestamp]); // Add timestamp to dependency array

  if (isLoading) {
    return <UsersTableSkeleton />; 
  }

  if (error) {
    return <div>Error: {error}</div>; 
  }

  return <UsersTable data={users} />;
} 