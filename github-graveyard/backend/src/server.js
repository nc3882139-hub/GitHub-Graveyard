const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const webhookHandler = require('./webhookHandler');
const GraveyardManager = require('./graveyardManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ verify: verifyWebhookSignature }));

// Function to verify webhook signature
function verifyWebhookSignature(req, res, buf, encoding) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return;
    
    const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(buf).digest('hex');
    req.rawBody = buf;
    req.signature = signature;
    req.digest = digest;
}

// Initialize Graveyard Manager
const graveyardManager = new GraveyardManager();

// Webhook endpoint
app.post('/webhook', (req, res) => {
    const event = req.headers['x-github-event'];
    const payload = req.body;
    
    // Verify signature (optional but recommended)
    if (req.signature !== req.digest) {
        return res.status(401).send('Invalid signature');
    }
    
    if (event === 'push') {
        webhookHandler.handlePush(payload, graveyardManager);
    }
    
    res.status(200).send('OK');
});

// API endpoint to get deleted lines
app.get('/api/graveyard/:repoId', (req, res) => {
    const { repoId } = req.params;
    const data = graveyardManager.getGraveyardData(repoId);
    res.json(data);
});

// Resurrection endpoint
app.post('/api/resurrect/:repoId', async (req, res) => {
    const { repoId } = req.params;
    const result = await graveyardManager.resurrect(repoId);
    res.json(result);
});

app.listen(PORT, () => {
    console.log(`🧟 GitHub Graveyard running on port ${PORT}`);
});