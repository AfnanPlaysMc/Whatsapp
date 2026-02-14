
import React, { useEffect, useRef, useState } from 'react';
import { Contact, CallType } from '../types';

interface CallUIProps {
  type: CallType;
  contact: Contact;
  onEnd: () => void;
  incomingCall?: any;
  peer: any;
}

export const CallUI: React.FC<CallUIProps> = ({ type, contact, onEnd, incomingCall, peer }) => {
  const [status, setStatus] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const [timer, setTimer] = useState(0);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let interval: any;
    if (status === 'connected') {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        if (incomingCall) {
          incomingCall.answer(stream);
          incomingCall.on('stream', (remoteStream: MediaStream) => {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
            setStatus('connected');
          });
        } else {
          const call = peer.call(contact.username, stream);
          call.on('stream', (remoteStream: MediaStream) => {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
            setStatus('connected');
          });
          call.on('close', onEnd);
        }
      } catch (err) {
        alert("Camera/Microphone access required for calls.");
        onEnd();
      }
    };

    startCall();

    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#0b141a] flex flex-col items-center justify-center text-white overflow-hidden">
      {type === 'video' && status === 'connected' && (
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover z-0" />
      )}

      <div className="relative z-10 flex flex-col items-center gap-6 mt-12 flex-1">
        <div className="relative">
          <img 
            src={contact.avatar} 
            className={`w-32 h-32 rounded-full border-4 border-[#00a884] object-cover transition-all ${status === 'connected' && type === 'video' ? 'opacity-0 scale-50' : 'opacity-100'}`} 
          />
          {type === 'video' && (
            <div className={`absolute -bottom-4 -right-4 w-28 h-40 rounded-xl overflow-hidden border-2 border-white shadow-2xl bg-black ${status === 'connected' ? 'block' : 'hidden'}`}>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            </div>
          )}
        </div>

        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">{contact.name}</h2>
          <p className="text-gray-300 font-medium">
            {status === 'ringing' ? 'Calling...' : formatTime(timer)}
          </p>
        </div>
      </div>

      <div className="relative z-10 mb-20 flex gap-10">
        <button onClick={onEnd} className="p-6 rounded-full bg-red-600 hover:bg-red-500 shadow-xl active:scale-95 transition-all">
          <svg className="w-10 h-10 rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
        </button>
      </div>
    </div>
  );
};
