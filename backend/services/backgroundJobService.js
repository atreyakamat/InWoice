const logger = require('../utils/logger');
const {
    enqueueBackgroundJob,
    claimNextBackgroundJob,
    completeBackgroundJob,
    failBackgroundJob,
    listBackgroundJobs
} = require('./sqliteService');

const handlers = new Map();
let workerStarted = false;
let draining = false;

const registerJobHandler = (jobType, handler) => {
    handlers.set(jobType, handler);
};

const drainQueue = async () => {
    if (draining) return;
    draining = true;

    try {
        while (true) {
            const job = claimNextBackgroundJob();
            if (!job) break;

            const handler = handlers.get(job.job_type);
            if (!handler) {
                failBackgroundJob(job.job_id, new Error(`No handler registered for job type: ${job.job_type}`));
                continue;
            }

            try {
                const result = await handler(job);
                completeBackgroundJob(job.job_id, result);
            } catch (error) {
                logger.error('[Queue] Job failed', {
                    jobId: job.job_id,
                    jobType: job.job_type,
                    error: error.message
                });
                failBackgroundJob(job.job_id, error);
            }
        }
    } finally {
        draining = false;
    }
};

const startBackgroundJobWorker = () => {
    if (workerStarted || process.env.BACKGROUND_QUEUE_ENABLED === 'false') {
        return;
    }

    workerStarted = true;
    const pollMs = Number(process.env.BACKGROUND_QUEUE_POLL_MS || 3000);
    setInterval(() => {
        drainQueue().catch((error) => {
            logger.error('[Queue] Drain cycle failed', { error: error.message });
        });
    }, pollMs);

    drainQueue().catch((error) => {
        logger.error('[Queue] Initial drain failed', { error: error.message });
    });
};

const enqueueJob = (jobType, payload = {}, options = {}) => {
    const job = enqueueBackgroundJob({
        job_type: jobType,
        payload,
        priority: options.priority || 0,
        run_after: options.runAfter || null,
        max_attempts: options.maxAttempts || 3
    });

    setImmediate(() => {
        drainQueue().catch((error) => logger.error('[Queue] Drain trigger failed', { error: error.message }));
    });

    return job;
};

const getQueuedJobs = (status) => listBackgroundJobs(status);

module.exports = {
    registerJobHandler,
    startBackgroundJobWorker,
    enqueueJob,
    getQueuedJobs
};
