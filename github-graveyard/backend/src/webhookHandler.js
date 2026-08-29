const GitHubService = require('./githubService');

class WebhookHandler {
    constructor() {
        this.githubService = new GitHubService();
    }

    async handlePush(payload, graveyardManager) {
        try {
            const repoName = payload.repository.full_name;
            const commits = payload.commits || [];
            
            for (const commit of commits) {
                // Get the diff for each commit
                const diff = await this.githubService.getCommitDiff(
                    payload.repository.owner.name,
                    payload.repository.name,
                    commit.id
                );
                
                // Parse deletions
                const deletedLines = this.parseDeletions(diff);
                
                // Store in graveyard
                if (deletedLines.length > 0) {
                    graveyardManager.addDeletion(repoName, {
                        commitId: commit.id,
                        message: commit.message,
                        author: commit.author.name,
                        timestamp: new Date(),
                        lines: deletedLines,
                        stats: {
                            totalDeletions: deletedLines.length,
                            filesModified: this.getModifiedFiles(diff)
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error handling push:', error);
        }
    }

    parseDeletions(diff) {
        const deletedLines = [];
        const lines = diff.split('\n');
        let currentFile = null;
        
        for (const line of lines) {
            // Detect file changes
            if (line.startsWith('--- a/')) {
                currentFile = line.substring(6);
                continue;
            }
            
            // Detect deleted lines (starts with -)
            if (line.startsWith('-') && !line.startsWith('---')) {
                deletedLines.push({
                    file: currentFile,
                    content: line.substring(1),
                    lineNumber: null // We'll parse this if needed
                });
            }
        }
        
        return deletedLines;
    }

    getModifiedFiles(diff) {
        const files = new Set();
        const lines = diff.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('diff --git')) {
                const match = line.match(/a\/(.+?)\s+b\//);
                if (match) files.add(match[1]);
            }
        }
        
        return Array.from(files);
    }
}

module.exports = new WebhookHandler();