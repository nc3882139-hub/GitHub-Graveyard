const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const webhookHandler = require('./webhookHandler');
const GraveyardManager = require('./graveyardManager');
const ResurrectionService = require('./resurrectionService');
const { authenticateAPI } = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const { errorHandler, ValidationError } = require('./utils/errors');
const Logger = require('./utils/logger');

const logger = new Logger('Server');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to verify GitHub webhook signature
function verifyWebhookSignature(req, res, buf, encoding) {
    const signature = req.headers['x-hub-signature-256'];
    
    if (!signature) {
        req.isValidSignature = false;
        return;
    }
    
    if (!process.env.WEBHOOK_SECRET) {
        logger.warn('WEBHOOK_SECRET not configured. Webhook signature verification disabled.');
        req.isValidSignature = false;
        return;
    }
    
    try {
        const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
        const digest = 'sha256=' + hmac.update(buf).digest('hex');
        // Use timing-safe comparison
        req.isValidSignature = crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(digest)
        );
    } catch (error) {
        logger.error('Error verifying webhook signature', error);
        req.isValidSignature = false;
    }
}

// Middleware
app.use(cors());
app.use(express.json({ verify: verifyWebhookSignature }));

// Middleware to check webhook signature
app.use((req, res, next) => {
    if (req.path === '/webhook' && !req.isValidSignature) {
        return res.status(401).json({ error: 'Invalid or missing webhook signature' });
    }
    next();
});

// Rate limiting (apply to all API endpoints)
app.use('/api/', rateLimiter.limit(100, 15 * 60 * 1000));

// Initialize services
const graveyardManager = new GraveyardManager();
const resurrectionService = new ResurrectionService();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: '🧟 GitHub Graveyard is running' });
});

// Webhook endpoint
app.post('/webhook', (req, res, next) => {
    const event = req.headers['x-github-event'];
    const payload = req.body;
    
    if (!event) {
        return res.status(400).json({ error: 'Missing x-github-event header' });
    }
    
    if (event === 'push') {
        try {
            webhookHandler.handlePush(payload, graveyardManager);
            res.status(200).json({ success: true, message: 'Webhook processed' });
        } catch (error) {
            logger.error('Error processing webhook', error);
            next(error);
        }
    } else {
        res.status(202).json({ message: `Event type '${event}' not handled (only 'push' events are processed)` });
    }
});

// API endpoint to get deleted lines
app.get('/api/graveyard/:repoId', authenticateAPI, (req, res, next) => {
    const { repoId } = req.params;
    
    if (!repoId) {
        return next(new ValidationError('Missing repoId parameter'));
    }
    
    try {
        const data = graveyardManager.getGraveyardData(repoId);
        res.json(data);
    } catch (error) {
        logger.error('Error retrieving graveyard data', error);
        next(error);
    }
});

// Resurrection endpoint - Creates a GitHub PR to restore deleted code
app.post('/api/resurrect/:repoId', authenticateAPI, async (req, res, next) => {
    const { repoId } = req.params;
    
    if (!repoId) {
        return next(new ValidationError('Missing repoId parameter'));
    }
    
    try {
        logger.info('Resurrection request received', { repoId });
        
        const graveyard = graveyardManager.getGraveyardData(repoId);
        
        if (!graveyard.deletions || graveyard.deletions.length === 0) {
            return next(new ValidationError('No deletions to resurrect'));
        }

        // Parse owner and repo from repoId (format: owner/repo)
        const [owner, repo] = repoId.split('/');
        
        if (!owner || !repo) {
            return next(new ValidationError('Invalid repoId format. Expected: owner/repo'));
        }

        // Get recent deletions (last 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentDeletions = graveyard.deletions.filter(
            d => new Date(d.timestamp) > twentyFourHoursAgo
        );

        if (recentDeletions.length === 0) {
            return res.json({
                success: false,
                message: 'No deletions in the last 24 hours. Only recent deletions can be resurrected.',
                deletionCount: 0
            });
        }

        // Attempt resurrection
        const result = await resurrectionService.resurrectCode(owner, repo, recentDeletions);
        res.json(result);

    } catch (error) {
        logger.error('Error resurrecting code', error);
        next(error);
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
    logger.info(`🧟 GitHub Graveyard running on port ${PORT}`);
    if (process.env.NODE_ENV === 'development') {
        logger.info('Running in development mode');
    }
});