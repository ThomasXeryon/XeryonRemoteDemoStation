
import asyncio
import websockets
import json
from datetime import datetime

# Configuration - update this with your station ID
STATION_ID = "station-8"  # Change this to match your station's rpiId
SERVER_URL = "wss://xeryonremotedemostation.replit.app"  # Production URL

async def connect_to_server():
    uri = f"{SERVER_URL}/rpi/{STATION_ID}"
    
    while True:  # Reconnect loop
        try:
            print(f"[{datetime.now()}] Connecting to {uri}...")
            async with websockets.connect(uri) as websocket:
                print(f"[{datetime.now()}] Connected to server as {STATION_ID}")
                # Send registration message
                await websocket.send(json.dumps({"rpi_id": STATION_ID, "type": "register"}))
                
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        command = data.get("command", "unknown")
                        direction = data.get("direction", "none")
                        print(f"[{datetime.now()}] Received command: {command}, direction: {direction}")
                        
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
            print(f"[{datetime.now()}] Connection error: {str(e)}. Reconnecting in 5 seconds...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    print(f"[{datetime.now()}] Starting RPI WebSocket client for {STATION_ID}")
    asyncio.run(connect_to_server())
