
// Simple standalone WebSocket test that works with Replit's HTTP handling
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

// Create HTTP server
const app = express();
app.get('/', (req, res) => {
  res.send('WebSocket test server is running. Connect to /websocket-test');
});

const server = http.createServer(app);

// Create WebSocket server using the HTTP server
const wss = new WebSocketServer({ 
  server,
  path: '/websocket-test' // Specific path for WebSocket connections
});

wss.on('connection', (ws) => {
  console.log('Client connected!');
  
  // Send a welcome message
  ws.send(JSON.stringify({ 
    message: 'Hello from WebSocket server!',
    timestamp: new Date().toISOString()
  }));
  
  // Handle messages
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    
    // Echo back
    ws.send(JSON.stringify({ 
      type: 'echo',
      message: message.toString(),
      timestamp: new Date().toISOString()
    }));
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Use port 5000 (the same port your main app is using)
const PORT = 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket test server running on port ${PORT}`);
  console.log(`WebSocket URL: wss://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/websocket-test`);
  console.log(`HTTP URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
});
