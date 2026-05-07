import { z } from "zod";

const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "must be a lowercase slug");

export const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
});

export const sendStatusSchema = z.object({
  campus_id: z.number().int().positive().optional(),
  campus_slug: slug.optional(),
  status_type_id: z.number().int().positive().optional(),
  status_slug: slug.optional(),
  message: z.string().max(500).optional().nullable(),
});

export const triggerSchema = z.object({
  campus: slug,
  status: slug,
  token: z.string().min(8).max(256),
  message: z.string().max(500).optional(),
});

export const subscribeEnrollSchema = z.object({
  email: z.string().email().max(254),
  display_name: z.string().min(1).max(128),
  memberships: z
    .array(
      z.object({
        campus_slug: slug,
        group_slugs: z.array(slug).min(1).max(16),
      }),
    )
    .min(1)
    .max(16),
});

export const pushSubscriptionSchema = z.object({
  email: z.string().email(),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  user_agent: z.string().max(512).optional(),
});

export const upsertCampusSchema = z.object({
  slug,
  name: z.string().min(1).max(128),
  timezone: z.string().min(1).max(64).default("America/Chicago"),
  service_window_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  service_window_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  active: z.boolean().optional(),
});

export const upsertStatusTypeSchema = z.object({
  campus_id: z.number().int().positive(),
  slug,
  label: z.string().min(1).max(64),
  default_message: z.string().max(500).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
});

export const upsertGroupSchema = z.object({
  campus_id: z.number().int().positive(),
  slug,
  name: z.string().min(1).max(128),
  active: z.boolean().optional(),
});

export const createTokenSchema = z.object({
  campus_id: z.number().int().positive(),
  label: z.string().min(1).max(128),
});
