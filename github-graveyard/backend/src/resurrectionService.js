const GitHubService = require('./githubService');
const Logger = require('./utils/logger');
const { GitHubAPIError, ValidationError } = require('./utils/errors');

const logger = new Logger('ResurrectionService');

/**
 * Resurrection Service
 * Handles the restoration of deleted code to GitHub repositories
 * by creating pull requests with the restored content
 */
class ResurrectionService {
    constructor() {
        this.githubService = new GitHubService();
    }

    /**
     * Resurrect deleted code by creating a GitHub PR
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {Array} deletions - Array of deleted code objects
     * @returns {Promise} Resurrection result
     */
    async resurrectCode(owner, repo, deletions) {
        if (!deletions || deletions.length === 0) {
            throw new ValidationError('No deletions to resurrect');
        }

        try {
            logger.info('Starting resurrection process', { owner, repo, deletionCount: deletions.length });

            // Group deletions by file
            const filesByPath = this._groupDeletionsByFile(deletions);

            // Create branch for resurrection
            const branchName = `resurrection-${Date.now()}`;
            logger.info('Creating branch', { branch: branchName });
            
            // Get default branch
            const defaultBranch = await this.githubService.getDefaultBranch(owner, repo);
            
            // Get latest commit on default branch
            const commits = await this.githubService.getLatestCommit(owner, repo, defaultBranch);
            if (!commits || commits.length === 0) {
                throw new GitHubAPIError('No commits found on repository');
            }

            const baseSha = commits[0].sha;
            logger.debug('Base SHA', { sha: baseSha });

            // Create new branch from base
            await this.githubService.createBranch(owner, repo, branchName, baseSha);
            logger.info('Branch created successfully', { branch: branchName });

            // Build restoration content
            const restorationContent = this._buildRestorationContent(filesByPath);
            
            // Update files on new branch
            const filesUpdated = await this._updateFilesOnBranch(
                owner, 
                repo, 
                branchName, 
                filesByPath
            );

            logger.info('Files updated', { count: filesUpdated });

            // Create pull request
            const prNumber = await this.githubService.createPullRequest(
                owner,
                repo,
                branchName,
                defaultBranch,
                '🧟 Graveyard Resurrection',
                this._buildPRDescription(deletions, filesByPath)
            );

            logger.info('Pull request created', { prNumber, url: `https://github.com/${owner}/${repo}/pull/${prNumber}` });

            return {
                success: true,
                message: `Successfully created resurrection PR #${prNumber}`,
                prNumber,
                branch: branchName,
                filesRestored: Object.keys(filesByPath).length,
                linesRestored: deletions.length,
                url: `https://github.com/${owner}/${repo}/pull/${prNumber}`
            };

        } catch (error) {
            logger.error('Resurrection failed', error);
            throw error;
        }
    }

    /**
     * Group deletions by file path
     * @private
     */
    _groupDeletionsByFile(deletions) {
        const files = {};
        
        for (const deletion of deletions) {
            for (const line of deletion.lines) {
                if (!files[line.file]) {
                    files[line.file] = [];
                }
                files[line.file].push(line.content);
            }
        }

        return files;
    }

    /**
     * Build restoration content for PR description
     * @private
     */
    _buildRestorationContent(filesByPath) {
        const content = {};
        
        for (const [filePath, lines] of Object.entries(filesByPath)) {
            // Create a block comment explaining the restoration
            content[filePath] = lines.join('\n');
        }

        return content;
    }

    /**
     * Build PR description with resurrection details
     * @private
     */
    _buildPRDescription(deletions, filesByPath) {
        const fileCount = Object.keys(filesByPath).length;
        const totalLines = deletions.reduce((sum, d) => sum + d.lines.length, 0);
        
        let description = `## 🧟 Code Resurrection\n\n`;
        description += `This pull request restores code that was previously deleted from the repository.\n\n`;
        description += `### Summary\n`;
        description += `- **Files Affected**: ${fileCount}\n`;
        description += `- **Lines Restored**: ${totalLines}\n`;
        description += `- **Source**: GitHub Graveyard\n\n`;
        
        description += `### Files\n`;
        for (const file of Object.keys(filesByPath).sort()) {
            description += `- \`${file}\`\n`;
        }

        description += `\n### Instructions\n`;
        description += `1. Review the restored code carefully\n`;
        description += `2. Merge this PR if the restoration looks correct\n`;
        description += `3. Adjust file placements if necessary\n\n`;
        
        description += `---\n`;
        description += `_Created by [GitHub Graveyard](https://github.com/nc3882139-hub/GitHub-Graveyard)_`;

        return description;
    }

    /**
     * Update files on a branch
     * @private
     */
    async _updateFilesOnBranch(owner, repo, branchName, filesByPath) {
        let filesUpdated = 0;

        for (const [filePath, content] of Object.entries(filesByPath)) {
            try {
                // For now, we'll just create new files with restoration content
                // In a production system, you'd want to merge this with existing content
                await this.githubService.updateFile(
                    owner,
                    repo,
                    filePath,
                    content.join('\n'),
                    `Resurrect deleted code from ${filePath}`,
                    branchName
                );
                filesUpdated++;
            } catch (error) {
                logger.warn('Failed to update file', error, { filePath });
                // Continue updating other files even if one fails
            }
        }

        return filesUpdated;
    }
}

module.exports = ResurrectionService;
