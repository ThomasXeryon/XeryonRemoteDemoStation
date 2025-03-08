
import asyncio
import websockets
import json
import base64
import cv2
import time
import sys

# Get the station ID from command line arguments or use a default
if len(sys.argv) > 1:
    STATION_ID = sys.argv[1]
else:
    STATION_ID = "RPI1"  # Default ID if none provided

# Try multiple URLs to improve connection reliability
SERVER_URLS = [
    f"ws://localhost:5000/rpi/{STATION_ID}",                          
    f"ws://0.0.0.0:5000/rpi/{STATION_ID}",                            
    f"wss://xeryonremotedemostation.replit.app/rpi/{STATION_ID}"      
]

async def send_camera_feed():
    # Initialize the camera
    cap = cv2.VideoCapture(0)  # Use 0 for default camera
    
    if not cap.isOpened():
        print("Error: Could not open camera.")
        return
    
    # Set resolution to reduce bandwidth
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    # Connect to server
    for uri in SERVER_URLS:
        try:
            print(f"Connecting to {uri}...")
            async with websockets.connect(uri) as websocket:
                print(f"Connected to WebSocket server at {uri}")
                
                # Send registration message
                await websocket.send(json.dumps({
                    "type": "register",
                    "status": "ready",
                    "message": f"RPi {STATION_ID} online with camera",
                    "rpi_id": STATION_ID
                }))
                
                # Main loop to send camera frames
                while True:
                    # Capture frame
                    ret, frame = cap.read()
                    if not ret:
                        print("Failed to capture frame")
                        break
                    
                    # Compress and convert frame to JPEG
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    
                    # Convert to base64 string
                    jpg_as_text = base64.b64encode(buffer).decode('utf-8')
                    
                    # Send frame to server
                    await websocket.send(json.dumps({
                        "type": "camera_frame",
                        "rpi_id": STATION_ID,
                        "frame": jpg_as_text
                    }))
                    
                    # Process incoming messages
                    try:
                        # Set a short timeout to check for messages without blocking
                        message = await asyncio.wait_for(websocket.recv(), 0.01)
                        data = json.loads(message)
                        command = data.get("command", "unknown")
                        print(f"Received command: {command}")
                        
                        # Handle commands here if needed
                    except asyncio.TimeoutError:
                        # No messages received, continue sending frames
                        pass
                    except Exception as e:
                        print(f"Error receiving message: {str(e)}")
                    
                    # Limit frame rate to reduce bandwidth
                    await asyncio.sleep(0.1)  # 10 FPS
                    
        except Exception as e:
            print(f"Connection to {uri} failed: {str(e)}")
            continue  # Try next URL
        
        # If we get here, the connection was closed
        print("Connection closed. Trying to reconnect...")
        await asyncio.sleep(3)

if __name__ == "__main__":
    print(f"Starting camera feed from RPi {STATION_ID}")
    try:
        asyncio.run(send_camera_feed())
    except KeyboardInterrupt:
        print("Camera feed stopped by user")
