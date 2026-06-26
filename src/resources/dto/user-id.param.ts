import { z } from 'zod';

export const userIdParamSchema = z.coerce.number().int().positive();
