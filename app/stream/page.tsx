"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Device } from "mediasoup-client";
import type {
    Transport,
    RtpCapabilities,
    Producer,
} from "mediasoup-client/types";

export default function StreamPage() {
    const socketRef = useRef<Socket | null>(null);
    const deviceRef = useRef<Device | null>(null);
    const producerTransportRef = useRef<Transport | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const audioProducerRef = useRef<Producer | null>(null);
    const videoProducerRef = useRef<Producer | null>(null);

    const [isConnected, setIsConnected] = useState(false);
    const [isProducing, setIsProducing] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState("Disconnected");

    useEffect(() => {
        const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000");

        socket.on('connect', () => {
            setConnectionStatus("Connected");
            setIsConnected(true);
            socketRef.current = socket;

            socket.emit('getRouterRtpCapabilities', async (routerRtpCapabilities: RtpCapabilities) => {
                setConnectionStatus("Loading streaming device...");
                const device = new Device();
                await device.load({ routerRtpCapabilities });
                deviceRef.current = device;
                setConnectionStatus("Device loaded. Ready to stream.");
            });
        });

        socket.on('disconnect', () => {
            setConnectionStatus("Disconnected");
            setIsConnected(false);
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    const startStreaming = async () => {
        if (!deviceRef.current || !socketRef.current) return;

        setConnectionStatus("Creating stream transport...");
        socketRef.current.emit('createWebRtcTransport', async (params: any) => {
            if (params.error) {
                console.error(params.error);
                setConnectionStatus("Error creating transport.");
                return;
            }

            const transport = deviceRef.current!.createSendTransport(params);
            producerTransportRef.current = transport;

            transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                setConnectionStatus("Connecting transport...");
                socketRef.current!.emit('connectTransport', { transportId: transport.id, dtlsParameters }, (response: string) => {
                    if (response === 'connected') {
                        callback();
                        setConnectionStatus("Transport connected.");
                    } else {
                        errback(new Error("Failed to connect transport"));
                    }
                });
            });

            transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
                setConnectionStatus(`Sending ${kind} stream...`);
                socketRef.current!.emit('produce', {
                    transportId: transport.id,
                    kind,
                    rtpParameters,
                }, ({ id }: { id: string }) => {
                    callback({ id });
                    setConnectionStatus(`Streaming ${kind}...`);
                });
            });

            try {
                setConnectionStatus("Getting camera permissions...");
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }

                const audioTrack = stream.getAudioTracks()[0];
                const videoTrack = stream.getVideoTracks()[0];

                const audioProducer = await transport.produce({ track: audioTrack });
                const videoProducer = await transport.produce({ track: videoTrack });

                audioProducerRef.current = audioProducer;
                videoProducerRef.current = videoProducer;

                setIsProducing(true);

            } catch (err) {
                console.error("Error getting user media:", err);
                setConnectionStatus("Failed to get camera access.");
            }
        });
    };

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            <h1 className="text-3xl font-bold">Stream Page</h1>
            <p className="text-gray-400 italic">{connectionStatus}</p>

            <div className="w-full max-w-4xl aspect-video bg-black rounded-lg border-2 border-gray-700 shadow-lg">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
            </div>

            <button
                onClick={startStreaming}
                disabled={!isConnected || isProducing}
                className="mt-4 px-6 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-md
                           hover:bg-blue-700 transition-colors
                           disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
                {isProducing ? "Currently Streaming" : "Start Streaming"}
            </button>
        </div>
    );
}