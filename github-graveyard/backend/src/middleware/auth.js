function authenticateAPI(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (process.env.NODE_ENV === 'development' && !process.env.API_AUTH_TOKEN) {
        return next();
    }

    if (!process.env.API_AUTH_TOKEN) {
        return next();
    }

    const [scheme, token] = String(authHeader || '').split(' ');
    if (scheme !== 'Bearer' || !token || token !== process.env.API_AUTH_TOKEN) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    req.user = { authenticated: true };
    next();
}

module.exports = { authenticateAPI };
