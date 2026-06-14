const net = require('net');
const readline = require('readline');

const port = Number(process.argv[2] || 6378);

// startClient implements a minimal REPL over the raw TCP text protocol.
function startClient() {
  const socket = net.createConnection({ port }, () => {
    console.log(`Connected to KV service on port ${port}`);
    rl.prompt();
  });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'kv> ' });

  // socket data handler prints one response per command from the server.
  socket.setEncoding('utf8');
  socket.on('data', (data) => {
    process.stdout.write(data);
    rl.prompt();
  });

  // line handler forwards raw commands exactly as users type them.
  rl.on('line', (line) => {
    if (line.trim().toUpperCase() === 'QUIT') {
      socket.end();
      rl.close();
      return;
    }
    socket.write(`${line}\n`);
  });

  // error handler exposes connection failures during manual testing.
  socket.on('error', (err) => console.error(`Connection error: ${err.message}`));
}

if (require.main === module) startClient();

module.exports = startClient;
