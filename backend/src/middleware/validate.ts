import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Middleware factory for Zod schema validation
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
        return;
      }
      next(error);
    }
  };
};

/**
 * Middleware factory for validating query parameters
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
        return;
      }
      next(error);
    }
  };
};

/**
 * Middleware factory for validating URL parameters
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Invalid URL parameters',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
        return;
      }
      next(error);
    }
  };
};

// ============================================
// Validation Schemas
// ============================================

import { z } from 'zod';

// Numeric ID param schema
export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid ID').transform(Number),
});

// Session + Set ID params schema
export const sessionSetParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid session ID').transform(Number),
  setId: z.string().regex(/^\d+$/, 'Invalid set ID').transform(Number),
});

// Pagination query schema
export const paginationQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(0)).optional(),
});

// Helper to validate and parse params
export function parseParams<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.errors[0]?.message || 'Invalid parameters' };
  }
  return { success: true, data: result.data };
}
