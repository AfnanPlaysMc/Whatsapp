
export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
}

export interface Contact {
  id: string;
  username: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
  isTyping?: boolean;
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
