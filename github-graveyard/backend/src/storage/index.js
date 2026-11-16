const FileStore = require('./fileStore');
const UpstashRedisStore = require('./upstashRedisStore');

function createStorage(driver = process.env.STORAGE_DRIVER || 'file') {
    switch (driver.toLowerCase()) {
        case 'file':
            return new FileStore();
        case 'upstash':
            return new UpstashRedisStore();
        default:
            throw new Error(`Unsupported STORAGE_DRIVER "${driver}". Use "file" or "upstash".`);
    }
}

module.exports = createStorage;
