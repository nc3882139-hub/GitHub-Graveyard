/**
 * Logging utility for consistent error and info logging
 * Helps with debugging in production
 */

const LOG_LEVELS = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
};

class Logger {
    constructor(moduleName) {
        this.moduleName = moduleName;
    }

    _formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const meta = data ? ` ${JSON.stringify(data)}` : '';
        return `[${timestamp}] [${level}] [${this.moduleName}] ${message}${meta}`;
    }

    debug(message, data) {
        if (process.env.LOG_LEVEL === 'DEBUG') {
            console.log(this._formatMessage(LOG_LEVELS.DEBUG, message, data));
        }
    }

    info(message, data) {
        console.log(this._formatMessage(LOG_LEVELS.INFO, message, data));
    }

    warn(message, data) {
        console.warn(this._formatMessage(LOG_LEVELS.WARN, message, data));
    }

    error(message, error, data) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(
            this._formatMessage(LOG_LEVELS.ERROR, message, {
                ...data,
                error: errorMsg,
                stack: error instanceof Error ? error.stack : undefined
            })
        );
    }
}

module.exports = Logger;
