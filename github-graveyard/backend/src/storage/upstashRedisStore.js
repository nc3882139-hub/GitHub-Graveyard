class UpstashRedisStore {
    constructor(url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN) {
        if (!url || !token) {
            throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for Upstash storage');
        }
        this.url = url.replace(/\/+$/, '');
        this.token = token;
        this.recordPrefix = 'github-graveyard:record:';
        this.indexKey = 'github-graveyard:records';
    }

    async _command(command) {
        if (typeof fetch !== 'function') {
            throw new Error('Upstash storage requires a Node.js runtime with fetch support');
        }

        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(command)
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            throw new Error(`Upstash Redis command failed: ${result.error || response.statusText}`);
        }
        return result.result;
    }

    _recordKey(key) {
        return `${this.recordPrefix}${encodeURIComponent(key)}`;
    }

    async get(key) {
        const value = await this._command(['GET', this._recordKey(key)]);
        return value === null ? null : JSON.parse(value);
    }

    async save(key, value) {
        await this._command(['SET', this._recordKey(key), JSON.stringify(value)]);
        await this._command(['SADD', this.indexKey, key]);
    }

    async list() {
        const keys = await this._command(['SMEMBERS', this.indexKey]);
        const records = await Promise.all(keys.map(async key => ({
            key,
            value: await this.get(key)
        })));
        return records.filter(record => record.value !== null);
    }
}

module.exports = UpstashRedisStore;
