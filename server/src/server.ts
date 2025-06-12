import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
// Add closeWorker to the import
import { startWorker, closeWorker } from './worker';
import { Room } from './room';
import { config } from './config';

const app = express();
app.use(cors());
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: '*',
    },
});

let room: Room;

(async () => {
    const worker = await startWorker();
    room = new Room(worker);
})();

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        room.removePeer(socket.id);
    });

    socket.on('getRouterRtpCapabilities', (callback) => {
        callback(room.getRtpCapabilities());
    });

    socket.on('createWebRtcTransport', async (callback) => {
        try {
            const { params } = await room.createWebRtcTransport(socket.id);
            callback(params);
        } catch (err) {
            console.error(err);
            callback({ error: (err as Error).message });
        }
    });

    socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
        try {
            await room.connectTransport(socket.id, transportId, dtlsParameters);
            callback('connected');
        } catch (err) {
            console.error(err);
            callback({ error: (err as Error).message });
        }
    });

    socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
        try {
            const producerId = await room.createProducer(socket.id, transportId, kind, rtpParameters);
            callback({ id: producerId });

            if (room.hasAudioAndVideoProducers() && !room.isBroadcasting()) {
                console.log("Sufficient producers found, starting HLS broadcast...");
                await room.startBroadcasting();
            }
        } catch (err) {
            console.error(err);
            callback({ error: (err as Error).message });
        }
    });
});

// --- UPDATED SHUTDOWN LOGIC ---
const handleShutdown = () => {
    console.log('Server shutting down...');
    // Close the Mediasoup Worker
    closeWorker();

    // Close the Room (which closes FFmpeg)
    if (room) {
        room.close();
    }

    // Allow time for cleanup before exiting
    setTimeout(() => {
        console.log('Exiting process.');
        process.exit(0);
    }, 1000); // Wait 1 second
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

httpServer.listen(config.http.port, () => {
    console.log(`Server is running on port ${config.http.port}`);
});