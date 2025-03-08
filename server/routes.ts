import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import type { WebSocketMessage, RPiResponse } from "@shared/schema";
import { parse as parseCookie } from "cookie";
import path from "path";
import fs from "fs/promises";
import express from "express";
import multer from "multer";
import { URL } from "url";

// Define uploadsPath at the top level
const uploadsPath = path.join(process.cwd(), 'public', 'uploads');

// Configure multer for image uploads
const upload = multer({
  dest: uploadsPath,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Map to store RPi WebSocket connections
const rpiConnections = new Map<string, WebSocket>();

function isAdmin(req: Express.Request) {
  return req.isAuthenticated() && req.user?.isAdmin;
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Get all demo station IDs and log them to the console
  const stations = await storage.getStations();
  console.log("=== DEMO STATION IDs ===");
  stations.forEach(station => {
    console.log(`Station ID: ${station.id}, Name: ${station.name}, RPi ID: ${station.rpiId}`);
  });
  console.log("=======================");

  const httpServer = createServer(app);

  // Create WebSocket servers but don't attach them to paths yet
  const wssUI = new WebSocketServer({ noServer: true });
  const wssRPi = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    const fullUrl = `${request.headers.host}${request.url}`;
    const parsedUrl = new URL(request.url!, `http://${request.headers.host}`);
    const pathname = parsedUrl.pathname;

    // Debug logging
    console.log('\n=== WebSocket Upgrade Request Debug ===');
    console.log('Full URL:', fullUrl);
    console.log('Parsed pathname:', pathname);
    console.log('Headers:', request.headers);
    console.log('Cookies:', request.headers.cookie);
    console.log('===================================\n');

    // Simple path-based routing for WebSockets
    if (pathname.startsWith('/rpi/')) {
      // Extract the RPi ID from the path
      const rpiId = pathname.split('/')[2];
      console.log(`[RPi WebSocket] Attempting connection for RPi ID: "${rpiId}"`);

      if (!rpiId) {
        console.error("[RPi WebSocket] CONNECTION REJECTED: No RPi ID provided");
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      // Store RPi ID in request for later use
      (request as any).rpiId = rpiId;
      console.log(`[RPi WebSocket] RPi ID validation passed: "${rpiId}"`);

      // Handle the upgrade for RPi clients
      wssRPi.handleUpgrade(request, socket, head, (ws) => {
        wssRPi.emit('connection', ws, request);
      });
    } else if (pathname === '/ws' || pathname === '/ws/') {
      // For browser clients, verify session cookie if present
      const cookies = parseCookie(request.headers.cookie || '');
      console.log('[WebSocket] Browser client connection attempt');
      console.log('Session cookie:', cookies['connect.sid']);

      // Handle the upgrade for UI clients
      wssUI.handleUpgrade(request, socket, head, (ws) => {
        wssUI.emit('connection', ws, request);
      });
    } else {
      // Not a WebSocket route we handle
      console.log(`[WebSocket] Rejected unknown WebSocket path: ${pathname}`);
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle RPi connections
  wssRPi.on("connection", (ws, req) => {
    const rpiId = (req as any).rpiId;
    console.log(`[RPi WebSocket] CONNECTION ESTABLISHED - RPi ID: "${rpiId}"`);

    if (!rpiId) {
      console.log("[RPi WebSocket] WARNING: RPi connected but ID is missing!");
      ws.close(1008, "RPi ID required");
      return;
    }

    rpiConnections.set(rpiId, ws);

    // Notify UI clients about new RPi connection
    wssUI.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: "rpi_connected",
          rpiId
        }));
      }
    });

    ws.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        console.log(`Message from RPi ${rpiId}:`, response);

        // Handle camera frames from RPi
        if (response.type === "camera_frame") {
          console.log(`Received camera frame from RPi ${rpiId}, size: ${response.frame?.length || 0} bytes`);

          // Forward camera frame to UI clients
          let forwardCount = 0;
          wssUI.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "camera_frame",
                rpiId: rpiId,
                frame: response.frame
              }));
              forwardCount++;
            }
          });

          console.log(`Forwarded camera frame to ${forwardCount} browser clients`);
          return;
        }

        // Handle registration message from Python client
        if (response.type === "register") {
          console.log(`RPi ${rpiId} registered successfully with status: ${response.status}`);

          wssUI.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "rpi_status",
                rpiId,
                status: response.status,
                message: response.message
              }));
            }
          });
          return;
        }

        // Broadcast RPi response to all connected UI clients
        wssUI.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "rpi_response",
              rpiId,
              message: response.message,
              status: response.status
            }));
          }
        });
      } catch (err) {
        console.error(`Error handling RPi message: ${err}`);
      }
    });

    ws.on("close", () => {
      console.log(`RPi disconnected: ${rpiId}`);
      rpiConnections.delete(rpiId);
      wssUI.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "rpi_disconnected",
            rpiId
          }));
        }
      });
    });

    ws.on("error", (error) => {
      console.error(`RPi WebSocket error: ${error}`);
    });
  });

  // Handle web UI client connections
  wssUI.on("connection", (ws, req) => {
    console.log("UI client connected");

    // Send initial list of connected RPis
    ws.send(JSON.stringify({
      type: "rpi_list",
      rpiIds: Array.from(rpiConnections.keys())
    }));

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        console.log("Received UI message:", message);

        const rpiWs = rpiConnections.get(message.rpiId);

        if (!rpiWs || rpiWs.readyState !== WebSocket.OPEN) {
          console.log(`RPi ${message.rpiId} not connected or not ready`);
          ws.send(JSON.stringify({
            type: "error",
            message: `RPi ${message.rpiId} not connected`
          }));
          return;
        }

        // Forward command to specific RPi with timestamp
        const commandMessage = {
          type: message.type,
          command: message.command,
          direction: message.direction || "none",
          timestamp: new Date().toISOString()
        };

        console.log(`Sending command to RPi ${message.rpiId}:`, commandMessage);
        rpiWs.send(JSON.stringify(commandMessage));

        // Echo back confirmation
        const confirmationMessage = {
          type: "command_sent",
          message: `Command sent to ${message.rpiId}`,
          ...commandMessage
        };

        ws.send(JSON.stringify(confirmationMessage));

        // Log the command for debugging
        console.log(`UI command sent to RPi ${message.rpiId}: ${message.command} (${message.direction || "none"})`);
      } catch (err) {
        console.error("Failed to parse message:", err);
        ws.send(JSON.stringify({
          type: "error",
          message: "Invalid message format"
        }));
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    ws.on("close", () => {
      console.log("UI client disconnected");
    });
  });

  // Ensure uploads directory exists
  await fs.mkdir(uploadsPath, { recursive: true })
    .catch(err => console.error('Error creating uploads directory:', err));

  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadsPath));

  // Add authentication logging middleware
  app.use((req, res, next) => {
    console.log(`Auth status for ${req.path}: isAuthenticated=${req.isAuthenticated()}, isAdmin=${isAdmin(req)}`);
    next();
  });

  // Station routes
  app.get("/api/stations", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("Unauthorized access to /api/stations");
      return res.sendStatus(401);
    }
    const stations = await storage.getStations();
    res.json(stations);
  });

  // Admin routes
  app.post("/api/admin/stations", async (req, res) => {
    if (!isAdmin(req)) {
      console.log("Unauthorized access to /api/admin/stations POST");
      return res.sendStatus(403);
    }
    const { name, rpiId } = req.body;

    if (!name || !rpiId) {
      return res.status(400).json({ message: "Name and RPi ID are required" });
    }

    try {
      const station = await storage.createStation(name, rpiId);
      res.status(201).json(station);
    } catch (error) {
      console.error("Error creating station:", error);
      res.status(500).json({ message: "Failed to create station" });
    }
  });

  app.patch("/api/admin/stations/:id", async (req, res) => {
    if (!isAdmin(req)) {
      console.log("Unauthorized access to /api/admin/stations PATCH");
      return res.sendStatus(403);
    }
    const { name, rpiId } = req.body;
    const stationId = parseInt(req.params.id);

    try {
      const station = await storage.updateStation(stationId, { name });
      res.json(station);
    } catch (error) {
      console.error("Error updating station:", error);
      res.status(500).json({ message: "Failed to update station" });
    }
  });

  app.delete("/api/admin/stations/:id", async (req, res) => {
    if (!isAdmin(req)) {
      console.log("Unauthorized access to /api/admin/stations DELETE");
      return res.sendStatus(403);
    }
    await storage.deleteStation(parseInt(req.params.id));
    res.sendStatus(200);
  });

  // Image upload endpoint
  app.post("/api/admin/stations/:id/image",
    upload.single('image'),
    async (req, res) => {
      if (!isAdmin(req)) {
        console.log("Unauthorized access to /api/admin/stations/:id/image POST");
        return res.sendStatus(403);
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const stationId = parseInt(req.params.id);

      try {
        const filename = `station-${stationId}-${Date.now()}${path.extname(req.file.originalname)}`;
        await fs.rename(req.file.path, path.join(uploadsPath, filename));

        const imageUrl = `/uploads/${filename}`;
        await storage.updateStation(stationId, {
          name: req.body.name || undefined,
          previewImage: imageUrl
        });

        res.json({ url: imageUrl });
      } catch (error) {
        console.error("Error handling image upload:", error);
        res.status(500).json({ message: "Failed to process image upload" });
      }
    }
  );

  // Session management routes
  app.post("/api/stations/:id/session", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("Unauthorized access to /api/stations/:id/session POST");
      return res.sendStatus(401);
    }
    const station = await storage.getStation(parseInt(req.params.id));

    if (!station) {
      return res.status(404).send("Station not found");
    }

    if (station.status === "in_use") {
      return res.status(400).send("Station is in use");
    }

    const updatedStation = await storage.updateStationSession(station.id, req.user.id);
    res.json(updatedStation);

    setTimeout(async () => {
      await storage.updateStationSession(station.id, null);
      wssUI.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "session_ended", stationId: station.id }));
        }
      });
    }, 5 * 60 * 1000);
  });

  app.delete("/api/stations/:id/session", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("Unauthorized access to /api/stations/:id/session DELETE");
      return res.sendStatus(401);
    }
    const station = await storage.getStation(parseInt(req.params.id));

    if (!station) {
      return res.status(404).send("Station not found");
    }

    if (station.currentUserId !== req.user.id) {
      return res.status(403).send("Not your session");
    }

    const updatedStation = await storage.updateStationSession(station.id, null);
    res.json(updatedStation);
  });

  return httpServer;
}