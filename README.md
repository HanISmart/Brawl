# Brawl

2D horror game prototype inspired by asymmetrical hide-and-seek gameplay.

This first step sets up the background scene:
- Large haunted-house playfield with many rooms
- Dark, scary atmosphere with fog and vignette
- Two characters: Survivor and Hunter
- Hiding spot markers: under bed, locker, behind curtain
- Stylized game scale where world units differ from real-world measurements

## Run

Use the built-in Node server (required for multiplayer WebSocket support):

```bash
npm install
npm start
```

Then open one of the printed URLs, for example:

```text
http://localhost:5500
http://<your-lan-ip>:5500
```

For other computers on the same network, open:

```text
http://<host-lan-ip>:5500
```

If needed, force a specific WebSocket host from the browser URL:

```text
http://<host-lan-ip>:5500/?server=<host-lan-ip>:5500
```