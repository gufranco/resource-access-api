import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RESOURCE_STATUSES, RESOURCE_TYPES } from '../../database/schema';

export const resourceSchema = z.object({
  id: z.number().int(),
  ownerId: z.number().int(),
  type: z.enum(RESOURCE_TYPES),
  status: z.enum(RESOURCE_STATUSES),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const pageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  limit: z.number().int(),
});

export const paginatedResourcesSchema = z.object({
  data: z.array(resourceSchema),
  pageInfo: pageInfoSchema,
});

export type ResourceView = z.infer<typeof resourceSchema>;
export type PaginatedResources = z.infer<typeof paginatedResourcesSchema>;

export class PaginatedResourcesDto extends createZodDto(paginatedResourcesSchema) {}
