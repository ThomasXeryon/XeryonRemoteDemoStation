import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket() {
  const [connectionStatus, setConnectionStatus] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus(true);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus(false);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus(false);
    };

    return () => {
      socket.close();
    };
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }, []);

  return {
    socket: socketRef.current,
    connectionStatus,
    sendMessage,
  };
}