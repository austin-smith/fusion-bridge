'use client';

import React, { useState, useEffect } from 'react';
import { useFusionStore, type Organization } from '@/stores/store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { OrganizationLogoSelector } from './organization-logo-selector';

const editOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100, 'Name too long'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(50, 'Slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  logo: z.string().optional().nullable(),
});

type EditOrganizationData = z.infer<typeof editOrganizationSchema>;

interface EditOrganizationDialogProps {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditOrganizationDialog({ 
  organization, 
  open, 
  onOpenChange 
}: EditOrganizationDialogProps) {
  const { updateOrganization } = useFusionStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EditOrganizationData>({
    resolver: zodResolver(editOrganizationSchema),
    defaultValues: {
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo || null,
    },
  });

  // Reset form when organization changes
  useEffect(() => {
    form.reset({
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo || null,
    });
  }, [organization, form]);

  const onSubmit = async (data: EditOrganizationData) => {
    setIsSubmitting(true);
    try {
      const updatedOrg = await updateOrganization(organization.id, {
        ...data,
        logo: data.logo || undefined,
      });
      
      if (updatedOrg) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error updating organization:', error);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Edit Organization</DialogTitle>
          <DialogDescription>
            Update your organization&apos;s details.
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
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 