const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');

class FileStore {
    constructor(directory = path.join(__dirname, '../../data')) {
        this.directory = directory;
    }

    _filePath(key) {
        if (typeof key !== 'string' || key.length === 0) {
            throw new TypeError('Storage key must be a non-empty string');
        }
        return path.join(this.directory, `${encodeURIComponent(key)}.json`);
    }

    async get(key) {
        try {
            const content = await fs.readFile(this._filePath(key), 'utf8');
            return JSON.parse(content);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    async save(key, value) {
        await fs.mkdir(this.directory, { recursive: true });
        const destination = this._filePath(key);
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try {
            await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
            await fs.rename(temporary, destination);
        } catch (error) {
            await fs.rm(temporary, { force: true });
            throw error;
        }
    }

    async list() {
        await fs.mkdir(this.directory, { recursive: true });
        const files = await fs.readdir(this.directory);
        const records = [];

        for (const file of files) {
            if (!file.endsWith('.json')) {
                continue;
            }
            const key = decodeURIComponent(file.slice(0, -'.json'.length));
            records.push({ key, value: await this.get(key) });
        }

        return records;
    }
}

module.exports = FileStore;
