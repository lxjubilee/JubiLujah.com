// Wrap an async route handler so rejected promises reach Express' error handler.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
