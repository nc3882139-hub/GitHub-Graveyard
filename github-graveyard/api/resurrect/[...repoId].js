const { handleWithPath, repoPath } = require('../_app');

module.exports = (req, res) => handleWithPath(repoPath(req, 'resurrect'))(req, res);
