require('dotenv').config();
const app = require('./app');
const Logger = require('./utils/logger');

const logger = new Logger('Server');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logger.info(`🧟 GitHub Graveyard running on port ${PORT}`);
    if (process.env.NODE_ENV === 'development') {
        logger.info('Running in development mode');
    }
});