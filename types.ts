
export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  timestamp: number;
}

export interface Contact {
  id: string; // Peer ID
  username: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
}

export interface ChatSession {
  contactId: string;
  messages: Message[];
}

export type CallType = 'voice' | 'video';

declare global {
  interface Window {
    Peer: any;
  }
}
