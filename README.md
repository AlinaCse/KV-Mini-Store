# Distributed In-Memory Key-Value Store

Pure Node.js implementation of a Redis-like TCP key-value store with LRU eviction, TTL expiry, write-ahead logging, and a local consistent-hashing router.

## Architecture

```text
CLI client
   |
   | TCP :6378
   v
Router + Consistent Hash Ring
   |--------- key hashes to node-6379 -> TCP node :6379 -> LRU + TTL + WAL
   |--------- key hashes to node-6380 -> TCP node :6380 -> LRU + TTL + WAL
   |--------- key hashes to node-6381 -> TCP node :6381 -> LRU + TTL + WAL
```

## Files

- `src/server.js`: single TCP storage node.
- `src/lruCache.js`: HashMap plus doubly linked list LRU cache.
- `src/ttlManager.js`: lazy and active expiry.
- `src/walLogger.js`: synchronous write-ahead log and recovery.
- `src/hashRing.js`: MD5 consistent hash ring with virtual nodes.
- `src/router.js`: TCP router that forwards commands to the right node.
- `src/client.js`: simple CLI client.

## Run A Single Node

```bash
node src/server.js
node src/client.js 6379
```

## Run The 3-Node Simulation

Open four terminals:

```bash
node src/server.js 6379
node src/server.js 6380
node src/server.js 6381
node src/router.js
```

Then connect through the router:

```bash
node src/client.js 6378
```

## Commands

```text
SET name kavya
GET name
DELETE name
SET session abc EX 10
EXPIRE name 30
KEYS
FLUSHLOG
QUIT
```

Responses are newline-delimited strings over the same TCP connection.

## Concepts

LRU eviction uses a `Map` for O(1) key lookup and a doubly linked list for O(1) recency updates. The most recently used item stays at the head, and the least recently used item is evicted from the tail when capacity is exceeded.

TTL expiry stores deadlines in a separate `expiryMap`. Lazy expiry checks a key during reads, while active expiry scans every 10 seconds to clean stale keys even if they are not read.

Write-ahead logging appends `SET` and `DELETE` synchronously before mutating memory. Recovery replays the log on startup and skips TTL entries that expired while the process was down.

Consistent hashing places each node on an MD5 hash ring multiple times using virtual nodes. Each key moves clockwise to the first node position, reducing remapping when nodes are added or removed.
