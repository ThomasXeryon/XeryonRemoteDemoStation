import asyncio
import websockets
import json
from datetime import datetime
import sys
import os

# Get the station ID from command line arguments or use a default
if len(sys.argv) > 1:
    STATION_ID = sys.argv[1]
else:
    STATION_ID = "RPI1"  # Default ID if none provided

# Try multiple URLs to improve connection reliability
REPL_SLUG = os.environ.get('REPL_SLUG', 'xeryonremotedemostation')
SERVER_URLS = [
    f"ws://localhost:5000/rpi/{STATION_ID}",                           # Local development (when running on same machine)
    f"ws://0.0.0.0:5000/rpi/{STATION_ID}",                             # Direct IP (when running on same network)
    f"wss://{REPL_SLUG}.replit.app/rpi/{STATION_ID}",                  # Production URL
    f"wss://xeryonremotedemostation.replit.app/rpi/{STATION_ID}"       # Hardcoded production URL as fallback
]

async def connect_to_server():
    while True:  # Reconnect loop
        for uri in SERVER_URLS:
            try:
                print(f"[{datetime.now()}] Trying to connect to {uri}...")
                async with websockets.connect(uri) as websocket:
                    print(f"[{datetime.now()}] Connected to server as {STATION_ID} via {uri}")
                    # Send registration message
                    await websocket.send(json.dumps({
                        "status": "ready", 
                        "message": "RPi device online and ready to accept commands",
                        "type": "register",
                        "rpi_id": STATION_ID
                    }))

                    async for message in websocket:
                        try:
                            data = json.loads(message)
                            command = data.get("command", "unknown")
                            direction = data.get("direction", "none")

                            # Display received command prominently
                            print("\n" + "="*50)
                            print(f"COMMAND RECEIVED FROM UI: {command}")
                            print(f"DIRECTION: {direction}")
                            print("="*50 + "\n")

                            # Process the command here (implement your hardware control)
                            # For example, if command is "move", control the actuator

                            # Send back response
                            response = {
                                "status": "success",
                                "rpi_id": STATION_ID,
                                "message": f"Command '{command}' executed with direction '{direction}'"
                            }
                            await websocket.send(json.dumps(response))
                        except json.JSONDecodeError:
                            print(f"[{datetime.now()}] Invalid message: {message}")
            except Exception as e:
                print(f"[{datetime.now()}] Connection to {uri} failed: {str(e)}")
                print(f"[{datetime.now()}] Error type: {type(e).__name__}")
                continue  # Try next URL

        # If we get here, all connection attempts failed
        print(f"[{datetime.now()}] All connection attempts failed. Reconnecting in 5 seconds...")
        await asyncio.sleep(5)

if __name__ == "__main__":
    print(f"[{datetime.now()}] Starting RPI WebSocket client for {STATION_ID}")
    print(f"[{datetime.now()}] To use a different ID, run: python rpi-python-client.py YOUR_STATION_ID")
    print(f"[{datetime.now()}] Attempting to connect to server...")
    asyncio.run(connect_to_server())