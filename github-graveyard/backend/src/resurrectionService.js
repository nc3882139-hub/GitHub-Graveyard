const GitHubService = require('./githubService');
const Logger = require('./utils/logger');
const { GitHubAPIError, ValidationError } = require('./utils/errors');

const logger = new Logger('ResurrectionService');

function validateRepoIdentifier(owner, repo) {
    if (!owner || !repo) {
        throw new ValidationError('Repository owner and name are required');
    }

    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
        throw new ValidationError('Repository identifier contains invalid characters');
    }
}

class ResurrectionService {
    constructor() {
        this.githubService = new GitHubService();
    }

    async resurrectCode(owner, repo, deletions) {
        if (!deletions || deletions.length === 0) {
            throw new ValidationError('No deletions to resurrect');
        }

        validateRepoIdentifier(owner, repo);

        if (!process.env.GITHUB_TOKEN) {
            logger.warn('Resurrection requested without a GitHub token; returning demo-safe response');
            return {
                success: false,
                demo: true,
                message: 'Demo mode: GitHub token is not configured, so no real repository mutation was attempted.',
                details: {
                    repo: `${owner}/${repo}`,
                    filesRestored: 0,
                    linesRestored: 0,
                    timestamp: new Date().toISOString()
                }
            };
        }

        try {
            logger.info('Starting resurrection process', { owner, repo, deletionCount: deletions.length });

            const filesByPath = this._groupDeletionsByFile(deletions);
            const branchName = `resurrection-${Date.now()}`;
            const defaultBranch = await this.githubService.getDefaultBranch(owner, repo);
            const commits = await this.githubService.getLatestCommit(owner, repo, defaultBranch);

            if (!commits || commits.length === 0) {
                throw new GitHubAPIError('No commits found on repository');
            }

            const baseSha = commits[0].sha;
            await this.githubService.createBranch(owner, repo, branchName, baseSha);

            const filesUpdated = await this._updateFilesOnBranch(owner, repo, branchName, filesByPath);
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
                demo: false,
                message: `Successfully created resurrection PR #${prNumber}`,
                prNumber,
                branch: branchName,
                filesRestored: Object.keys(filesByPath).length,
                linesRestored: deletions.reduce((sum, deletion) => sum + (deletion.lines?.length || 0), 0),
                url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
                filesUpdated
            };
        } catch (error) {
            logger.error('Resurrection failed', error);
            return {
                success: false,
                demo: true,
                message: 'Resurrection could not be completed in this environment. Review the repository and GitHub access settings before retrying.',
                details: {
                    error: error.message,
                    repo: `${owner}/${repo}`,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    _groupDeletionsByFile(deletions) {
        const files = {};

        for (const deletion of deletions) {
            if (!deletion || !Array.isArray(deletion.lines)) {
                continue;
            }

            for (const line of deletion.lines) {
                const filePath = String(line.file || '').trim();
                if (!filePath || filePath.startsWith('/') || filePath.includes('..')) {
                    continue;
                }

                if (!files[filePath]) {
                    files[filePath] = [];
                }
                files[filePath].push(String(line.content || ''));
            }
        }

        return files;
    }

    _buildPRDescription(deletions, filesByPath) {
        const fileCount = Object.keys(filesByPath).length;
        const totalLines = deletions.reduce((sum, d) => sum + (d.lines?.length || 0), 0);

        let description = '## 🧟 Code Resurrection\n\n';
        description += 'This pull request restores code that was previously deleted from the repository.\n\n';
        description += '### Summary\n';
        description += `- **Files Affected**: ${fileCount}\n`;
        description += `- **Lines Restored**: ${totalLines}\n`;
        description += '- **Source**: GitHub Graveyard\n\n';
        description += '### Files\n';

        for (const file of Object.keys(filesByPath).sort()) {
            description += `- \`${file}\`\n`;
        }

        description += '\n### Instructions\n';
        description += '1. Review the restored code carefully\n';
        description += '2. Merge this PR if the restoration looks correct\n';
        description += '3. Adjust file placements if necessary\n\n';
        description += '---\n';
        description += '_Created by [GitHub Graveyard](https://github.com/nc3882139-hub/GitHub-Graveyard)_';

        return description;
    }

    async _updateFilesOnBranch(owner, repo, branchName, filesByPath) {
        let filesUpdated = 0;

        for (const [filePath, lines] of Object.entries(filesByPath)) {
            try {
                await this.githubService.updateFile(
                    owner,
                    repo,
                    filePath,
                    lines.join('\n'),
                    `Resurrect deleted code from ${filePath}`,
                    branchName
                );
                filesUpdated++;
            } catch (error) {
                logger.warn('Failed to update file', error, { filePath });
            }
        }

        return filesUpdated;
    }
}

module.exports = ResurrectionService;
