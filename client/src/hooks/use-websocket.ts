import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from "./use-toast";

// Define the structure for WebSocket hook data
interface WebSocketState {
  connectionStatus: boolean;
  frame: string | null;
  rpiStatus: Record<string, boolean>;
  lastResponse: any;
  lastFrameTime: number | null;
}

export function useWebSocket() {
  const [state, setState] = useState<WebSocketState>({
    connectionStatus: false,
    frame: null,
    rpiStatus: {},
    lastResponse: null,
    lastFrameTime: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const frameTimeoutRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Create WebSocket connection with new path
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/appws`; // Changed from '/ws' to '/appws'
    console.log("[WebSocket] Attempting connection to:", wsUrl);

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log("[WebSocket] Connected successfully");
      setState(prev => ({ ...prev, connectionStatus: true }));
    };

    socket.onclose = (event) => {
      console.log("[WebSocket] Connection closed:", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
      setState(prev => ({ ...prev, connectionStatus: false })); // Don't clear frame immediately to avoid flickering
      
      // Set a flag to show reconnecting status after a short delay
      const reconnectStatusTimeout = window.setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log("[WebSocket] Setting reconnecting status");
          setState(prev => ({ ...prev, connectionStatus: false, frame: null }));
        }
      }, 2000);

      // Implement exponential backoff for reconnection attempts
      const backoffTime = Math.min(1000 * (Math.pow(2, Math.floor(Math.random() * 4))), 10000);
      console.log(`[WebSocket] Will attempt to reconnect in ${backoffTime}ms`);
      
      // Attempt to reconnect with exponential backoff
      reconnectTimeoutRef.current = window.setTimeout(() => {
        console.log("[WebSocket] Attempting to reconnect...");
        try {
          const newSocket = new WebSocket(wsUrl);
          wsRef.current = newSocket;
          
          // Set up event handlers for the new socket
          newSocket.onopen = socket.onopen;
          newSocket.onmessage = socket.onmessage;
          newSocket.onerror = socket.onerror;
          newSocket.onclose = socket.onclose;
        } catch (error) {
          console.error("[WebSocket] Failed to create new connection:", error);
        }
        
        // Clear the reconnect status timeout
        window.clearTimeout(reconnectStatusTimeout);
      }, backoffTime);
    };

    socket.onerror = (error) => {
      console.error("[WebSocket] Connection error:", error);
      setState(prev => ({ ...prev, connectionStatus: false }));
    };

    socket.onmessage = handleMessage;

    // Cleanup function to close WebSocket when component unmounts
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (frameTimeoutRef.current) {
        window.clearTimeout(frameTimeoutRef.current);
        frameTimeoutRef.current = null;
      }
    };
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      // Handle different message types
      if (data.type === 'camera_frame') {
        // Clear any existing frame timeout
        if (frameTimeoutRef.current) {
          window.clearTimeout(frameTimeoutRef.current);
          frameTimeoutRef.current = null;
        }

        // Set a timeout to detect if frames stop arriving
        frameTimeoutRef.current = window.setTimeout(() => {
          console.log("No camera frames received for 5 seconds");
          setState(prev => ({
            ...prev,
            frame: null, // Clear frame to show "waiting for camera" message
          }));
        }, 5000);

        setState(prev => ({
          ...prev,
          frame: data.frame,
          lastFrameTime: Date.now()
        }));
      } else if (data.type === 'rpi_connected') {
        setState(prev => ({
          ...prev,
          rpiStatus: {
            ...prev.rpiStatus,
            [data.rpiId]: true
          }
        }));
        toast({
          title: "Device Connected",
          description: `RPi ${data.rpiId} is now connected`,
        });
      } else if (data.type === 'rpi_disconnected') {
        setState(prev => ({
          ...prev,
          rpiStatus: {
            ...prev.rpiStatus,
            [data.rpiId]: false
          },
          frame: null // Clear frame when RPi disconnects
        }));
        toast({
          title: "Device Disconnected",
          description: `RPi ${data.rpiId} has disconnected`,
          variant: "destructive",
        });
      } else {
        // Store all other responses in lastResponse
        setState(prev => ({
          ...prev,
          lastResponse: data
        }));
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, [toast]);

  const sendMessage = useCallback((message: any) => { //Added any type for message
    if (!message.rpiId) {
      console.error("[WebSocket] Cannot send message - rpiId is missing:", message);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Convert rpiId to string for consistency
      const finalMessage = {
        ...message,
        rpiId: String(message.rpiId)
      };

      console.log("[WebSocket] Sending message:", {
        type: finalMessage.type,
        command: finalMessage.command,
        direction: finalMessage.direction,
        rpiId: finalMessage.rpiId
      });

      wsRef.current.send(JSON.stringify(finalMessage));
    } else {
      console.warn("[WebSocket] Cannot send - connection not open. State:", wsRef.current?.readyState);
    }
  }, []);

  return {
    socket: wsRef.current,
    connectionStatus: state.connectionStatus,
    sendMessage,
    frame: state.frame,
    rpiStatus: state.rpiStatus,
    lastResponse: state.lastResponse
  };
}