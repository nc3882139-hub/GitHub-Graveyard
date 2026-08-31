/**
 * Rate limiting middleware
 * Prevents abuse by limiting requests per endpoint
 */

class RateLimiter {
    constructor() {
        this.requests = new Map();
        // Clean up old entries every 5 minutes
        setInterval(() => this._cleanup(), 5 * 60 * 1000);
    }

    /**
     * Create a rate limit middleware
     * @param {number} limit - Maximum requests
     * @param {number} windowMs - Time window in milliseconds
     * @param {string} message - Error message
     */
    limit(limit = 100, windowMs = 15 * 60 * 1000, message = 'Too many requests, please try again later') {
        return (req, res, next) => {
            const key = this._getKey(req);
            const now = Date.now();
            
            if (!this.requests.has(key)) {
                this.requests.set(key, []);
            }

            const requests = this.requests.get(key);
            
            // Remove old requests outside the window
            const validRequests = requests.filter(time => now - time < windowMs);
            this.requests.set(key, validRequests);

            if (validRequests.length >= limit) {
                return res.status(429).json({ 
                    error: message,
                    retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
                });
            }

            validRequests.push(now);
            next();
        };
    }

    /**
     * Create a key for rate limiting (IP + endpoint)
     * @private
     */
    _getKey(req) {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        return `${ip}:${req.path}`;
    }

    /**
     * Clean up old entries
     * @private
     */
    _cleanup() {
        const now = Date.now();
        const hour = 60 * 60 * 1000;

        for (const [key, times] of this.requests.entries()) {
            const valid = times.filter(time => now - time < hour);
            if (valid.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, valid);
            }
        }
    }
}

module.exports = new RateLimiter();
