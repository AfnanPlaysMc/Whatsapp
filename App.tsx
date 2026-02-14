
import React, { useState, useEffect, useRef } from 'react';
import { Message, Contact, ChatSession, CallType } from './types';
import { CallUI } from './components/CallUI';

const App: React.FC = () => {
  // --- Profile State ---
  const [me, setMe] = useState<Contact | null>(() => {
    try {
      const saved = localStorage.getItem('p2p_me_v3');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [usernameInput, setUsernameInput] = useState('');

  // --- App State ---
  const [contacts, setContacts] = useState<Contact[]>(() => {
    try {
      const saved = localStorage.getItem('p2p_contacts_v3');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [sessions, setSessions] = useState<Record<string, ChatSession>>(() => {
    try {
      const saved = localStorage.getItem('p2p_sessions_v3');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [peer, setPeer] = useState<any>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newContactUsername, setNewContactUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [activeCall, setActiveCall] = useState<{ type: CallType; contact: Contact; callObj?: any } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // --- Refs ---
  const conns = useRef<Record<string, any>>({});
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Persistence ---
  useEffect(() => {
    if (me) localStorage.setItem('p2p_me_v3', JSON.stringify(me));
    localStorage.setItem('p2p_contacts_v3', JSON.stringify(contacts));
    localStorage.setItem('p2p_sessions_v3', JSON.stringify(sessions));
  }, [me, contacts, sessions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, activeId]);

  // --- PeerJS Setup ---
  useEffect(() => {
    if (me && !peer) {
      const initPeer = () => {
        if (typeof window.Peer === 'undefined') {
          setTimeout(initPeer, 500);
          return;
        }

        const newPeer = new window.Peer(me.username, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ]
          }
        });
        
        newPeer.on('open', (id: string) => {
          console.log('Peer connected with ID:', id);
          setPeer(newPeer);
        });

        newPeer.on('connection', (conn: any) => {
          handleIncomingConnection(conn);
        });

        newPeer.on('call', (call: any) => {
          const contact = contacts.find(c => c.username === call.peer) || {
            id: call.peer,
            username: call.peer,
            name: call.peer,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${call.peer}`,
            status: 'online'
          };
          setActiveCall({ type: 'video', contact, callObj: call });
        });

        newPeer.on('error', (err: any) => {
          console.error('Peer error:', err);
          if (err.type === 'peer-unavailable') alert('User is currently offline.');
        });
      };
      initPeer();
    }
  }, [me, contacts]);

  const handleIncomingConnection = (conn: any) => {
    conn.on('open', () => {
      conns.current[conn.peer] = conn;
      setContacts(prev => {
        if (!prev.find(c => c.username === conn.peer)) {
          return [...prev, {
            id: conn.peer,
            username: conn.peer,
            name: conn.peer,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${conn.peer}`,
            status: 'online'
          }];
        }
        return prev;
      });
    });

    conn.on('data', (data: any) => {
      if (data.type === 'message') {
        updateSession(conn.peer, { ...data.payload, status: 'delivered' });
        conn.send({ type: 'ack', id: data.payload.id });
      } else if (data.type === 'typing') {
        setContacts(prev => prev.map(c => c.username === conn.peer ? { ...c, isTyping: data.isTyping } : c));
      } else if (data.type === 'ack') {
        setSessions(prev => {
          const s = prev[conn.peer];
          if (!s) return prev;
          return {
            ...prev,
            [conn.peer]: {
              ...s,
              messages: s.messages.map(m => m.id === data.id ? { ...m, status: 'delivered' } : m)
            }
          };
        });
      }
    });
  };

  const updateSession = (contactId: string, message: Message) => {
    setSessions(prev => {
      const s = prev[contactId] || { contactId, messages: [] };
      return { ...prev, [contactId]: { ...s, messages: [...s.messages, message] } };
    });
  };

  const getConn = (targetId: string) => {
    if (conns.current[targetId]?.open) return conns.current[targetId];
    const newConn = peer.connect(targetId);
    handleIncomingConnection(newConn);
    return newConn;
  };

  // --- Actions ---
  const handleSetMe = () => {
    const u = usernameInput.trim();
    if (u) {
      setMe({
        id: u,
        username: u.toLowerCase(),
        name: u,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${u}`,
        status: 'online'
      });
    }
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeId || !me) return;

    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: me.username,
      senderName: me.name,
      text: inputText,
      timestamp: Date.now(),
      status: 'sent'
    };

    const conn = getConn(activeId);
    conn.send({ type: 'message', payload: msg });
    updateSession(activeId, msg);
    setInputText('');
    conn.send({ type: 'typing', isTyping: false });
  };

  const handleTyping = (text: string) => {
    setInputText(text);
    if (activeId && peer) {
      getConn(activeId).send({ type: 'typing', isTyping: text.length > 0 });
    }
  };

  const handleAddFriend = () => {
    const val = newContactUsername.trim().toLowerCase();
    if (val && !contacts.find(c => c.username === val)) {
      setContacts([...contacts, { 
        id: val, 
        username: val, 
        name: val, 
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${val}`, 
        status: 'offline' 
      }]);
      setActiveId(val);
      setNewContactUsername('');
      setIsAdding(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      audioChunks.current = [];
      recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          if (!activeId || !me) return;
          const msg: Message = {
            id: Date.now().toString(),
            senderId: me.username,
            senderName: me.name,
            audioUrl: reader.result as string,
            timestamp: Date.now(),
            status: 'sent'
          };
          getConn(activeId).send({ type: 'message', payload: msg });
          updateSession(activeId, msg);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access is required for voice notes.");
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeId && me) {
      const reader = new FileReader();
      reader.onload = () => {
        const msg: Message = {
          id: Date.now().toString(),
          senderId: me.username,
          senderName: me.name,
          imageUrl: reader.result as string,
          timestamp: Date.now(),
          status: 'sent'
        };
        getConn(activeId).send({ type: 'message', payload: msg });
        updateSession(activeId, msg);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Login View ---
  if (!me) {
    return (
      <div className="h-screen bg-[#111b21] flex items-center justify-center p-6">
        <div className="bg-[#202c33] p-8 rounded-2xl w-full max-w-md shadow-2xl text-center">
          <div className="w-20 h-20 bg-[#00a884] rounded-full mx-auto mb-6 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">WhatsApp P2P</h1>
          <p className="text-[#8696a0] mb-8 text-sm">Direct, secure, global communication.</p>
          <input 
            type="text" 
            placeholder="Enter Username" 
            className="w-full bg-[#2a3942] text-white p-4 rounded-xl mb-4 focus:ring-2 focus:ring-[#00a884] outline-none"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetMe()}
          />
          <button 
            onClick={handleSetMe}
            className="w-full bg-[#00a884] text-[#111b21] font-bold py-4 rounded-xl hover:bg-[#06cf9c] transition-all"
          >
            Agree & Continue
          </button>
        </div>
      </div>
    );
  }

  const activeContact = contacts.find(c => c.username === activeId);
  const activeMsgs = activeId ? (sessions[activeId]?.messages || []) : [];

  return (
    <div className="flex h-screen bg-[#0c1317] overflow-hidden text-[#e9edef]">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[400px] border-r border-[#222d34] bg-[#111b21] shrink-0`}>
        <div className="h-16 bg-[#202c33] flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={me.avatar} className="w-10 h-10 rounded-full" alt="Me" />
            <span className="font-medium text-sm truncate max-w-[150px]">@{me.username}</span>
          </div>
          <div className="flex gap-5 text-[#aebac1]">
            <button onClick={() => setIsAdding(true)} title="Add Friend">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </button>
          </div>
        </div>

        <div className="p-3">
          <div className="bg-[#202c33] flex items-center px-4 py-2 rounded-xl">
            <svg className="w-4 h-4 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Search chats" className="bg-transparent border-none focus:ring-0 text-sm w-full ml-4 text-white placeholder-[#8696a0]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {contacts.map(c => (
            <div 
              key={c.username}
              onClick={() => { setActiveId(c.username); setIsSidebarOpen(false); }}
              className={`flex items-center px-4 py-3 cursor-pointer hover:bg-[#202c33] transition-colors ${activeId === c.username ? 'bg-[#2a3942]' : ''}`}
            >
              <img src={c.avatar} className="w-12 h-12 rounded-full mr-4" />
              <div className="flex-1 border-b border-[#222d34] pb-3 truncate">
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-white">{c.name}</span>
                  <span className="text-[10px] text-[#8696a0]">
                    {sessions[c.username]?.messages.slice(-1)[0] ? new Date(sessions[c.username].messages.slice(-1)[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <p className="text-xs text-[#8696a0] truncate">
                  {c.isTyping ? <span className="text-[#00a884]">typing...</span> : (sessions[c.username]?.messages.slice(-1)[0]?.text || 'No messages yet')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-[#0b141a] transition-all ${!activeId && 'hidden md:flex'}`}>
        {activeId && activeContact ? (
          <>
            <div className="h-16 bg-[#202c33] flex items-center justify-between px-4 z-10 shadow-lg">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-[#aebac1] p-1"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>
                <img src={activeContact.avatar} className="w-10 h-10 rounded-full" />
                <div className="truncate max-w-[200px]">
                  <div className="text-white font-medium text-sm truncate">{activeContact.name}</div>
                  <div className="text-[11px] text-[#8696a0]">{activeContact.isTyping ? 'typing...' : 'online'}</div>
                </div>
              </div>
              <div className="flex gap-6 text-[#aebac1]">
                <button onClick={() => setActiveCall({ type: 'video', contact: activeContact })} className="p-1"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></button>
                <button onClick={() => setActiveCall({ type: 'voice', contact: activeContact })} className="p-1"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:px-20 whatsapp-bg">
              <div className="flex flex-col gap-1.5">
                {activeMsgs.map((m) => (
                  <div key={m.id} className={`flex ${m.senderId === me.username ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] md:max-w-[60%] px-3 py-1.5 rounded-lg text-sm message-shadow ${m.senderId === me.username ? 'bg-[#005c4b] text-white rounded-tr-none' : 'bg-[#202c33] text-gray-100 rounded-tl-none'}`}>
                      {m.imageUrl && <img src={m.imageUrl} className="rounded mb-1 max-h-80 object-contain w-full" alt="shared" />}
                      {m.audioUrl && <audio src={m.audioUrl} controls className="h-8 max-w-[240px] mb-1" />}
                      {m.text && <p className="leading-relaxed whitespace-pre-wrap break-words">{String(m.text)}</p>}
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <span className="text-[10px] opacity-70">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {m.senderId === me.username && (
                          <span className={m.status === 'read' ? 'text-[#53bdeb]' : 'opacity-70'}>
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              {m.status === 'sent' ? (
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              ) : (
                                <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17l-4.24-4.24-1.41 1.41 5.66 5.66L23.66 7l-1.42-1.41zM.41 13.41L6.07 19.07l1.41-1.41L1.83 12 .41 13.41z"/>
                              )}
                            </svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>

            <form onSubmit={handleSendMessage} className="bg-[#202c33] p-2 flex items-center gap-2">
              <button type="button" onClick={() => (document.getElementById('fup') as any).click()} className="text-[#8696a0] p-2 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4s-4 1.79-4 4v12.5c0 3.31 2.69 6 6 6s6-2.69 6-6V6h-1.5z"/></svg>
              </button>
              <input type="file" hidden id="fup" accept="image/*" onChange={handleFileUpload} />
              <input 
                type="text" 
                placeholder="Type a message" 
                className="flex-1 bg-[#2a3942] rounded-xl py-2.5 px-4 text-sm text-white outline-none focus:ring-1 focus:ring-[#00a884]/30"
                value={inputText}
                onChange={(e) => handleTyping(e.target.value)}
              />
              {inputText.trim() ? (
                <button type="submit" className="p-2 text-[#00a884]">
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              ) : (
                <button 
                  type="button" 
                  onMouseDown={startRecording} 
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={`p-2 transition-all ${isRecording ? 'text-red-500 scale-125' : 'text-[#8696a0]'}`}
                >
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                </button>
              )}
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35] text-center p-12">
            <img src="https://static.whatsapp.net/rsrc.php/v3/yV/r/N_7lVv68RkG.png" className="w-60 opacity-10 mb-8 select-none pointer-events-none" alt="WhatsApp logo" />
            <h1 className="text-3xl font-light text-[#e9edef] mb-2">WhatsApp Web P2P</h1>
            <p className="text-[#8696a0] max-w-sm text-sm">Real-time global communication with zero simulation. Connect directly with friends via their unique usernames.</p>
            <div className="mt-20 flex items-center gap-2 text-xs text-[#8696a0]">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
              Direct Peer-to-Peer Encryption
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#202c33] p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <h3 className="text-white text-xl font-bold mb-4">Add New Contact</h3>
            <input 
              autoFocus
              className="w-full bg-[#2a3942] text-white p-4 rounded-xl outline-none mb-6 border border-[#374151]"
              placeholder="Username (e.g. alice)"
              value={newContactUsername}
              onChange={(e) => setNewContactUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-[#00a884] font-medium hover:bg-[#2a3942] rounded-lg transition-colors">Cancel</button>
              <button 
                onClick={handleAddFriend}
                className="bg-[#00a884] px-6 py-2 rounded-xl text-[#111b21] font-bold hover:bg-[#06cf9c] transition-all"
              >
                Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && peer && (
        <CallUI 
          type={activeCall.type} 
          contact={activeCall.contact} 
          onEnd={() => setActiveCall(null)} 
          incomingCall={activeCall.callObj}
          peer={peer}
        />
      )}
    </div>
  );
};

export default App;
