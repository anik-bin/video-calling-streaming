import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { promises as fs } from 'fs';
import { config } from './config';
import {
    Worker,
    Router,
    WebRtcTransport,
    Producer,
    RtpCapabilities,
    MediaKind,
    RtpParameters,
    DtlsParameters,
    Transport,
    PlainTransport,
} from 'mediasoup/node/lib/types';


interface Peer {
    socketId: string;
    transports: Map<string, Transport>;
    producers: Map<string, Producer>;
}

export class Room {
    private worker: Worker;
    private router!: Router;
    private peers: Map<string, Peer> = new Map();
    private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;

    constructor(worker: Worker) {
        this.worker = worker;
        this.init();
    }

    private async init() {
        this.router = await this.worker.createRouter({
            mediaCodecs: config.mediasoup.router.mediaCodecs,
        });
    }

    public getRtpCapabilities(): RtpCapabilities {
        return this.router.rtpCapabilities;
    }

    public async createWebRtcTransport(socketId: string) {
        const transport = await this.router.createWebRtcTransport(config.mediasoup.webRtcTransport);

        if (!this.peers.has(socketId)) {
            this.peers.set(socketId, { socketId, transports: new Map(), producers: new Map() });
        }
        this.peers.get(socketId)!.transports.set(transport.id, transport);

        return {
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            },
        };
    }

    public async connectTransport(socketId: string, transportId: string, dtlsParameters: DtlsParameters) {
        const peer = this.peers.get(socketId);
        if (!peer) throw new Error('Peer not found');

        const transport = peer.transports.get(transportId);
        if (!transport) throw new Error('Transport not found');

        await transport.connect({ dtlsParameters });
    }

    public async createProducer(socketId: string, transportId: string, kind: MediaKind, rtpParameters: RtpParameters) {
        const peer = this.peers.get(socketId);
        if (!peer) throw new Error('Peer not found');

        const transport = peer.transports.get(transportId);
        if (!transport) throw new Error('Transport not found');

        const producer = await transport.produce({ kind, rtpParameters });
        peer.producers.set(producer.id, producer);

        producer.on('transportclose', () => {
            console.log(`Producer's transport closed: ${producer.id}`);
            peer.producers.delete(producer.id);
        });

        return producer.id;
    }

    public hasAudioAndVideoProducers(): boolean {
        const hasAudio = this.getProducerByKind('audio') !== undefined;
        const hasVideo = this.getProducerByKind('video') !== undefined;
        return hasAudio && hasVideo;
    }

    public removePeer(socketId: string) {
        const peer = this.peers.get(socketId);
        if (peer) {
            peer.transports.forEach((transport) => transport.close());
            this.peers.delete(socketId);
        }
    }

    public isBroadcasting(): boolean {
        return !!this.ffmpegProcess;
    }

    public close() {
        console.log("Closing room and stopping FFmpeg process...");
        this.ffmpegProcess?.kill('SIGKILL');
        this.ffmpegProcess = null;
    }

    // Replace the entire startBroadcasting method in server/src/Room.ts

    public async startBroadcasting() {
        const HLS_OUTPUT_DIR = '../public/live';
        const sdpFilePath = 'ffmpeg-sdp.sdp';

        try {
            await fs.mkdir(HLS_OUTPUT_DIR, { recursive: true });
        } catch (e) {
            // directory already exists
        }

        const videoProducer = this.getProducerByKind('video');
        const audioProducer = this.getProducerByKind('audio');

        if (!videoProducer || !audioProducer) {
            console.warn("Cannot start broadcast without both audio and video producers present.");
            return;
        }

        // --- Create PlainTransports and Consumers ---
        const videoTransport = await this.router.createPlainTransport(config.mediasoup.plainRtpTransport);
        await videoTransport.connect({ ip: '127.0.0.1' });
        const videoConsumer = await videoTransport.consume({
            producerId: videoProducer.id,
            rtpCapabilities: this.router.rtpCapabilities,
            paused: true,
        });

        const audioTransport = await this.router.createPlainTransport(config.mediasoup.plainRtpTransport);
        await audioTransport.connect({ ip: '127.0.0.1' });
        const audioConsumer = await audioTransport.consume({
            producerId: audioProducer.id,
            rtpCapabilities: this.router.rtpCapabilities,
            paused: true,
        });

        // --- CORRECTED SDP FILE CONTENT ---
        // This format is more explicit and robust for FFmpeg.
        const sdpFileContent = `
v=0
o=- 0 0 IN IP4 127.0.0.1
s=FFmpeg
c=IN IP4 127.0.0.1
t=0 0
m=audio ${audioTransport.tuple.localPort} RTP/AVP ${audioConsumer.rtpParameters.codecs[0].payloadType}
a=rtpmap:${audioConsumer.rtpParameters.codecs[0].payloadType} ${audioConsumer.rtpParameters.codecs[0].mimeType.replace('audio/', '')}/${audioConsumer.rtpParameters.codecs[0].clockRate}/${audioConsumer.rtpParameters.codecs[0].channels}
a=sendonly
m=video ${videoTransport.tuple.localPort} RTP/AVP ${videoConsumer.rtpParameters.codecs[0].payloadType}
a=rtpmap:${videoConsumer.rtpParameters.codecs[0].payloadType} ${videoConsumer.rtpParameters.codecs[0].mimeType.replace('video/', '')}/${videoConsumer.rtpParameters.codecs[0].clockRate}
a=sendonly
`;
        // --- END OF SDP CORRECTION ---

        await fs.writeFile(sdpFilePath, sdpFileContent);

        // Give the OS a brief moment to ensure the file is written before FFmpeg tries to read it.
        await new Promise(resolve => setTimeout(resolve, 100));

        const ffmpegCommand = 'ffmpeg';
        const ffmpegArgs = [
            '-protocol_whitelist', 'file,udp,rtp',
            '-re', // Read input at native frame rate. Useful for live streams.
            '-i', sdpFilePath,
            '-map', '0:v:0',
            '-map', '0:a:0',
            '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '48000', '-b:a', '128k',
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '5',
            '-hls_flags', 'delete_segments+program_date_time',
            '-hls_segment_filename', `${HLS_OUTPUT_DIR}/segment_%03d.ts`,
            `${HLS_OUTPUT_DIR}/playlist.m3u8`
        ].flat();

        this.ffmpegProcess = spawn(ffmpegCommand, ffmpegArgs);

        this.ffmpegProcess.on('error', (err) => {
            console.error(`FFMPEG process error: ${err}`);
        });

        this.ffmpegProcess.stderr.on('data', (data: Buffer) => {
            console.error(`FFMPEG stderr: ${data.toString()}`);
        });
        this.ffmpegProcess.on('close', (code: number) => {
            console.log(`FFMPEG process exited with code ${code}`);
            videoConsumer.close();
            audioConsumer.close();
            videoTransport.close();
            audioTransport.close();
            this.ffmpegProcess = null;
        });

        // Resume the consumers to start the flow of media
        await videoConsumer.resume();
        await audioConsumer.resume();

        console.log("FFMPEG process started for HLS streaming.");
    }

    public getProducerCount(): number {
        let count = 0;
        this.peers.forEach(peer => {
            count += peer.producers.size;
        });
        return count;
    }

    private getProducerByKind(kind: MediaKind): Producer | undefined {
        for (const peer of this.peers.values()) {
            for (const producer of peer.producers.values()) {
                if (producer.kind === kind) {
                    return producer;
                }
            }
        }
        return undefined;
    }
}