import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';

/**
 * Middleware factory for Zod schema validation.
 * Replaces req.body with the parsed output so defaults, transforms,
 * and unknown-key stripping actually take effect in handlers.
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
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
 * Middleware factory for validating URL parameters.
 * Validation only — params stay strings; routes convert with Number().
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

// Numeric ID param schema
export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid ID'),
});

// Session + Set ID params schema
export const sessionSetParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid session ID'),
  setId: z.string().regex(/^\d+$/, 'Invalid set ID'),
});

// Pagination query schema
export const paginationQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(0)).optional(),
});
