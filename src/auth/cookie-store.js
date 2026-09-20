import { readFileSync, statSync } from 'node:fs';
import { atomicJson } from './atomic-json.js';

export const WEB_SESSION_STATUS = Object.freeze({
  MISSING: 'missing',
  UNKNOWN: 'unknown',
  VALID: 'valid',
  EXPIRED: 'expired',
});

// RFC6265 cookie-octet 之外的字符不能原样出现在 Cookie 请求头里，逐字节 percent-encode。
const COOKIE_OCTET_ENCODE = /[^\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]/g;

export function encodeCookieValue(value) {
  return String(value).replace(COOKIE_OCTET_ENCODE, (c) => {
    const hex = c.charCodeAt(0).toString(16).toUpperCase();
    return `%${hex.length < 2 ? `0${hex}` : hex}`;
  });
}

// 把用户粘贴的 Cookie 统一转成请求头形式 "name=value; …"，接受三种输入：
//   1) 浏览器 DevTools 复制的整行 Cookie 请求头（原样，允许 "cookie:" 前缀、换行折叠）；
//   2) Cookie 插件导出的 JSON 对象 {"name": "value", …}（值可已是 %XX 编码，可多行）；
//   3) Cookie 插件导出的 JSON 数组 [{"name","value","domain",…}, …]。
// 非字符串值跳过、同名取最后一个；解析失败抛带具体原因的错误。
// 粘贴来源常带 BOM/零宽/左右书写标记等不可见前缀字符（复制时误带），先剥掉再识别格式。
const INVISIBLE_LEAD = /^[\uFEFF\u200B\u200C\u200D\u200E\u200F\u2060\uFE0E\uFE0F\u202A-\u202E]+/;

export function normalizeCookieHeader(input) {
  let value = String(input ?? '').trim().replace(INVISIBLE_LEAD, '').trim();
  if (!value) throw new Error('Cookie 格式无效：内容为空');
  if (value[0] === '{' || value[0] === '[') {
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new Error('Cookie JSON 无法解析：请确认整段都是从插件复制、没有被截断'); }
    const pairs = [];
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim()
            && typeof item.value === 'string') pairs.push([item.name.trim(), item.value]);
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const [name, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && name.trim()) pairs.push([name.trim(), v]);
      }
    }
    const parts = [];
    const seen = new Set();
    for (const [name, val] of pairs) {
      if (seen.has(name)) continue;
      seen.add(name);
      parts.push(`${name}=${encodeCookieValue(val)}`);
    }
    if (!parts.length) throw new Error('Cookie 格式无效：JSON 里没有可用的 name/value 字符串');
    return parts.join('; ');
  }
  const header = value.replace(/^cookie:\s*/i, '').replace(/\s+/g, ' ').trim();
  if (!header) throw new Error('Cookie 格式无效：内容为空');
  return header;
}

export function parseCookiePairs(header) {
  const pairs = new Map();
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    const name = index < 1 ? '' : part.slice(0, index).trim();
    const value = index < 1 ? '' : part.slice(index + 1);
    if (!name || !/^[\w-]+$/.test(name)) continue;
    pairs.set(name, value);
  }
  return pairs;
}

// Upstream Set-Cookie refresh must win per cookie, while cookies it did not
// rotate (auth/auth_secure/userinfo) stay in the persisted snapshot.
export function mergeCookieHeaders(current, incoming) {
  const pairs = new Map([...parseCookiePairs(current), ...parseCookiePairs(incoming)]);
  if (!pairs.size) return null;
  return [...pairs.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

export class CookieStore {
  constructor({ path = '/data/auth/deviantart-cookies.json', seedEnvCookie = null } = {}) {
    this.path = path;
    this.seedEnvCookie = seedEnvCookie;
    this.initialized = false;
    this.cookies = null;
    this.state = WEB_SESSION_STATUS.MISSING;
    this.updatedAt = null;
    this.checkedAt = null;
    this.stamp = null;
  }
  load() {
    try {
      const stat = statSync(this.path);
      const stamp = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
      if (stamp !== this.stamp) {
        const data = JSON.parse(readFileSync(this.path, 'utf8'));
        this.cookies = typeof data?.cookies === 'string' ? data.cookies || null : null;
        this.state = Object.values(WEB_SESSION_STATUS).includes(data?.state)
          ? data.state
          : (this.cookies ? WEB_SESSION_STATUS.UNKNOWN : WEB_SESSION_STATUS.MISSING);
        this.updatedAt = data?.updatedAt || null;
        this.checkedAt = data?.checkedAt || null;
        this.stamp = stamp;
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      this.cookies = null;
      this.state = WEB_SESSION_STATUS.MISSING;
      this.updatedAt = null;
      this.checkedAt = null;
      if (!this.initialized && error.code === 'ENOENT') this.write(this.seedEnvCookie || null, WEB_SESSION_STATUS.MISSING);
    }
    this.initialized = true;
    this.seedEnvCookie = null;
    return this;
  }
  getCookies() { return this.load().cookies; }
  available() { return !!this.getCookies(); }
  getState() {
    this.load();
    return {
      state: this.cookies ? this.state : WEB_SESSION_STATUS.MISSING,
      hasCookie: !!this.cookies,
      updatedAt: this.updatedAt,
      checkedAt: this.checkedAt,
    };
  }
  write(cookies, state = cookies ? WEB_SESSION_STATUS.UNKNOWN : WEB_SESSION_STATUS.MISSING) {
    const now = new Date().toISOString();
    atomicJson(this.path, {
      version: 1,
      cookies,
      state: cookies ? state : WEB_SESSION_STATUS.MISSING,
      updatedAt: cookies ? now : this.updatedAt,
      checkedAt: state === WEB_SESSION_STATUS.VALID || state === WEB_SESSION_STATUS.EXPIRED ? now : this.checkedAt,
    });
    this.cookies = cookies;
    this.state = cookies ? state : WEB_SESSION_STATUS.MISSING;
    this.updatedAt = cookies ? now : this.updatedAt;
    this.checkedAt = state === WEB_SESSION_STATUS.VALID || state === WEB_SESSION_STATUS.EXPIRED ? now : this.checkedAt;
    this.initialized = true;
    this.stamp = null;
  }
  mergeCookies(incoming) {
    if (!incoming) return;
    const merged = mergeCookieHeaders(this.getCookies(), incoming);
    if (merged) this.write(merged, WEB_SESSION_STATUS.UNKNOWN);
  }
  set(cookies) {
    // 统一先归一化：整行头 / JSON 对象 / JSON 数组都转成 "name=value; …"。
    const normalized = normalizeCookieHeader(cookies);
    if (normalized.length > 16384 || /[\r\n\0]/.test(normalized)) throw new Error('Cookie 格式无效');
    if (!normalized.split(';').filter(s => s.trim()).every(s => /^\s*[\w-]+=[^;]*$/.test(s))) throw new Error('Cookie 格式无效');
    this.write(normalized, WEB_SESSION_STATUS.UNKNOWN);
  }
  markStatus(state) {
    if (!Object.values(WEB_SESSION_STATUS).includes(state)) throw new Error(`Unknown web session state: ${state}`);
    this.load();
    if (!this.cookies || state === WEB_SESSION_STATUS.MISSING) return;
    this.write(this.cookies, state);
  }
  clear() { this.write(null, WEB_SESSION_STATUS.MISSING); }
}
