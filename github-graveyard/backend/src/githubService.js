const axios = require('axios');

class GitHubService {
    constructor() {
        this.client = axios.create({
            baseURL: 'https://api.github.com',
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.diff'
            }
        });
    }

    async getCommitDiff(owner, repo, commitSha) {
        try {
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
            console.error('Error getting commit diff:', error);
            return '';
        }
    }

    async getRepositoryInfo(owner, repo) {
        try {
            const response = await this.client.get(`/repos/${owner}/${repo}`);
            return response.data;
        } catch (error) {
            console.error('Error getting repo info:', error);
            return null;
        }
    }

    async getCommitHistory(owner, repo, since) {
        try {
            const response = await this.client.get(
                `/repos/${owner}/${repo}/commits`,
                {
                    params: { since: since.toISOString() }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Error getting commit history:', error);
            return [];
        }
    }
}

module.exports = GitHubService;