'use client';

import React, { useState } from 'react';
import { useFusionStore, type NewOrganizationData } from '@/stores/store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { OrganizationLogoSelector } from './organization-logo-selector';

const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100, 'Name too long'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(50, 'Slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  logo: z.string().optional().nullable(),
});

export function CreateOrganizationDialog() {
  const { createOrganization } = useFusionStore();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<NewOrganizationData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      logo: undefined, // No default, URL tab is now default
    },
  });

  const onSubmit = async (data: NewOrganizationData) => {
    setIsSubmitting(true);
    try {
      const organization = await createOrganization({
        ...data,
        logo: data.logo || undefined,
      });
      
      if (organization) {
        setOpen(false);
        form.reset();
      }
    } catch (error) {
      console.error('Error creating organization:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    form.setValue('slug', slug);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Create Organization
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Create a new organization to manage users and resources.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="My Organization"
                      onChange={(e) => {
                        field.onChange(e);
                        handleNameChange(e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    The display name for your organization.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="my-organization" />
                  </FormControl>
                  <FormDescription>
                    URL-friendly identifier. Auto-generated from name.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="logo"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <OrganizationLogoSelector 
                      value={field.value} 
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Organization'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 