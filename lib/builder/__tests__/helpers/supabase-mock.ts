// lib/builder/__tests__/helpers/supabase-mock.ts
//
// Shared minimal Supabase client mock for Builder test suites (Tasks 2-3, 5-9).
// Deliberately explicit rather than a generic proxy: each table/RPC/storage
// bucket gets a FIFO queue of canned responses, and every chain call is
// recorded to `calls` for assertions on exact eq()/in()/select() arguments.
//
// Supported chains:
//   from(table).update(values).eq(...).eq(...).in(...)/.eq(...).select(cols).maybeSingle()/.single()
//   from(table).select(cols).eq(...).maybeSingle()/.single()
//   from(table).select(cols).eq(...).order(...).limit(...)  (awaited directly)
//   from(table).insert(values).select().single()
//   from(table).insert(values)                       (awaited directly, no .select())
//   from(table).update(values).eq(...)              (awaited directly, no .select())
//   from(table).delete().eq(...)                    (awaited directly, no .select())
//   rpc(name, args)
//   storage.from(bucket).upload(...) / .createSignedUrl(...) / .download(...)

export interface MockResult<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export interface CallRecord {
  table?: string;
  method: string;
  args: unknown[];
}

type Queue = MockResult[];

export class SupabaseMock {
  calls: CallRecord[] = [];

  private tableQueues = new Map<string, Queue>();
  private rpcQueues = new Map<string, Queue>();
  private storageQueues = new Map<string, Queue>();

  /** Queue the next terminal response (maybeSingle/single/direct-await) for a table. */
  queueTable(table: string, result: MockResult): this {
    this.push(this.tableQueues, table, result);
    return this;
  }

  /** Queue the next rpc(name, ...) response. */
  queueRpc(name: string, result: MockResult): this {
    this.push(this.rpcQueues, name, result);
    return this;
  }

  /** Queue the next storage.from(bucket).upload(...) response. */
  queueStorageUpload(bucket: string, result: MockResult): this {
    this.push(this.storageQueues, `${bucket}:upload`, result);
    return this;
  }

  /** Queue the next storage.from(bucket).createSignedUrl(...) response. */
  queueStorageSignedUrl(bucket: string, result: MockResult): this {
    this.push(this.storageQueues, `${bucket}:createSignedUrl`, result);
    return this;
  }

  /** Queue the next storage.from(bucket).download(...) response. */
  queueStorageDownload(bucket: string, result: MockResult): this {
    this.push(this.storageQueues, `${bucket}:download`, result);
    return this;
  }

  private push(map: Map<string, Queue>, key: string, result: MockResult) {
    const queue = map.get(key) ?? [];
    queue.push(result);
    map.set(key, queue);
  }

  private shift(map: Map<string, Queue>, key: string, kind: string): MockResult {
    const queue = map.get(key);
    if (!queue || queue.length === 0) {
      throw new Error(`SupabaseMock: no queued ${kind} response for "${key}"`);
    }
    return queue.shift()!;
  }

  /** Build the fake supabase client (structurally typed `any` — matches lib/builder/review-gate.ts's pure-module pattern). */
  client(): any {
    const self = this;

    function makeChain(table: string) {
      const chain: any = {
        update(values: Record<string, unknown>) {
          self.calls.push({ table, method: 'update', args: [values] });
          return chain;
        },
        insert(values: unknown) {
          self.calls.push({ table, method: 'insert', args: [values] });
          return chain;
        },
        delete() {
          self.calls.push({ table, method: 'delete', args: [] });
          return chain;
        },
        select(cols?: string) {
          self.calls.push({ table, method: 'select', args: [cols] });
          return chain;
        },
        eq(col: string, val: unknown) {
          self.calls.push({ table, method: 'eq', args: [col, val] });
          return chain;
        },
        in(col: string, vals: unknown[]) {
          self.calls.push({ table, method: 'in', args: [col, vals] });
          return chain;
        },
        order(col: string, opts?: Record<string, unknown>) {
          self.calls.push({ table, method: 'order', args: [col, opts] });
          return chain;
        },
        limit(n: number) {
          self.calls.push({ table, method: 'limit', args: [n] });
          return chain;
        },
        maybeSingle: async () => {
          self.calls.push({ table, method: 'maybeSingle', args: [] });
          return self.shift(self.tableQueues, table, 'table');
        },
        single: async () => {
          self.calls.push({ table, method: 'single', args: [] });
          return self.shift(self.tableQueues, table, 'table');
        },
        // Real supabase-js query builders are thenable: awaiting the chain
        // directly (no .select()/.maybeSingle()) still executes the query.
        then: (...thenArgs: Parameters<Promise<MockResult>['then']>) => {
          self.calls.push({ table, method: 'then', args: [] });
          return Promise.resolve(self.shift(self.tableQueues, table, 'table')).then(...thenArgs);
        },
      };
      return chain;
    }

    return {
      from(table: string) {
        self.calls.push({ table, method: 'from', args: [table] });
        return makeChain(table);
      },
      rpc(name: string, args?: Record<string, unknown>) {
        self.calls.push({ method: 'rpc', args: [name, args] });
        return Promise.resolve(self.shift(self.rpcQueues, name, 'rpc'));
      },
      storage: {
        from(bucket: string) {
          self.calls.push({ method: 'storage.from', args: [bucket] });
          return {
            upload: async (...args: unknown[]) => {
              self.calls.push({ method: 'storage.upload', args: [bucket, ...args] });
              return self.shift(self.storageQueues, `${bucket}:upload`, 'storage upload');
            },
            createSignedUrl: async (...args: unknown[]) => {
              self.calls.push({ method: 'storage.createSignedUrl', args: [bucket, ...args] });
              return self.shift(self.storageQueues, `${bucket}:createSignedUrl`, 'storage createSignedUrl');
            },
            download: async (...args: unknown[]) => {
              self.calls.push({ method: 'storage.download', args: [bucket, ...args] });
              return self.shift(self.storageQueues, `${bucket}:download`, 'storage download');
            },
          };
        },
      },
    };
  }
}
