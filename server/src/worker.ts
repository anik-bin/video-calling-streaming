import * as mediasoup from 'mediasoup';
import { Worker, WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';
import { config } from './config';

let worker: Worker;

interface MediasoupWorkerSettings {
    logLevel: WorkerLogLevel;
    logTags: WorkerLogTag[];
    rtcMinPort: number;
    rtcMaxPort: number;
}

export const startWorker = async () => {
    const workerSettings: MediasoupWorkerSettings = config.mediasoup.worker;

    worker = await mediasoup.createWorker(workerSettings);

    worker.on('died', () => {
        console.error('mediasoup worker has died');
        setTimeout(() => process.exit(1), 2000);
    });

    console.log(`mediasoup worker started with pid ${worker.pid}`);
    return worker;
};

export const getWorker = () => {
    if (!worker) {
        throw new Error('Mediasoup worker not started');
    }
    return worker;
};

// --- ADD THIS NEW FUNCTION ---
export const closeWorker = () => {
    if (worker) {
        console.log('Closing mediasoup worker...');
        worker.close();
    }
};