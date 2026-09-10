const { handleWithPath } = require('./_app');

module.exports = handleWithPath('/api/webhook');

module.exports.config = {
    api: { bodyParser: false }
};
