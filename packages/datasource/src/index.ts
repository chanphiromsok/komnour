export interface DataSource<T = unknown> {
  fetch(): Promise<T>
}

export class JsonDataSource<T = unknown> implements DataSource<T> {
  constructor(private data: T) {}
  async fetch(): Promise<T> {
    return this.data
  }
}

export class HttpDataSource<T = unknown> implements DataSource<T> {
  constructor(private url: string) {}
  async fetch(): Promise<T> {
    const res = await globalThis.fetch(this.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${this.url}`)
    return res.json() as Promise<T>
  }
}
