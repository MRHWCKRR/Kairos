import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Run in a child: the vulnerable fetch implementation crashes after its promise
// has already rejected, so an ordinary assert.rejects would miss the failure.
test('development fetch survives a truncated response with excessive content encodings', () => {
  const require = createRequire(import.meta.url);
  const undici = require.resolve('undici', { paths: [require.resolve('miniflare')] });
  const script = `
    const net = require('node:net');
    const { fetch } = require(${JSON.stringify(undici)});
    const server = net.createServer(socket => socket.once('data', () => {
      socket.end('HTTP/1.1 200 OK\\r\\nContent-Encoding: gzip,gzip,gzip,gzip,gzip,gzip\\r\\nContent-Length: 100\\r\\nConnection: close\\r\\n\\r\\n');
    }));
    server.listen(0, '127.0.0.1', async () => {
      try {
        await fetch('http://127.0.0.1:' + server.address().port);
        process.exitCode = 1;
      } catch { console.log('rejected safely'); }
      setTimeout(() => server.close(() => console.log('survived')), 100);
    });
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /rejected safely/);
  assert.match(result.stdout, /survived/);
});
