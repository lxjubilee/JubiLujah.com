import { HttpError } from './rbac.js';

// Validate req.body / req.query / req.params against a Zod schema. On success,
// replaces the source with the parsed (coerced) value. On failure -> 400.
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      throw new HttpError(400, 'Validation failed', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req[source] = result.data;
    next();
  };
}
