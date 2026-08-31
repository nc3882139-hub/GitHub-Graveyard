const axios = require('axios');
const Logger = require('./utils/logger');
const { GitHubAPIError } = require('./utils/errors');

const logger = new Logger('GitHubService');

class GitHubService {
    constructor() {
        this.client = axios.create({
            baseURL: 'https://api.github.com',
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            response => response,
            error => {
                const status = error.response?.status;
                const message = error.response?.data?.message || error.message;
                
                logger.error('GitHub API error', error, {
                    status,
                    url: error.config?.url,
                    message
                });

                if (status === 401) {
                    throw new GitHubAPIError('GitHub authentication failed', 401, { message });
                } else if (status === 404) {
                    throw new GitHubAPIError('Repository not found', 404, { message });
                } else if (status === 403) {
                    throw new GitHubAPIError('GitHub rate limit exceeded or access denied', 403, { message });
                } else if (status >= 500) {
                    throw new GitHubAPIError('GitHub API server error', status, { message });
                }

                throw new GitHubAPIError(message, status || 500);
            }
        );
    }

    async getCommitDiff(owner, repo, commitSha) {
        try {
            logger.debug('Fetching commit diff', { owner, repo, sha: commitSha });
            
            const response = await this.client.get(
                `/repos/${owner}/${repo}/commits/${commitSha}`,
                {
                    headers: {
                        'Accept': 'application/vnd.github.v3.diff'
                    }
                }
            );
            
            return response.data;
        } catch (error) {
            logger.error('Error getting commit diff', error, { owner, repo, commitSha });
            throw error;
        }
    }

    async getRepositoryInfo(owner, repo) {
        try {
            logger.debug('Fetching repository info', { owner, repo });
            
            const response = await this.client.get(`/repos/${owner}/${repo}`);
            return response.data;
        } catch (error) {
            logger.error('Error getting repo info', error, { owner, repo });
            throw error;
        }
    }

    async getCommitHistory(owner, repo, since) {
        try {
            logger.debug('Fetching commit history', { owner, repo, since });
            
            const response = await this.client.get(
                `/repos/${owner}/${repo}/commits`,
                {
                    params: { since: since.toISOString() }
                }
            );
            
            return response.data;
        } catch (error) {
            logger.error('Error getting commit history', error, { owner, repo });
            throw error;
        }
    }

    async getDefaultBranch(owner, repo) {
        try {
            logger.debug('Fetching default branch', { owner, repo });
            
            const response = await this.client.get(`/repos/${owner}/${repo}`);
            return response.data.default_branch || 'main';
        } catch (error) {
            logger.error('Error getting default branch', error, { owner, repo });
            throw error;
        }
    }

    async getLatestCommit(owner, repo, branch = 'main') {
        try {
            logger.debug('Fetching latest commit', { owner, repo, branch });
            
            const response = await this.client.get(
                `/repos/${owner}/${repo}/commits`,
                { params: { sha: branch, per_page: 1 } }
            );
            
            return response.data;
        } catch (error) {
            logger.error('Error getting latest commit', error, { owner, repo, branch });
            throw error;
        }
    }

    async createBranch(owner, repo, branchName, sha) {
        try {
            logger.info('Creating branch', { owner, repo, branch: branchName, sha });
            
            const response = await this.client.post(
                `/repos/${owner}/${repo}/git/refs`,
                {
                    ref: `refs/heads/${branchName}`,
                    sha: sha
                }
            );
            
            return response.data;
        } catch (error) {
            logger.error('Error creating branch', error, { owner, repo, branch: branchName });
            throw error;
        }
    }

    async updateFile(owner, repo, path, content, message, branch = 'main') {
        try {
            logger.debug('Updating file', { owner, repo, path, branch });
            
            // Try to get existing file for sha
            let fileSha = null;
            try {
                const existing = await this.client.get(
                    `/repos/${owner}/${repo}/contents/${path}`,
                    { params: { ref: branch } }
                );
                fileSha = existing.data.sha;
            } catch (err) {
                // File doesn't exist, which is fine
                logger.debug('File does not exist yet', { path });
            }

            const response = await this.client.put(
                `/repos/${owner}/${repo}/contents/${path}`,
                {
                    message,
                    content: Buffer.from(content).toString('base64'),
                    branch,
                    sha: fileSha
                }
            );
            
            return response.data;
        } catch (error) {
            logger.error('Error updating file', error, { owner, repo, path });
            throw error;
        }
    }

    async createPullRequest(owner, repo, head, base, title, description) {
        try {
            logger.info('Creating pull request', { owner, repo, head, base, title });
            
            const response = await this.client.post(
                `/repos/${owner}/${repo}/pulls`,
                {
                    title,
                    body: description,
                    head,
                    base
                }
            );
            
            return response.data.number;
        } catch (error) {
            logger.error('Error creating pull request', error, { owner, repo, head, base });
            throw error;
        }
    }
}

module.exports = GitHubService;