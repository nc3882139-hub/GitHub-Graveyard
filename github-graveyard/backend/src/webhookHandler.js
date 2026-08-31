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
                const deletedData = this.parseDeletions(diff);
                
                // Store in graveyard if there are deletions
                if (deletedData.deletedLines.length > 0) {
                    graveyardManager.addDeletion(repoName, {
                        commitId: commit.id,
                        message: commit.message,
                        author: commit.author?.name || 'Unknown',
                        timestamp: new Date(),
                        lines: deletedData.deletedLines,
                        stats: {
                            totalDeletions: deletedData.deletedLines.length,
                            filesModified: deletedData.filesModified
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error handling push:', error);
            throw error;
        }
    }

    /**
     * Parse unified diff format to extract deleted lines
     * Handles edge cases: binary files, renames, multiple files
     * 
     * Diff format:
     *   diff --git a/path/file b/path/file
     *   --- a/path/file
     *   +++ b/path/file
     *   @@ -start,count +start,count @@
     *   -deleted line
     *   +added line
     *    context line
     */
    parseDeletions(diff) {
        const deletedLines = [];
        const filesModified = new Set();
        const lines = diff.split('\n');

        let currentFile = null;
        let isBinaryFile = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Detect new file hunk
            if (line.startsWith('diff --git')) {
                const match = line.match(/a\/(.+?)\s+b\//);
                if (match) {
                    currentFile = match[1];
                    isBinaryFile = false;
                }
                continue;
            }

            // Detect binary files (skip them)
            if (line.includes('Binary files') || line.includes('binary file')) {
                isBinaryFile = true;
                continue;
            }

            // Handle file renames/moves
            if (line.startsWith('rename from ') || line.startsWith('copy from ')) {
                // For renames, use the new filename
                continue;
            }

            if (line.startsWith('--- a/')) {
                // Extract old filename (more reliable than from diff --git)
                const oldFile = line.substring(6);
                if (oldFile !== '/dev/null') {
                    currentFile = oldFile;
                }
                continue;
            }

            if (line.startsWith('+++ b/')) {
                const newFile = line.substring(6);
                if (newFile !== '/dev/null' && !isBinaryFile) {
                    filesModified.add(newFile);
                    currentFile = newFile;
                }
                continue;
            }

            // Skip binary file content
            if (isBinaryFile) {
                continue;
            }

            // Only capture deleted lines (start with -)
            // Skip lines that are part of the diff metadata
            if (line.startsWith('-') && !line.startsWith('---') && !line.startsWith('-+-')) {
                if (currentFile && currentFile !== '/dev/null') {
                    deletedLines.push({
                        file: currentFile,
                        content: line.substring(1),
                        timestamp: new Date()
                    });
                }
            }
        }

        return {
            deletedLines,
            filesModified: Array.from(filesModified)
        };
    }

    /**
     * Legacy method for backward compatibility
     * Use parseDeletions instead
     */
    getModifiedFiles(diff) {
        const { filesModified } = this.parseDeletions(diff);
        return filesModified;
    }
}

module.exports = new WebhookHandler();