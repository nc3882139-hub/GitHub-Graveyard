const fs = require('fs').promises;
const path = require('path');

class GraveyardManager {
    constructor() {
        this.graveyards = new Map();
        this.storagePath = path.join(__dirname, '../data');
        this.ensureStorageDirectory();
        this.loadGraveyards();
    }

    async ensureStorageDirectory() {
        try {
            await fs.mkdir(this.storagePath, { recursive: true });
        } catch (error) {
            console.error('Error creating storage directory:', error);
        }
    }

    async loadGraveyards() {
        try {
            const files = await fs.readdir(this.storagePath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const repoId = file.replace('.json', '');
                    const data = await fs.readFile(
                        path.join(this.storagePath, file),
                        'utf8'
                    );
                    this.graveyards.set(repoId, JSON.parse(data));
                }
            }
        } catch (error) {
            console.error('Error loading graveyards:', error);
        }
    }

    async saveGraveyard(repoId) {
        try {
            const data = this.graveyards.get(repoId);
            if (data) {
                await fs.writeFile(
                    path.join(this.storagePath, `${repoId}.json`),
                    JSON.stringify(data, null, 2)
                );
            }
        } catch (error) {
            console.error('Error saving graveyard:', error);
        }
    }

    addDeletion(repoId, deletionData) {
        if (!this.graveyards.has(repoId)) {
            this.graveyards.set(repoId, {
                repoId,
                deletions: [],
                stats: {
                    totalDeletions: 0,
                    totalFiles: new Set(),
                    lastUpdate: null
                }
            });
        }

        const graveyard = this.graveyards.get(repoId);
        graveyard.deletions.push(deletionData);
        graveyard.stats.totalDeletions += deletionData.lines.length;
        graveyard.stats.totalFiles.add(...deletionData.stats.filesModified);
        graveyard.stats.lastUpdate = new Date();

        this.saveGraveyard(repoId);
    }

    getGraveyardData(repoId) {
        const graveyard = this.graveyards.get(repoId);
        if (!graveyard) return { deletions: [], stats: { totalDeletions: 0 } };
        
        // Convert Set to Array for JSON
        return {
            ...graveyard,
            stats: {
                ...graveyard.stats,
                totalFiles: Array.from(graveyard.stats.totalFiles)
            }
        };
    }

    async resurrect(repoId) {
        const graveyard = this.graveyards.get(repoId);
        if (!graveyard || graveyard.deletions.length === 0) {
            return { success: false, message: 'Nothing to resurrect' };
        }

        // Get the last 24 hours of deletions
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentDeletions = graveyard.deletions.filter(
            d => new Date(d.timestamp) > twentyFourHoursAgo
        );

        if (recentDeletions.length === 0) {
            return { success: false, message: 'No deletions in the last 24 hours' };
        }

        // Create a resurrection report
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

        // Save resurrection data
        const resurrectionPath = path.join(this.storagePath, `${repoId}_resurrection.json`);
        await fs.writeFile(
            resurrectionPath,
            JSON.stringify(resurrectionData, null, 2)
        );

        return {
            success: true,
            message: `Resurrected ${resurrectionData.restoredLines.length} lines from ${resurrectionData.files.size} files`,
            data: {
                ...resurrectionData,
                files: Array.from(resurrectionData.files)
            }
        };
    }
}

module.exports = GraveyardManager;