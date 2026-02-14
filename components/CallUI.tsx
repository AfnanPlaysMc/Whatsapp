
import React, { useEffect, useRef, useState } from 'react';
import { Contact, CallType } from '../types';

interface CallUIProps {
  type: CallType;
  contact: Contact;
  onEnd: () => void;
  incomingCall?: any; // PeerJS Call object
  localStream: MediaStream | null;
}

export const CallUI: React.FC<CallUIProps> = ({ type, contact, onEnd, incomingCall, localStream }) => {
  const [status, setStatus] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const [timer, setTimer] = useState(0);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (incomingCall) {
      setStatus('ringing');
    } else {
      setStatus('ringing');
    }
  }, [incomingCall]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Handle stream from remote peer
  const handleRemoteStream = (stream: MediaStream) => {
    setRemoteStream(stream);
    setStatus('connected');
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    }
  };

  useEffect(() => {
    let interval: any;
    if (status === 'connected') {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#0b141a] flex flex-col items-center justify-center text-white p-6">
      {/* Background Video (Remote) */}
      {type === 'video' && status === 'connected' && (
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col items-center gap-6 mt-12 flex-1">
        <div className="relative">
          <img 
            src={contact.avatar} 
            className={`w-32 h-32 rounded-full border-4 border-[#00a884] object-cover transition-opacity ${status === 'connected' && type === 'video' ? 'opacity-0' : 'opacity-100'}`} 
            alt={contact.name} 
          />
          {/* Local Preview */}
          {type === 'video' && (
            <div className={`absolute -bottom-4 -right-4 w-32 h-44 rounded-lg overflow-hidden border-2 border-white shadow-xl bg-black ${status === 'connected' ? 'block' : 'hidden'}`}>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            </div>
          )}
        </div>

        <div className="text-center drop-shadow-lg">
          <h2 className="text-3xl font-bold">{contact.name}</h2>
          <p className="text-lg text-gray-300 mt-2 font-medium">
            {status === 'ringing' ? (incomingCall ? 'Incoming call...' : 'Calling...') : status === 'connected' ? formatTime(timer) : 'Call ended'}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="relative z-10 mb-20 flex gap-10">
        {status === 'ringing' && incomingCall ? (
          <>
            <button 
              onClick={onEnd}
              className="p-5 rounded-full bg-red-600 hover:bg-red-500 shadow-lg"
            >
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            </button>
            <button 
              onClick={() => {
                incomingCall.answer(localStream);
                incomingCall.on('stream', handleRemoteStream);
                setStatus('connected');
              }}
              className="p-5 rounded-full bg-green-600 hover:bg-green-500 shadow-lg"
            >
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            </button>
          </>
        ) : (
          <button 
            onClick={onEnd}
            className="p-5 rounded-full bg-red-600 hover:bg-red-500 shadow-lg rotate-[135deg]"
          >
            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </button>
        )}
      </div>
    </div>
  );
};
