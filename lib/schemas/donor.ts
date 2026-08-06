import { z } from 'zod';

export const donorTierSchema = z.enum([
  'major',
  'mid',
  'recurring',
  'annual',
  'lapsed',
  'prospect',
]);

export const donorRecencySchema = z.enum(['active', 'lapsed', 'lost']);

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const createDonorSchema = z.object({
  first_name: optionalText(200),
  last_name: optionalText(200),
  email: z.union([z.string().trim().email(), z.literal('')]).optional().nullable(),
  phone: optionalText(100),
  organization_name: optionalText(300),
  is_organization: z.boolean().optional(),
  preferred_name: optionalText(200),
  contact_name: optionalText(200),
  is_anonymous: z.boolean().optional(),
  address_line1: optionalText(300),
  address_line2: optionalText(300),
  city: optionalText(200),
  state: optionalText(100),
  zip: optionalText(40),
  country: optionalText(100),
  communication_preference: z.enum(['email', 'mail', 'phone', 'none']).optional(),
  do_not_contact: z.boolean().optional(),
  tier: donorTierSchema.optional(),
  notes: optionalText(10_000),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
}).strict();

export const updateDonorSchema = createDonorSchema.partial().extend({
  recency_status: donorRecencySchema.optional(),
}).strict();
