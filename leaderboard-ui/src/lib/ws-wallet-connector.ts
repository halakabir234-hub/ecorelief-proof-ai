/**
 * Real WebSocket JSON-RPC DApp Connector client, for local development only.
 *
 * Talks to `midnight-wallet-cli`'s `midnight serve` (default port 9932),
 * which exposes the same `@midnight-ntwrk/dapp-connector-api` surface Lace
 * exposes via `window.midnight`, just over a WebSocket JSON-RPC 2.0 bridge
 * instead of in-page injection. Protocol confirmed by direct connection to a
 * live `midnight serve --wallet ecorelief-demo --network undeployed` server:
 *   - request:  {"jsonrpc":"2.0","id":<n>,"method":<name>,"params":{...}}
 *   - success:  {"jsonrpc":"2.0","id":<n>,"result":{...}}
 *   - error:    {"jsonrpc":"2.0","id":<n>,"error":{"code":<n>,"message":<str>}}
 *   - one connection is stateful for its lifetime (connect() once, then call
 *     other methods on the same socket)
 *   - params object keys match the real TS method's parameter names
 *     (e.g. `connect(networkId: string)` -> `params: { networkId }`)
 *
 * This client never mocks a response — every result comes from a real
 * round trip to the connector process, which itself talks to the real local
 * node/indexer/proof server.
 */

export class WsWalletConnectorError extends Error {}

interface JsonRpcErrorPayload {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

interface JsonRpcResponse<T> {
  readonly jsonrpc: '2.0';
  readonly id: number | null;
  readonly result?: T;
  readonly error?: JsonRpcErrorPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJsonRpcResponse(raw: unknown): JsonRpcResponse<unknown> | undefined {
  if (!isRecord(raw) || raw.jsonrpc !== '2.0' || typeof raw.id !== 'number') return undefined;
  return raw as unknown as JsonRpcResponse<unknown>;
}

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

/** Low-level JSON-RPC 2.0 request/response pairing over one persistent WebSocket connection. */
export class WsJsonRpcClient {
  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<number, PendingCall>();
  #ready: Promise<void>;

  constructor(url: string) {
    this.#socket = new WebSocket(url);
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#socket.addEventListener(
        'open',
        () => resolve(),
        { once: true },
      );
      this.#socket.addEventListener(
        'error',
        () =>
          reject(
            new WsWalletConnectorError(
              `Could not reach the local wallet connector at ${url}. Is "midnight serve" running?`,
            ),
          ),
        { once: true },
      );
    });
    this.#socket.addEventListener('message', (event) => this.#handleMessage(event));
    this.#socket.addEventListener('close', () => {
      const closeError = new WsWalletConnectorError('Local wallet connector closed the connection.');
      for (const pending of this.#pending.values()) {
        pending.reject(closeError);
      }
      this.#pending.clear();
    });
  }

  #handleMessage(event: MessageEvent<unknown>): void {
    if (typeof event.data !== 'string') return;
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(event.data);
    } catch {
      return;
    }
    const response = parseJsonRpcResponse(parsedRaw);
    if (!response || response.id === null) return;
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);
    if (response.error) {
      pending.reject(new WsWalletConnectorError(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    await this.#ready;
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.#socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  close(): void {
    this.#socket.close();
  }
}

/** The minimal subset of the real dapp-connector-api ConnectedAPI that EcoRelief's provider construction needs. */
export interface WsConnectedWallet {
  getConfiguration(): Promise<{
    readonly indexerUri: string;
    readonly indexerWsUri: string;
    readonly proverServerUri?: string;
  }>;
  getShieldedAddresses(): Promise<{
    readonly shieldedAddress: string;
    readonly shieldedCoinPublicKey: string;
    readonly shieldedEncryptionPublicKey: string;
  }>;
  balanceUnsealedTransaction(tx: string): Promise<{ readonly tx: string }>;
  submitTransaction(tx: string): Promise<void>;
}

/**
 * Connects to the local WebSocket DApp Connector and performs the real
 * `connect` handshake (mirrors `InitialAPI.connect(networkId)` from
 * `@midnight-ntwrk/dapp-connector-api`). Every subsequent call reuses this
 * same connection, matching the server's stateful-per-connection behavior.
 */
export async function connectLocalWallet(url: string, networkId: string): Promise<WsConnectedWallet> {
  const client = new WsJsonRpcClient(url);
  await client.call('connect', { networkId });
  return {
    getConfiguration: () =>
      client.call('getConfiguration', {}),
    getShieldedAddresses: () =>
      client.call('getShieldedAddresses', {}),
    balanceUnsealedTransaction: (tx: string) =>
      client.call('balanceUnsealedTransaction', { tx }),
    submitTransaction: (tx: string) =>
      client.call('submitTransaction', { tx }),
  };
}
