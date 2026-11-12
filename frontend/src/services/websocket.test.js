import { afterEach, expect, test, vi } from 'vitest';
import { WebSocketService } from './websocket';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('extraction data crosses the socket without being copied to the console', async () => {
  class FakeSocket {
    static OPEN = 1;
    readyState = FakeSocket.OPEN;
    send = vi.fn();
  }
  vi.stubGlobal('WebSocket', FakeSocket);
  const logs = ['log', 'warn', 'error'].map(level => vi.spyOn(console, level).mockImplementation(() => {}));
  const service = new WebSocketService();
  const connected = service.connect('session', 'ws://localhost:8101/api/ws', null, 'test-token');
  service.ws.onopen();
  await connected;

  const query = 'private-test-query';
  const file = 'private-test-filename';
  const extract = 'private-test-extracted-value';
  const listener = vi.fn();
  const stopped = vi.fn();
  service.on('extraction_stopped', stopped);
  service.on('streamRowData', listener);
  expect(service.send({ type: 'extraction_query', query })).toBe(true);
  expect(JSON.parse(service.ws.send.mock.calls[0][0])).toMatchObject({ query });
  const message = { type: 'streamRowData', data: { file_name: file, value: extract } };
  service.ws.onmessage({ data: JSON.stringify(message) });
  expect(listener).toHaveBeenCalledWith(message);

  const stopMessage = { type: 'extraction_stopped', message: 'private-test-stop-detail' };
  service.ws.onmessage({ data: JSON.stringify(stopMessage) });
  expect(stopped).toHaveBeenCalledWith(stopMessage);

  const consoleOutput = JSON.stringify(logs.flatMap(log => log.mock.calls));
  for (const content of [query, file, extract, stopMessage.message, 'test-token']) {
    expect(consoleOutput).not.toContain(content);
  }
});
