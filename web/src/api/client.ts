const API_BASE = '/api/v1';

type UnauthorizedHandler = () => void;

/**
 * The config.toml mtime the client last saw. Write requests send it as
 * X-Config-Loaded-Mtime so the engine can reject (409) saves that would
 * clobber edits made through the desktop shell's TOML editor (see
 * docs/adr/0002-dual-track-config-write-back.md).
 */
const HEADER_CONFIG_MTIME = 'X-Config-Mtime';
const HEADER_CONFIG_LOADED_MTIME = 'X-Config-Loaded-Mtime';

class ApiClient {
  private token: string = '';
  private onUnauthorized?: UnauthorizedHandler;
  private configMtime: string = '';

  setToken(token: string) {
    this.token = token;
  }

  getToken(): string {
    return this.token;
  }

  setOnUnauthorized(handler: UnauthorizedHandler) {
    this.onUnauthorized = handler;
  }

  getConfigMtime(): string {
    return this.configMtime;
  }

  setConfigMtime(mtime: string) {
    this.configMtime = mtime;
  }

  private headers(): HeadersInit {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  private noteConfigMtime(res: Response) {
    const mtime = res.headers.get(HEADER_CONFIG_MTIME);
    if (mtime) this.configMtime = mtime;
  }

  async request<T = any>(method: string, path: string, body?: any, params?: Record<string, string>): Promise<T> {
    let url = `${API_BASE}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }
    const headers = this.headers() as Record<string, string>;
    const isWrite = method !== 'GET' && method !== 'HEAD';
    if (isWrite && this.configMtime) {
      headers[HEADER_CONFIG_LOADED_MTIME] = this.configMtime;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && this.onUnauthorized) {
      this.onUnauthorized();
      throw new ApiError('Unauthorized', 401);
    }
    this.noteConfigMtime(res);
    const json = await res.json();
    if (!json.ok) {
      throw new ApiError(json.error || 'Unknown error', res.status);
    }
    return json.data as T;
  }

  get<T = any>(path: string, params?: Record<string, string>) { return this.request<T>('GET', path, undefined, params); }
  post<T = any>(path: string, body?: any) { return this.request<T>('POST', path, body); }
  put<T = any>(path: string, body?: any) { return this.request<T>('PUT', path, body); }
  patch<T = any>(path: string, body?: any) { return this.request<T>('PATCH', path, body); }
  delete<T = any>(path: string) { return this.request<T>('DELETE', path); }

  /** Fetch raw text (non-JSON) from an API endpoint. */
  async raw(path: string): Promise<string> {
    const h: HeadersInit = {};
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { headers: h });
    if (res.status === 401 && this.onUnauthorized) {
      this.onUnauthorized();
      throw new ApiError('Unauthorized', 401);
    }
    if (!res.ok) throw new ApiError(res.statusText, res.status);
    this.noteConfigMtime(res);
    return res.text();
  }

  /**
   * PUT a raw text body (e.g. config.toml content to /config). Unlike request(),
   * the body is sent verbatim with text/plain — the engine expects file content,
   * not JSON. Mtime headers flow the same way so stale editors get a 409.
   */
  async putRaw(path: string, text: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (this.configMtime) headers[HEADER_CONFIG_LOADED_MTIME] = this.configMtime;
    const res = await fetch(`${API_BASE}${path}`, { method: 'PUT', headers, body: text });
    if (res.status === 401 && this.onUnauthorized) {
      this.onUnauthorized();
      throw new ApiError('Unauthorized', 401);
    }
    this.noteConfigMtime(res);
    const json = await res.json();
    if (!json.ok) {
      throw new ApiError(json.error || 'Unknown error', res.status);
    }
    return json.data as any;
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/** True when a request failed because config.toml changed underneath us. */
export function isStaleConfigError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409;
}

export const api = new ApiClient();
export default api;
