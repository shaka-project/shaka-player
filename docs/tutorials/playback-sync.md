# Playback Synchronization with PubNub

This tutorial explains how to use Shaka Player's playback synchronization feature to keep multiple clients watching the same video in sync. This is perfect for "watch party" experiences where friends want to watch content together remotely.

## Overview

The `shaka.sync.SyncManager` enables real-time playback synchronization between multiple clients using [PubNub](https://www.pubnub.com/) as the messaging layer. One client acts as the **master** (controlling playback) while others are **followers** (receiving sync commands).

### Features

- **Play/Pause Sync**: When the master plays or pauses, all followers follow
- **Seek Sync**: When the master seeks to a new position, followers jump to that position
- **Playback Rate Sync**: Speed changes are synchronized across all clients
- **Drift Correction**: Periodic sync pulses keep clients aligned within 500ms
- **Latency Compensation**: Network latency is accounted for in time synchronization

## Prerequisites

1. A PubNub account with publish and subscribe keys
   - Sign up free at [PubNub Admin Portal](https://admin.pubnub.com/)
   - Create a new app and keyset
2. Shaka Player (with sync module)
3. PubNub JavaScript SDK

## Installation

### Include PubNub SDK

Add the PubNub SDK before your Shaka Player script:

```html
<!-- PubNub SDK -->
<script src="https://cdn.pubnub.com/sdk/javascript/pubnub.8.0.0.min.js"></script>

<!-- Shaka Player -->
<script src="path/to/shaka-player.compiled.js"></script>
```

Or install via npm:

```bash
npm install pubnub shaka-player
```

## Basic Usage

### 1. Create a Shaka Player instance

```javascript
// Create video element and player
const video = document.getElementById('video');
const player = new shaka.Player();
await player.attach(video);

// Load your content
await player.load('https://example.com/video.mpd');
```

### 2. Create the SyncManager

```javascript
const syncManager = new shaka.sync.SyncManager(player, {
  publishKey: 'YOUR_PUBNUB_PUBLISH_KEY',
  subscribeKey: 'YOUR_PUBNUB_SUBSCRIBE_KEY',
  // Optional: provide your own user ID
  userId: 'user-123',
  // Optional: max allowed time drift before correction (default: 0.5 seconds)
  maxDriftThreshold: 0.5,
  // Optional: how often to send sync pulses (default: 5000ms)
  syncIntervalMs: 5000,
});
```

### 3. Connect to a sync room

```javascript
// All clients with the same room ID will be synchronized
await syncManager.connect('watch-party-abc123');
```

### 4. Control roles

```javascript
// One client should be the master (controls playback)
syncManager.becomeMaster();

// Others remain followers (automatically receive commands)
// Follower is the default role, but you can explicitly set it:
syncManager.becomeFollower();
```

### 5. Disconnect when done

```javascript
await syncManager.disconnect();

// Or destroy to clean up completely
await syncManager.destroy();
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `publishKey` | string | *required* | Your PubNub publish key |
| `subscribeKey` | string | *required* | Your PubNub subscribe key |
| `userId` | string | auto-generated | Unique identifier for this client |
| `maxDriftThreshold` | number | 0.5 | Max time drift (seconds) before forcing correction |
| `syncIntervalMs` | number | 5000 | How often master sends sync pulses (milliseconds) |

## API Reference

### Methods

#### `connect(roomId)`
Connects to a sync room and begins listening for sync commands.

```javascript
await syncManager.connect('my-room-id');
```

#### `disconnect()`
Disconnects from the current sync room.

```javascript
await syncManager.disconnect();
```

#### `becomeMaster()`
Makes this client the master controller. The master's playback actions are broadcast to all followers.

```javascript
syncManager.becomeMaster();
```

#### `becomeFollower()`
Makes this client a follower. Followers receive and apply sync commands from the master.

```javascript
syncManager.becomeFollower();
```

#### `getRole()`
Returns the current role of this client.

```javascript
const role = syncManager.getRole(); // 'master' or 'follower'
```

#### `isConnected()`
Returns whether we're currently connected to a sync room.

```javascript
if (syncManager.isConnected()) {
  console.log('Connected!');
}
```

#### `getRoomId()`
Returns the current room ID.

```javascript
const room = syncManager.getRoomId();
```

#### `getUserId()`
Returns this client's user ID.

```javascript
const userId = syncManager.getUserId();
```

#### `destroy()`
Destroys the SyncManager and releases all resources.

```javascript
await syncManager.destroy();
```

## Complete Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Watch Party</title>
  <script src="https://cdn.pubnub.com/sdk/javascript/pubnub.8.0.0.min.js"></script>
  <script src="path/to/shaka-player.compiled.js"></script>
</head>
<body>
  <video id="video" controls width="800"></video>

  <div>
    <input type="text" id="room-id" placeholder="Room ID" value="my-watch-party">
    <button id="connect">Connect</button>
    <button id="disconnect" disabled>Disconnect</button>
    <button id="master" disabled>Become Master</button>
  </div>

  <script>
    let player;
    let syncManager;

    async function init() {
      // Initialize Shaka
      shaka.polyfill.installAll();

      const video = document.getElementById('video');
      player = new shaka.Player();
      await player.attach(video);
      await player.load('https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths/dash.mpd');
    }

    document.getElementById('connect').onclick = async () => {
      const roomId = document.getElementById('room-id').value;

      syncManager = new shaka.sync.SyncManager(player, {
        publishKey: 'YOUR_PUBLISH_KEY',
        subscribeKey: 'YOUR_SUBSCRIBE_KEY',
      });

      await syncManager.connect(roomId);

      document.getElementById('connect').disabled = true;
      document.getElementById('disconnect').disabled = false;
      document.getElementById('master').disabled = false;

      console.log('Connected! Your ID:', syncManager.getUserId());
    };

    document.getElementById('disconnect').onclick = async () => {
      await syncManager.disconnect();
      syncManager = null;

      document.getElementById('connect').disabled = false;
      document.getElementById('disconnect').disabled = true;
      document.getElementById('master').disabled = true;
    };

    document.getElementById('master').onclick = () => {
      syncManager.becomeMaster();
      console.log('You are now the master!');
    };

    init();
  </script>
</body>
</html>
```

## How It Works

### Master/Follower Model

The sync system uses a master/follower model:

1. **Master**: One client that controls playback for everyone
   - When the master plays, pauses, seeks, or changes speed, commands are sent to all followers
   - Master sends periodic "sync pulses" to keep followers aligned

2. **Followers**: All other clients that receive and apply commands
   - Followers listen for commands from the master
   - When a command arrives, the follower applies it to their local player
   - Latency compensation is applied to account for network delay

### Latency Compensation

When a master sends a command, it includes a timestamp. When a follower receives it:

1. Calculate how long the message took to arrive (latency)
2. Add that latency to the target time
3. Seek to the compensated time

This ensures followers are at the correct position despite network delays.

### Drift Correction

Even with latency compensation, clients can drift apart over time due to:
- Buffering differences
- Clock differences
- Variable network conditions

To combat this, the master sends periodic sync pulses (every 5 seconds by default). If a follower has drifted more than the threshold (500ms by default), their position is corrected.

## Best Practices

1. **Only one master**: Ensure only one client is the master at a time
2. **Handle master disconnection**: If the master disconnects, elect a new one
3. **Test with real latency**: Test on different networks, not just localhost
4. **Use appropriate thresholds**:
   - Lower `maxDriftThreshold` = tighter sync but more corrections
   - Higher `maxDriftThreshold` = fewer corrections but looser sync

## Troubleshooting

### "PubNub SDK not found"
Make sure you've included the PubNub SDK before Shaka Player.

### Sync seems delayed
- Check network conditions
- Ensure the master is actually sending commands (check console logs)
- Verify both clients are in the same room

### Clients keep drifting apart
- Reduce `syncIntervalMs` for more frequent sync pulses
- Lower `maxDriftThreshold` for stricter drift correction

### Playback stutters on followers
- Increase `maxDriftThreshold` to reduce correction frequency
- Check if buffering is causing issues

## Demo

A full demo is available at `demo/sync/index.html` in the Shaka Player repository.

To run it:

```bash
# From the shaka-player directory
python3 -m http.server 8000

# Open in browser
# http://localhost:8000/demo/sync/
```

Open the demo in two browser windows with the same Room ID to test synchronization.

