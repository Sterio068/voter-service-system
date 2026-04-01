// Type declarations for node:sqlite (Node.js v25 built-in module)
declare module 'node:sqlite' {
  export interface StatementResultingChanges {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }

  export interface StatementSyncInterface {
    all(...namedParameters: any[]): unknown[]
    get(...namedParameters: any[]): unknown
    run(...namedParameters: any[]): StatementResultingChanges
    iterate(...namedParameters: any[]): Iterator<unknown>
    setReadBigInts(enabled: boolean): void
    expandedSQL: string
    sourceSQL: string
  }

  export class DatabaseSync {
    constructor(location: string, options?: { open?: boolean; readOnly?: boolean; allowExtension?: boolean })
    open(): void
    close(): void
    prepare(sql: string): StatementSyncInterface
    exec(sql: string): void
    createSession(options?: { table?: string; db?: string }): object
    applyChangeset(changeset: Buffer, options?: object): boolean
    loadExtension(path: string, entryPoint?: string): void
  }
}
