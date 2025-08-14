const { fail } = require('../utils/response');

const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.reset < now) buckets.delete(k);
  }
}, 60 * 1000).unref();

function rateLimit({ windowMs = 60000, max = 30, key = '', message = '请求太频繁，请稍后再试' } = {}) {
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === '1') return next();
    const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const k = `${key}:${ip}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(k, b);
    }
    if (++b.count > max) {
      return fail(res, 429, message);
    }
    next();
  };
}

module.exports = { rateLimit };
