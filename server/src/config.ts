import { RtpCodecCapability, WorkerLogTag, WorkerLogLevel } from 'mediasoup/node/lib/types';

interface AppConfig {
    http: {
        ip: string;
        port: number;
    };
    mediasoup: {
        worker: {
            rtcMinPort: number;
            rtcMaxPort: number;
            logLevel: WorkerLogLevel;
            logTags: WorkerLogTag[];
        };
        router: {
            mediaCodecs: RtpCodecCapability[];
        };
        webRtcTransport: {
            listenIps: {
                ip: string;
                announcedIp?: string;
            }[];
            enableUdp: boolean;
            enableTcp: boolean;
            preferUdp: boolean;
            maxIncomingBitrate: number;
            initialAvailableOutgoingBitrate: number;
        };
        plainRtpTransport: {
            listenIp: string;
            rtcpMux: boolean;
            comedia: boolean;
        };
    };
}


export const config: AppConfig = {
    // http server
    http: {
        ip: '0.0.0.0',
        port: 8000,
    },
    // mediasoup
    mediasoup: {
        worker: {
            rtcMinPort: 40000,
            rtcMaxPort: 49999,
            logLevel: 'warn',
            logTags: [
                'info',
                'ice',
                'dtls',
                'rtp',
                'srtp',
                'rtcp',
                // 'payload', // optional
                // 'rtx',     // optional
                // 'bwe',     // optional
                // 'score',   // optional
                // 'simulcast', // optional
                // 'svc'      // optional
            ],
        },
        router: {
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2,
                },
                {
                    kind: 'video',
                    mimeType: 'video/VP8',
                    clockRate: 90000,
                    parameters: {
                        'x-google-start-bitrate': 1000,
                    },
                },
            ],
        },
        // WebRtcTransport settings
        webRtcTransport: {
            listenIps: [
                {
                    ip: '0.0.0.0',
                    announcedIp: "192.168.0.114",
                },
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            maxIncomingBitrate: 1500000,
            initialAvailableOutgoingBitrate: 1000000,
        },
        plainRtpTransport: {
            listenIp: '127.0.0.1',
            rtcpMux: true,
            comedia: true
        },
    },
};