import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center text-center gap-8">
      <h1 className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400">
        Welcome to the WebRTC HLS Streamer
      </h1>
      <p className="text-lg text-gray-300">
        A small application demonstrating real-time streaming with Mediasoup and HLS.
      </p>
      <nav className="flex gap-6 mt-4">
        <Link href="/stream" className="text-xl text-blue-400 hover:text-blue-300 transition-colors">
          Go to Stream Page
        </Link>
        <Link href="/watch" className="text-xl text-blue-400 hover:text-blue-300 transition-colors">
          Go to Watch Page
        </Link>
      </nav>
    </div>
  );
}