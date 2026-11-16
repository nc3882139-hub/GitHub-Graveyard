const createStorage = require('./storage');

function getRetentionDays(value) {
    const days = value === undefined ? 30 : Number(value);
    if (!Number.isInteger(days) || days < 1) {
        throw new Error('RETENTION_DAYS must be a positive integer');
    }
    return days;
}

class GraveyardManager {
    constructor(storage = createStorage(), retentionDays = getRetentionDays(process.env.RETENTION_DAYS)) {
        this.graveyards = new Map();
        this.storage = storage;
        this.retentionDays = retentionDays;
        this.ready = this.loadGraveyards();
    }

    _pruneDeletions(graveyard, now = Date.now()) {
        const cutoff = now - this.retentionDays * 24 * 60 * 60 * 1000;
        graveyard.deletions = graveyard.deletions.filter(deletion => {
            const timestamp = new Date(deletion.timestamp).getTime();
            return Number.isFinite(timestamp) && timestamp >= cutoff;
        });

        const files = new Set();
        let totalDeletions = 0;
        for (const deletion of graveyard.deletions) {
            totalDeletions += Array.isArray(deletion.lines) ? deletion.lines.length : 0;
            for (const file of deletion.stats?.filesModified || []) {
                files.add(file);
            }
            for (const line of Array.isArray(deletion.lines) ? deletion.lines : []) {
                if (line.file) {
                    files.add(line.file);
                }
            }
        }

        graveyard.stats = {
            totalDeletions,
            totalFiles: Array.from(files),
            lastUpdate: graveyard.deletions.length
                ? graveyard.deletions.reduce((latest, deletion) => (
                    new Date(deletion.timestamp) > latest ? new Date(deletion.timestamp) : latest
                ), new Date(0))
                : null
        };
    }

    async loadGraveyards() {
        const records = await this.storage.list();
        for (const record of records) {
            const graveyard = record.value;
            if (!graveyard || !Array.isArray(graveyard.deletions)) {
                continue;
            }

            graveyard.repoId = graveyard.repoId || record.key;
            graveyard.stats = graveyard.stats || {};
            this._pruneDeletions(graveyard);
            this.graveyards.set(graveyard.repoId, graveyard);
            await this.storage.save(graveyard.repoId, graveyard);
        }
    }

    async saveGraveyard(repoId) {
        const data = this.graveyards.get(repoId);
        if (data) {
            await this.storage.save(repoId, data);
        }
    }

    async addDeletion(repoId, deletionData) {
        await this.ready;
        if (!this.graveyards.has(repoId)) {
            this.graveyards.set(repoId, {
                repoId,
                deletions: [],
                stats: {
                    totalDeletions: 0,
                    totalFiles: [],
                    lastUpdate: null
                }
            });
        }

        const graveyard = this.graveyards.get(repoId);
        this._pruneDeletions(graveyard);
        graveyard.deletions.push(deletionData);
        this._pruneDeletions(graveyard);
        await this.saveGraveyard(repoId);
    }

    getGraveyardData(repoId) {
        const graveyard = this.graveyards.get(repoId);
        if (!graveyard) {
            return {
                deletions: [],
                stats: {
                    totalDeletions: 0,
                    totalFiles: [],
                    lastUpdate: null
                }
            };
        }

        return graveyard;
    }

    async resurrect(repoId) {
        await this.ready;
        const graveyard = this.graveyards.get(repoId);
        if (!graveyard || graveyard.deletions.length === 0) {
            return { success: false, message: 'Nothing to resurrect' };
        }

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentDeletions = graveyard.deletions.filter(
            deletion => new Date(deletion.timestamp) > twentyFourHoursAgo
        );

        if (recentDeletions.length === 0) {
            return { success: false, message: 'No deletions in the last 24 hours' };
        }

        const resurrectionData = {
            timestamp: new Date(),
            restoredLines: [],
            files: new Set()
        };

        for (const deletion of recentDeletions) {
            for (const line of deletion.lines) {
                resurrectionData.restoredLines.push({
                    file: line.file,
                    content: line.content,
                    commitId: deletion.commitId
                });
                resurrectionData.files.add(line.file);
            }
        }

        const files = Array.from(resurrectionData.files);
        await this.storage.save(`${repoId}_resurrection`, {
            timestamp: resurrectionData.timestamp,
            restoredLines: resurrectionData.restoredLines,
            files
        });

        return {
            success: true,
            message: `Resurrected ${resurrectionData.restoredLines.length} lines from ${resurrectionData.files.size} files`,
            data: {
                ...resurrectionData,
                files
            }
        };
    }
}

module.exports = GraveyardManager;
