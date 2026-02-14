
import React, { useState, useEffect, useRef } from 'react';
import { Message, Contact, ChatSession, CallType } from './types';
import { CallUI } from './components/CallUI';

const App: React.FC = () => {
  const [me, setMe] = useState<Contact | null>(() => {
    const saved = localStorage.getItem('my_profile');
    return saved ? JSON.parse(saved) : null;
  });

  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('p2p_contacts');
    return saved ? JSON.parse(saved) : [];
  });

  const [sessions, setSessions] = useState<Record<string, ChatSession>>(() => {
    const saved = localStorage.getItem('p2p_sessions');
    return saved ? JSON.parse(saved) : {};
  });

  const [peer, setPeer] = useState<any>(null);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCall, setActiveCall] = useState<{ type: CallType; contact: Contact; incomingCall?: any } | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [isSettingProfile, setIsSettingProfile] = useState(!localStorage.getItem('my_profile'));
  const [usernameInput, setUsernameInput] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataConnections = useRef<Record<string, any>>({});

  // Initialize Peer
  useEffect(() => {
    if (me && !peer) {
      const newPeer = new window.Peer(me.username);
      
      newPeer.on('open', (id: string) => {
        console.log('Peer connected with ID:', id);
        setPeer(newPeer);
      });

      newPeer.on('connection', (conn: any) => {
        setupConnection(conn);
      });

      newPeer.on('call', (call: any) => {
        const callerContact = contacts.find(c => c.username === call.peer) || {
          id: call.peer,
          username: call.peer,
          name: call.peer,
          avatar: `https://picsum.photos/seed/${call.peer}/200`,
          status: 'online'
        } as Contact;

        // Automatically start local stream for answering
        const isVideo = call.options?._payload?.video || false; // Hacky way to detect type if not explicit
        setActiveCall({ type: isVideo ? 'video' : 'voice', contact: callerContact, incomingCall: call });
      });

      newPeer.on('error', (err: any) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
          alert('User is offline or does not exist.');
        }
      });
    }
  }, [me, contacts]);

  useEffect(() => {
    localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
    localStorage.setItem('p2p_sessions', JSON.stringify(sessions));
    localStorage.setItem('my_profile', JSON.stringify(me));
  }, [contacts, sessions, me]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, activeContactId]);

  const setupConnection = (conn: any) => {
    conn.on('open', () => {
      dataConnections.current[conn.peer] = conn;
    });

    conn.on('data', (data: any) => {
      if (data.type === 'message') {
        const msg: Message = data.payload;
        // Check if contact exists, if not add them
        setContacts(prev => {
          if (!prev.find(c => c.username === conn.peer)) {
            return [...prev, {
              id: conn.peer,
              username: conn.peer,
              name: conn.peer,
              avatar: `https://picsum.photos/seed/${conn.peer}/200`,
              status: 'online'
            }];
          }
          return prev;
        });
        updateSession(conn.peer, msg);
      }
    });
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeContactId || !peer || !me) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      senderId: me.username,
      senderName: me.name,
      text: inputText,
      timestamp: Date.now(),
    };

    sendMessageToPeer(activeContactId, userMessage);
    updateSession(activeContactId, userMessage);
    setInputText('');
  };

  const sendMessageToPeer = (peerId: string, message: Message) => {
    let conn = dataConnections.current[peerId];
    if (!conn || !conn.open) {
      conn = peer.connect(peerId);
      setupConnection(conn);
    }
    
    // Small delay to ensure connection is open if just created
    const send = () => {
      if (conn.open) {
        conn.send({ type: 'message', payload: message });
      } else {
        setTimeout(send, 100);
      }
    };
    send();
  };

  const updateSession = (contactId: string, message: Message) => {
    setSessions(prev => {
      const session = prev[contactId] || { contactId, messages: [] };
      return {
        ...prev,
        [contactId]: { ...session, messages: [...session.messages, message] }
      };
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeContactId && me) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imageUrl = ev.target?.result as string;
        const msg: Message = {
          id: Date.now().toString(),
          senderId: me.username,
          senderName: me.name,
          imageUrl,
          timestamp: Date.now(),
        };
        sendMessageToPeer(activeContactId, msg);
        updateSession(activeContactId, msg);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddContact = () => {
    const cleanUsername = newUsername.trim().toLowerCase();
    if (!cleanUsername) return;
    
    const existing = contacts.find(c => c.username === cleanUsername);
    if (!existing) {
      const newContact: Contact = {
        id: cleanUsername,
        username: cleanUsername,
        name: newUsername,
        avatar: `https://picsum.photos/seed/${cleanUsername}/200`,
        status: 'offline'
      };
      setContacts([...contacts, newContact]);
      setActiveContactId(cleanUsername);
    } else {
      setActiveContactId(existing.username);
    }
    setNewUsername('');
    setIsAddingContact(false);
  };

  const handleStartCall = async (type: CallType) => {
    if (!activeContactId || !peer) return;
    const contact = contacts.find(c => c.username === activeContactId)!;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      setLocalStream(stream);
      const call = peer.call(activeContactId, stream, { metadata: { type } });
      setActiveCall({ type, contact });

      call.on('stream', (remoteStream: MediaStream) => {
        // This logic is handled inside CallUI via props usually, but we store it here
      });
    } catch (err) {
      alert("Please allow camera/mic access to make a call.");
    }
  };

  const handleEndCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (activeCall?.incomingCall) {
      activeCall.incomingCall.close();
    }
    setActiveCall(null);
  };

  const handleSetProfile = () => {
    const u = usernameInput.trim().toLowerCase();
    if (!u) return;
    setMe({
      id: u,
      username: u,
      name: usernameInput,
      avatar: `https://picsum.photos/seed/${u}/200`,
      status: 'online'
    });
    setIsSettingProfile(false);
  };

  if (isSettingProfile) {
    return (
      <div className="h-screen bg-[#111b21] flex items-center justify-center p-6">
        <div className="bg-[#202c33] p-8 rounded-xl w-full max-w-md shadow-2xl text-center">
          <div className="w-24 h-24 bg-[#00a884] rounded-full mx-auto mb-6 flex items-center justify-center">
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to GeminiConnect</h1>
          <p className="text-[#8696a0] mb-8">Choose a unique username so your friends can find you.</p>
          <input 
            type="text" 
            placeholder="Username (e.g. john_doe)"
            className="w-full bg-[#2a3942] text-white p-4 rounded-lg border-none focus:ring-2 focus:ring-[#00a884] outline-none mb-6 text-lg"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetProfile()}
          />
          <button 
            onClick={handleSetProfile}
            className="w-full bg-[#00a884] text-[#111b21] font-bold py-4 rounded-lg hover:bg-[#06cf9c] transition-all"
          >
            Enter Chat
          </button>
        </div>
      </div>
    );
  }

  const activeContact = contacts.find(c => c.username === activeContactId);
  const activeMessages = activeContactId ? (sessions[activeContactId]?.messages || []) : [];

  return (
    <div className="flex h-screen bg-[#0c1317] overflow-hidden select-none">
      {/* Sidebar */}
      <div className="hidden md:flex w-[400px] border-r border-[#222d34] flex flex-col bg-[#111b21]">
        {/* Sidebar Header */}
        <div className="h-16 bg-[#202c33] flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={me?.avatar} className="w-10 h-10 rounded-full" alt="Me" />
            <span className="text-white font-medium">@{me?.username}</span>
          </div>
          <div className="flex gap-6 text-[#aebac1]">
            <button onClick={() => setIsAddingContact(true)} title="Add User by Username">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </button>
            <button><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg></button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="bg-[#202c33] flex items-center px-4 py-2 rounded-lg">
            <svg className="w-4 h-4 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input 
              type="text" 
              placeholder="Search contacts" 
              className="bg-transparent border-none focus:ring-0 text-sm w-full ml-4 text-white placeholder-[#8696a0]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {contacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(contact => (
            <div 
              key={contact.username}
              onClick={() => setActiveContactId(contact.username)}
              className={`flex items-center px-4 py-3 cursor-pointer hover:bg-[#202c33] transition-colors ${activeContactId === contact.username ? 'bg-[#2a3942]' : ''}`}
            >
              <img src={contact.avatar} className="w-12 h-12 rounded-full mr-4" alt={contact.name} />
              <div className="flex-1 border-b border-[#222d34] pb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-white font-medium">{contact.name}</span>
                  <span className="text-xs text-[#8696a0]">
                    {sessions[contact.username]?.messages.slice(-1)[0] ? new Date(sessions[contact.username].messages.slice(-1)[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <p className="text-sm text-[#8696a0] truncate">
                  {sessions[contact.username]?.messages.slice(-1)[0]?.text || 'No messages yet'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col bg-[#0b141a]">
        {activeContact ? (
          <>
            <div className="h-16 bg-[#202c33] flex items-center justify-between px-4 z-10">
              <div className="flex items-center gap-4">
                <img src={activeContact.avatar} className="w-10 h-10 rounded-full" />
                <div>
                  <div className="text-white font-medium">{activeContact.name}</div>
                  <div className="text-xs text-[#00a884]">online</div>
                </div>
              </div>
              <div className="flex gap-6 text-[#aebac1]">
                <button onClick={() => handleStartCall('video')}><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></button>
                <button onClick={() => handleStartCall('voice')}><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:px-24 whatsapp-bg">
              <div className="flex flex-col gap-2">
                {activeMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderId === me?.username ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg p-2 px-3 shadow-md flex flex-col ${msg.senderId === me?.username ? 'bg-[#005c4b] text-white rounded-tr-none' : 'bg-[#202c33] text-gray-100 rounded-tl-none'}`}>
                      {msg.imageUrl && <img src={msg.imageUrl} className="rounded mb-1 max-h-96 object-contain" />}
                      {msg.text && <p className="text-[14px] leading-relaxed">{msg.text}</p>}
                      <div className="text-[10px] text-[#aebac1] text-right mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>

            <form onSubmit={handleSendMessage} className="bg-[#202c33] p-2 flex items-center gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[#8696a0] p-2 hover:text-white">
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4s-4 1.79-4 4v12.5c0 3.31 2.69 6 6 6s6-2.69 6-6V6h-1.5z"/></svg>
              </button>
              <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={handleFileUpload} />
              <input 
                type="text" 
                placeholder="Type a message" 
                className="flex-1 bg-[#2a3942] rounded-lg py-2.5 px-4 text-white focus:ring-0 outline-none"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button type="submit" className="p-2 text-[#00a884]">
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35] text-center p-12">
            <h1 className="text-4xl font-light text-[#e9edef] mb-4">GeminiConnect P2P</h1>
            <p className="text-[#8696a0] max-w-sm">Connect with real people using their username. No AI, just direct communication.</p>
            <button 
              onClick={() => setIsAddingContact(true)}
              className="mt-8 bg-[#00a884] px-6 py-2 rounded-full text-[#111b21] font-bold"
            >
              Add a Friend
            </button>
          </div>
        )}
      </div>

      {isAddingContact && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#202c33] p-6 rounded-lg w-full max-w-sm">
            <h3 className="text-white text-xl font-bold mb-4">Add Friend</h3>
            <input 
              autoFocus
              className="w-full bg-[#2a3942] text-white p-3 rounded-lg border-none outline-none mb-4"
              placeholder="Enter username (e.g. bob)"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsAddingContact(false)} className="text-[#00a884]">Cancel</button>
              <button onClick={handleAddContact} className="bg-[#00a884] px-4 py-2 rounded text-[#111b21] font-bold">Add</button>
            </div>
          </div>
        </div>
      )}

      {activeCall && (
        <CallUI 
          type={activeCall.type} 
          contact={activeCall.contact} 
          onEnd={handleEndCall} 
          incomingCall={activeCall.incomingCall}
          localStream={localStream}
        />
      )}
    </div>
  );
};

export default App;
