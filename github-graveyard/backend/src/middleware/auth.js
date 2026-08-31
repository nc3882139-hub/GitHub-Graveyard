/**
 * Authentication middleware
 * 
 * For development: Accepts any request with a valid Authorization header
 * For production: Should implement proper OAuth/JWT validation
 */

function authenticateAPI(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    // In development, we're lenient
    if (process.env.NODE_ENV === 'development') {
        return next();
    }
    
    // In production, require a valid token
    if (!authHeader) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }
    
    // Expected format: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Invalid authorization header format' });
    }
    
    const token = parts[1];
    
    // TODO: Implement proper token validation
    // For now, just check if token is non-empty
    if (!token) {
        return res.status(401).json({ error: 'Missing token' });
    }
    
    // Store token info in request for later use
    req.user = { token };
    next();
}

module.exports = { authenticateAPI };
