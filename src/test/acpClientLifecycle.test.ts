import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

class FakeStream extends EventEmitter {
  setEncoding(_encoding: BufferEncoding): this {
    return this;
  }
}

class FakeChildProcess extends EventEmitter {
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  readonly writes: Array<Record<string, unknown>> = [];
  readonly stdin = {
    write: (message: string) => {
      const request = JSON.parse(message.trim()) as { id: number; method?: string };
      this.writes.push(request);
      if (request.method) {
        setTimeout(() => {
          this.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} })}\n`);
        }, this.responseDelayMs);
      }
      return true;
    },
  };

  constructor(private readonly responseDelayMs: number) {
    super();
  }

  kill(): boolean {
    setTimeout(() => this.emit('exit', 0), 25);
    return true;
  }
}

test('an exiting stopped process cannot detach its running replacement', async () => {
  const childProcess = require('node:child_process') as typeof import('node:child_process');
  const originalSpawn = childProcess.spawn;
  const spawned: FakeChildProcess[] = [];

  Object.defineProperty(childProcess, 'spawn', {
    configurable: true,
    value: () => {
      const process = new FakeChildProcess(spawned.length === 0 ? 0 : 50);
      spawned.push(process);
      return process;
    },
  });

  try {
    const { AcpClient } = await import('../acpClient');
    const client = new AcpClient('/fake/hermes');

    await client.start();
    client.stop();
    await client.start();

    await new Promise(resolve => setTimeout(resolve, 50));

    assert.equal(spawned.length, 2);
    assert.equal(client.running, true, 'the old exit handler must not clear the replacement process');

    client.stop();
  } finally {
    Object.defineProperty(childProcess, 'spawn', {
      configurable: true,
      value: originalSpawn,
    });
  }
});

test('a request from a stopped process cannot reply through its replacement', async () => {
  const childProcess = require('node:child_process') as typeof import('node:child_process');
  const originalSpawn = childProcess.spawn;
  const spawned: FakeChildProcess[] = [];

  Object.defineProperty(childProcess, 'spawn', {
    configurable: true,
    value: () => {
      const process = new FakeChildProcess(0);
      spawned.push(process);
      return process;
    },
  });

  try {
    const { AcpClient } = await import('../acpClient');
    const client = new AcpClient('/fake/hermes');
    let resolveRequest!: (result: unknown) => void;
    client.onIncomingRequest(() => new Promise(resolve => { resolveRequest = resolve; }));

    await client.start();
    spawned[0].stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      id: 99,
      method: 'session/request_permission',
      params: {},
    })}\n`);
    await new Promise(resolve => setImmediate(resolve));

    client.stop();
    await client.start();
    resolveRequest({ outcome: { outcome: 'selected', optionId: 'allow_once' } });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(spawned.length, 2);
    assert.deepEqual(
      spawned[1].writes.map(message => message.method ?? `reply:${message.id}`),
      ['initialize'],
      'a stale request handler must not write its reply to the replacement process',
    );

    client.stop();
  } finally {
    Object.defineProperty(childProcess, 'spawn', {
      configurable: true,
      value: originalSpawn,
    });
  }
});

test('current process cleanup finishes before an exit listener starts its replacement', async () => {
  const childProcess = require('node:child_process') as typeof import('node:child_process');
  const originalSpawn = childProcess.spawn;
  const spawned: FakeChildProcess[] = [];

  Object.defineProperty(childProcess, 'spawn', {
    configurable: true,
    value: () => {
      const process = new FakeChildProcess(spawned.length === 0 ? 0 : 50);
      spawned.push(process);
      return process;
    },
  });

  try {
    const { AcpClient } = await import('../acpClient');
    const client = new AcpClient('/fake/hermes');
    await client.start();

    let restart: Promise<void> | undefined;
    client.once('exit', () => {
      restart = client.start();
    });

    spawned[0].emit('exit', 7);

    assert.ok(restart, 'the exit listener should synchronously start a replacement');
    await restart;
    assert.equal(client.running, true);
    assert.equal(spawned.length, 2);

    client.stop();
  } finally {
    Object.defineProperty(childProcess, 'spawn', {
      configurable: true,
      value: originalSpawn,
    });
  }
});

test('current process cleanup finishes before an error listener starts its replacement', async () => {
  const childProcess = require('node:child_process') as typeof import('node:child_process');
  const originalSpawn = childProcess.spawn;
  const spawned: FakeChildProcess[] = [];

  Object.defineProperty(childProcess, 'spawn', {
    configurable: true,
    value: () => {
      const process = new FakeChildProcess(spawned.length === 0 ? 0 : 50);
      spawned.push(process);
      return process;
    },
  });

  try {
    const { AcpClient } = await import('../acpClient');
    const client = new AcpClient('/fake/hermes');
    await client.start();

    let restart: Promise<void> | undefined;
    client.once('exit', () => {
      restart = client.start();
    });

    spawned[0].emit('error', new Error('spawn failed'));

    assert.ok(restart, 'the error path should synchronously publish an exit event');
    await restart;
    assert.equal(client.running, true);
    assert.equal(spawned.length, 2);

    client.stop();
  } finally {
    Object.defineProperty(childProcess, 'spawn', {
      configurable: true,
      value: originalSpawn,
    });
  }
});
