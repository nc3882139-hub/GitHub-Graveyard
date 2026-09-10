const app = require('../backend/src/app');

function handleWithPath(path) {
    return (req, res) => {
        const originalUrl = req.url;
        req.url = path;
        return app(req, res, error => {
            req.url = originalUrl;
            if (error) {
                res.statusCode = error.statusCode || 500;
                res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
            }
        });
    };
}

function repoPath(req, resource) {
    const value = Array.isArray(req.query.repoId) ? req.query.repoId.join('/') : req.query.repoId;
    return `/api/${resource}/${encodeURIComponent(String(value || ''))}`;
}

module.exports = { app, handleWithPath, repoPath };
