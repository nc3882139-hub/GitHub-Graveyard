const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const webhookHandler = require('./webhookHandler');
const GraveyardManager = require('./graveyardManager');
const ResurrectionService = require('./resurrectionService');
const { authenticateAPI } = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const { errorHandler, ValidationError } = require('./utils/errors');
const Logger = require('./utils/logger');

const logger = new Logger('Server');
const app = express();
const graveyardManager = new GraveyardManager();
const resurrectionService = new ResurrectionService();

function validateRepoId(repoId) {
    if (!repoId || typeof repoId !== 'string') {
        throw new ValidationError('Missing repoId parameter');
    }

    const normalized = repoId.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
        throw new ValidationError('Invalid repoId format. Expected: owner/repo');
    }

    return normalized;
}

function verifyWebhookSignature(rawBody, signature) {
    if (!process.env.WEBHOOK_SECRET || typeof signature !== 'string' || !signature.startsWith('sha256=')) {
        return false;
    }

    const expected = `sha256=${crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function parseJsonBody(req, res, next) {
    if (!Buffer.isBuffer(req.body)) {
        return next();
    }

    try {
        req.rawBody = req.body;
        req.body = JSON.parse(req.body.toString('utf8'));
        next();
    } catch (error) {
        return res.status(400).json({ success: false, error: 'Malformed JSON request body' });
    }
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.set('trust proxy', 1);
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origin not allowed'));
    },
    credentials: false
}));
app.use(express.raw({ type: 'application/json', limit: '1mb' }));
app.use(parseJsonBody);
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache');
    next();
});
app.use('/api/', rateLimiter.limit(100, 15 * 60 * 1000));

app.get(['/health', '/api/health'], (req, res) => {
    res.json({ success: true, status: 'ok', message: 'GitHub Graveyard is running' });
});

app.post(['/webhook', '/api/webhook'], async (req, res, next) => {
    if (!verifyWebhookSignature(req.rawBody || Buffer.from(''), req.headers['x-hub-signature-256'])) {
        return res.status(401).json({ success: false, error: 'Invalid or missing webhook signature' });
    }

    const event = req.headers['x-github-event'];
    if (!event) {
        return res.status(400).json({ success: false, error: 'Missing x-github-event header' });
    }

    if (event !== 'push') {
        return res.status(202).json({ success: true, message: `Event type '${event}' not handled` });
    }

    if (!req.body || !req.body.repository || !Array.isArray(req.body.commits)) {
        return res.status(400).json({ success: false, error: 'Malformed push webhook payload' });
    }

    try {
        await webhookHandler.handlePush(req.body, graveyardManager);
        return res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
        logger.error('Error processing webhook', error);
        return next(error);
    }
});

app.get(['/api/graveyard/:repoId', '/api/graveyard/*', '/graveyard/:repoId', '/graveyard/*'], authenticateAPI, (req, res, next) => {
    try {
        const repoId = validateRepoId(req.params.repoId || req.params[0]);
        return graveyardManager.ready.then(() => res.json(graveyardManager.getGraveyardData(repoId))).catch(next);
    } catch (error) {
        logger.error('Error retrieving graveyard data', error);
        return next(error);
    }
});

app.post(['/api/resurrect/:repoId', '/api/resurrect/*', '/resurrect/:repoId', '/resurrect/*'], authenticateAPI, async (req, res, next) => {
    try {
        const repoId = validateRepoId(req.params.repoId || req.params[0]);
        await graveyardManager.ready;
        const graveyard = graveyardManager.getGraveyardData(repoId);
        const recentDeletions = (graveyard.deletions || []).filter(deletion => {
            return new Date(deletion.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000);
        });

        if (recentDeletions.length === 0) {
            return res.json({ success: false, demo: true, message: 'No deletions in the last 24 hours. Only recent deletions can be resurrected.', deletionCount: 0 });
        }

        const [owner, repo] = repoId.split('/');
        return res.json(await resurrectionService.resurrectCode(owner, repo, recentDeletions));
    } catch (error) {
        logger.error('Error resurrecting code', error);
        return next(error);
    }
});

app.use((req, res) => res.status(404).json({ success: false, error: 'Endpoint not found' }));
app.use(errorHandler);

module.exports = app;