import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RESOURCE_STATUSES, RESOURCE_TYPES } from '../../database/schema';

export const listResourcesQuerySchema = z
  .object({
    type: z.enum(RESOURCE_TYPES).optional(),
    status: z.enum(RESOURCE_STATUSES).optional(),
    limit: z.coerce.number().int().positive().optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;

export class ListResourcesQueryDto extends createZodDto(listResourcesQuerySchema) {}
