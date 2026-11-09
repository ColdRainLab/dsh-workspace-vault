/**
 * Client-half unit tests for dsh-workspace-vault.
 *
 * The bundle runs in a fresh `node:vm` realm. A miniature hook-capable renderer
 * exercises the dialogs and the pin-session header button without a browser;
 * DOM decoration is asserted through its pure decisions plus the apply/dispose
 * resource contract (styles, MutationObserver, capture listener).
 *
 * Run with:
 *   node dsh-workspace-vault/tests/client.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = path.resolve(here, '..', 'lib', 'client.js');
const BUNDLE_SOURCE = readFileSync(BUNDLE_PATH, 'utf8');

const STATE_PATH = 'api/workspace-vault/state';
const PASSWORD_PATH = 'api/workspace-vault/password';
const UNLOCK_PATH = 'api/workspace-vault/unlock';
const CREATE_HIDDEN_PATH = 'api/workspace-vault/create-hidden';
const HIDDEN_PATH = 'api/workspace-vault/hidden';
const PIN_WORKSPACE_PATH = 'api/workspace-vault/pin-workspace';
const OVERLAY_SLOT = 'shell.overlay';
const HEADER_ACTIONS_SLOT = 'conversation.session.header.actions';

// ==== Tiny React ============================================================
let activeRuntime = null;

function depsChanged(previous, next) {
  if (previous === undefined) return true;
  if (!Array.isArray(previous) || !Array.isArray(next)) return previous !== next;
  if (previous.length !== next.length) return true;
  for (let index = 0; index < previous.length; index += 1) {
    if (!Object.is(previous[index], next[index])) return true;
  }
  return false;
}

class HookRuntime {
  constructor() {
    this.hooks = [];
    this.index = 0;
    this.pendingEffects = [];
    this.tree = null;
    this.rerender = null;
  }

  useState(initial) {
    const index = this.index;
    this.index += 1;
    if (this.hooks[index] === undefined) this.hooks[index] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
    const slot = this.hooks[index];
    const setState = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next;
      if (Object.is(value, slot.value)) return value;
      slot.value = value;
      if (this.rerender !== null) this.rerender();
      return value;
    };
    return [slot.value, setState];
  }

  useEffect(effect, deps) {
    const index = this.index;
    this.index += 1;
    if (this.hooks[index] === undefined) this.hooks[index] = { kind: 'effect', deps: undefined, cleanup: undefined };
    const slot = this.hooks[index];
    if (depsChanged(slot.deps, deps)) {
      slot.deps = deps;
      this.pendingEffects.push({ slot, effect });
    }
  }

  useRef(value) {
    const index = this.index;
    this.index += 1;
    if (this.hooks[index] === undefined) this.hooks[index] = { kind: 'ref', value: { current: value } };
    return this.hooks[index].value;
  }

  collectCleanup() {
    for (const slot of this.hooks) {
      if (slot !== undefined && typeof slot.cleanup === 'function') {
        slot.cleanup();
        slot.cleanup = undefined;
      }
    }
  }
}

function createReactStub() {
  return {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) {
      return { type, props: props === null || props === undefined ? {} : props, children };
    },
    useState(initial) { return activeRuntime.useState(initial); },
    useEffect(effect, deps) { activeRuntime.useEffect(effect, deps); },
    useRef(value) { return activeRuntime.useRef(value); },
  };
}

function mount(Component, props) {
  const runtime = new HookRuntime();
  activeRuntime = runtime;
  const renderOnce = () => {
    runtime.index = 0;
    runtime.pendingEffects = [];
    runtime.tree = Component(props);
    const effects = runtime.pendingEffects;
    runtime.pendingEffects = [];
    for (const { slot, effect } of effects) {
      if (typeof slot.cleanup === 'function') slot.cleanup();
      const cleanup = effect();
      slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    }
    return runtime.tree;
  };
  runtime.rerender = renderOnce;
  renderOnce();
  return {
    runtime,
    get tree() { return runtime.tree; },
    rerender: renderOnce,
    unmount() { runtime.collectCleanup(); },
  };
}

async function flush() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

/** Values returned from the vm realm carry its prototypes; compare as data. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepEqualCross(actual, expected, message) {
  assert.deepEqual(plain(actual), expected, message);
}

// ==== Tree helpers ==========================================================
function childrenOf(node) {
  return Array.isArray(node.children) ? node.children : [];
}

function walk(node, visit) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (typeof node !== 'object' || node.type === undefined) return;
  visit(node);
  for (const child of childrenOf(node)) walk(child, visit);
}

function findAll(tree, predicate) {
  const found = [];
  walk(tree, (node) => { if (predicate(node)) found.push(node); });
  return found;
}

function textOf(node) {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node !== 'object') return '';
  const children = childrenOf(node);
  if (children.length === 0 && node.props !== undefined && node.props.children !== undefined) return textOf(node.props.children);
  return children.map(textOf).join('');
}

function buttons(tree) {
  return findAll(tree, (node) => node.type === 'button');
}

function buttonWithExactText(tree, text) {
  const match = buttons(tree).find((node) => textOf(node).trim() === text);
  assert.ok(match !== undefined, `no button whose text is exactly ${JSON.stringify(text)}`);
  return match;
}

function buttonByLabel(tree, label) {
  const match = buttons(tree).find((node) => node.props !== undefined && node.props['aria-label'] === label);
  assert.ok(match !== undefined, `no button labelled ${JSON.stringify(label)}`);
  return match;
}

function click(node, event = {}) {
  const handler = node.props && node.props.onClick;
  assert.equal(typeof handler, 'function', 'expected a clickable element');
  return handler({ target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...event });
}

function inputById(tree, id) {
  const match = findAll(tree, (node) => node.type === 'input' && node.props.id === id)[0];
  assert.ok(match !== undefined, `input ${id} missing`);
  return match;
}

function typeInto(node, value) {
  assert.equal(typeof node.props.onChange, 'function');
  node.props.onChange({ target: { value } });
}

// ==== Environment fakes =====================================================
/** Minimal selector engine for the selectors the decorator uses. */
function matchesFakeSelector(element, selector) {
  if (element === null || element === undefined) return false;
  const raw = String(selector).trim();
  if (raw === '') return false;
  let match = raw.match(/^\[class\*="([^"]+)"\]$/);
  if (match !== null) return String(element.getAttribute('class') ?? '').indexOf(match[1]) !== -1;
  match = raw.match(/^\[([\w-]+)\*="([^"]*)"\]$/);
  if (match !== null) return String(element.getAttribute(match[1]) ?? '').indexOf(match[2]) !== -1;
  match = raw.match(/^\[([\w-]+)\^="([^"]*)"\]$/);
  if (match !== null) return String(element.getAttribute(match[1]) ?? '').indexOf(match[2]) === 0;
  match = raw.match(/^\[([\w-]+)="([^"]*)"\]$/);
  if (match !== null) return element.getAttribute(match[1]) === match[2];
  match = raw.match(/^\[([\w-]+)\]$/);
  if (match !== null) return element.getAttribute(match[1]) !== null;
  if (/^[a-zA-Z][\w-]*$/.test(raw)) return String(element.tagName).toLowerCase() === raw.toLowerCase();
  return false;
}

function fakeDescendants(root) {
  const found = [];
  const queue = [...(root.children ?? [])];
  while (queue.length > 0) {
    const child = queue.shift();
    found.push(child);
    if (Array.isArray(child.children)) queue.push(...child.children);
  }
  return found;
}

function fakeElement(tagName) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    attrs: {},
    textContent: '',
    innerHTML: '',
    className: '',
    parentNode: null,
    children: [],
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
    removeAttribute(name) { delete this.attrs[name]; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    insertBefore(child, reference) {
      child.parentNode = this;
      const index = reference === null || reference === undefined ? -1 : this.children.indexOf(reference);
      if (index === -1) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index !== -1) this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(selector) {
      const found = fakeDescendants(this).find((candidate) => matchesFakeSelector(candidate, selector));
      return found ?? null;
    },
    querySelectorAll(selector) {
      return fakeDescendants(this).filter((candidate) => matchesFakeSelector(candidate, selector));
    },
    contains(node) {
      let current = node;
      while (current !== null && current !== undefined) {
        if (current === this) return true;
        current = current.parentNode;
      }
      return false;
    },
    getBoundingClientRect() { return { left: 10, top: 20, right: 210, bottom: 40, width: 200, height: 20 }; },
    classList: { toggle() {} },
    get firstChild() { return this.children.length > 0 ? this.children[0] : null; },
    get nextSibling() {
      if (this.parentNode === null) return null;
      const index = this.parentNode.children.indexOf(this);
      return this.parentNode.children[index + 1] ?? null;
    },
  };
  return element;
}

function createDocument() {
  const document = {
    baseURI: 'http://127.0.0.1:42612/',
    listeners: [],
    head: fakeElement('head'),
    body: fakeElement('body'),
    sidebarRoot: null,
    addEventListener(type, handler, capture) { this.listeners.push({ type, handler, capture, active: true }); },
    removeEventListener(type, handler, capture) {
      const found = this.listeners.find((entry) => entry.type === type && entry.handler === handler && entry.capture === capture);
      if (found !== undefined) found.active = false;
    },
    createElement: fakeElement,
    querySelector(selector) {
      const raw = String(selector);
      if (raw.indexOf('style[data-plugin-css=') === 0) {
        return this.head.children.find((child) => child.attrs['data-plugin-css'] !== undefined) ?? null;
      }
      if (raw === '[data-slot="sidebar"]') return this.sidebarRoot ?? null;
      return null;
    },
    querySelectorAll() { return []; },
  };
  return document;
}

function createFakeCtx(options = {}) {
  const registrations = [];
  const cleanups = [];
  const localeRegisters = [];
  const calls = { pinned: [], unpinned: [], created: [], renamed: [], deleted: [], openWorkspace: [], openSession: [], clearMain: 0 };
  let workspacesSnapshot = options.workspacesSnapshot ?? {
    phase: 'ready',
    items: [
      { workspaceId: 'ws-1', title: '工作区一', sessionIds: ['s-1', 's-2'] },
      { workspaceId: 'ws-2', title: '工作区二', sessionIds: [] },
    ],
    pinnedSessionIds: [],
    archivedSessionIds: [],
  };
  let sessionsSnapshot = options.sessionsSnapshot ?? { phase: 'ready', ids: [], byId: {} };
  const localeService = {
    register(namespace, dictionaries) {
      localeRegisters.push({ namespace, dictionaries });
      return () => {};
    },
    bind() {
      return (key) => key;
    },
  };
  const workspacesService = {
    list: {
      getSnapshot() { return workspacesSnapshot; },
      subscribe() { return () => {}; },
    },
    async pinSession(sessionId) {
      calls.pinned.push(sessionId);
      if (options.pinFailure !== undefined) throw options.pinFailure;
    },
    async unpinSession(sessionId) { calls.unpinned.push(sessionId); },
    async create(input) {
      calls.created.push(input);
      if (options.createFailure !== undefined) throw options.createFailure;
      return { workspaceId: options.createdWorkspaceId ?? 'ws-new', title: '新工作区', path: input.path };
    },
    async rename(workspaceId, title) {
      calls.renamed.push({ workspaceId, title });
      if (options.renameFailure !== undefined) throw options.renameFailure;
      return { workspaceId, title };
    },
    async delete(workspaceId) {
      calls.deleted.push(workspaceId);
      if (options.deleteFailure !== undefined) throw options.deleteFailure;
    },
  };
  const sessionsService = {
    list: {
      getSnapshot() { return sessionsSnapshot; },
      subscribe() { return () => {}; },
    },
    refresh() {},
  };
  const uiWorkspaceService = {
    openWorkspace(workspaceId) { calls.openWorkspace.push(workspaceId); return Promise.resolve(); },
    openSession(sessionId) { calls.openSession.push(sessionId); },
    clearMain() { calls.clearMain += 1; },
  };
  const services = {
    locale: localeService,
    sessions: sessionsService,
    workspaces: options.withoutWorkspaces === true ? undefined : workspacesService,
    uiWorkspace: options.withoutUiWorkspace === true ? undefined : uiWorkspaceService,
  };
  const ctx = {
    slots: {
      inject(slotName, factory) {
        const dispose = factory();
        if (typeof dispose === 'function') cleanups.push(dispose);
        return dispose;
      },
      register(registrationOptions, component) {
        registrations.push({ name: registrationOptions.name, options: registrationOptions, component });
        return () => {};
      },
    },
    effect(effect) {
      const dispose = effect();
      if (typeof dispose === 'function') cleanups.push(dispose);
      return dispose;
    },
    get(name) { return services[name]; },
  };
  return {
    ctx,
    registrations,
    cleanups,
    localeRegisters,
    calls,
    services,
    setWorkspacesSnapshot(next) { workspacesSnapshot = next; },
    setSessionsSnapshot(next) { sessionsSnapshot = next; },
  };
}

function createT() {
  const table = {
    'setup.title': '设置主密码',
    'setup.intro': '说明',
    'setup.password': '新密码',
    'setup.passwordPlaceholder': '4–128 个字符',
    'setup.confirm': '确认密码',
    'setup.phone': '手机号（可选）',
    'setup.phonePlaceholder': '仅用于本地找回',
    'setup.phoneHint': '留空则无法找回',
    'setup.submit': '保存并进入',
    'unlock.title': '解锁保险库',
    'unlock.intro': '说明',
    'unlock.password': '主密码',
    'unlock.submit': '解锁',
    'unlock.forgot': '忘记密码？',
    'unlock.cancel': '取消',
    'recover.title': '找回主密码',
    'recover.intro': '说明',
    'recover.phone': '绑定手机号',
    'recover.password': '新密码',
    'recover.confirm': '确认新密码',
    'recover.submit': '重置并解锁',
    'recover.back': '返回解锁',
    'create.title': '新建隐藏工作区',
    'create.intro': '说明',
    'create.name': '名称',
    'create.namePlaceholder': '例如：私人',
    'create.submit': '创建',
    'create.creating': '正在创建…',
    'encrypt.title': '加密工作区',
    'encrypt.intro': '说明',
    'encrypt.password': '主密码',
    'encrypt.submit': '加密',
    'encrypt.target': '目标：{title}',
    'guard.hidden.title': '隐藏空间已上锁',
    'guard.hidden.body': '说明',
    'guard.unlock': '解锁',
    'guard.leave': '离开',
    'guard.note': '说明',
    'task.pin': '置顶当前任务',
    'task.unpin': '取消置顶',
    'row.pin': '置顶工作区',
    'row.unpin': '取消置顶',
    'row.encrypt': '加密工作区',
    'row.unlock': '解锁工作区',
    'row.decrypt': '取消加密',
    'row.hide': '移入隐藏空间',
    'row.unhide': '移出隐藏空间',
    'badge.pinned': '已置顶',
    'badge.encrypted': '已加密',
    'badge.hidden': '隐藏空间工作区',
    'menu.aria': '工作区菜单',
    'menu.rename': '重命名',
    'menu.delete': '删除工作区',
    'rename.title': '重命名工作区',
    'rename.label': '名称',
    'rename.submit': '保存',
    'rename.saving': '正在保存…',
    'delete.title': '删除工作区',
    'delete.intro': '将把「{title}」从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在「未分组」下。',
    'delete.submit': '删除',
    'delete.deleting': '正在删除…',
    'error.renameRequired': '请输入名称',
    'error.renameFailed': '重命名失败：{message}',
    'error.deleteFailed': '删除失败：{message}',
    'error.passwordRequired': '请输入密码',
    'error.passwordRule': '密码需为 4–128 个字符',
    'error.passwordMismatch': '两次输入的密码不一致',
    'error.phoneFormat': '手机号需为 6–20 位数字',
    'error.phoneRequired': '请输入手机号',
    'error.nameRequired': '请输入名称',
    'error.badPassword': '密码错误',
    'error.invalidPassword': '密码需为 4–128 个字符',
    'error.tokenInvalid': '解锁令牌已过期',
    'error.tokenRequired': '请先解锁',
    'error.noPhone': '未绑定手机号',
    'error.badPhone': '手机号不匹配',
    'error.alreadyConfigured': '已设置过主密码',
    'error.nameTaken': '名称已存在',
    'error.invalidName': '名称不合法',
    'error.io': '文件系统操作失败',
    'error.badRequest': '请求不合法',
    'error.unknownWorkspace': '工作区不存在',
    'error.generic': '操作失败：{message}',
    'error.serviceUnavailable': '服务不可用',
    'workspace.untitled': '未命名工作区',
  };
  return (key, params) => {
    const template = table[key] ?? key;
    if (params === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  };
}

// ==== Bundle loader =========================================================
function statePayload(overrides = {}) {
  return {
    ok: true,
    version: 1,
    hasPassword: true,
    phone: null,
    hiddenWorkspaceIds: [],
    encryptedWorkspaceIds: [],
    pinnedWorkspaceIds: [],
    hiddenRoot: 'C:\\Users\\test\\.dsh\\hidden-space',
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function loadBundle(options = {}) {
  const react = options.react ?? createReactStub();
  const document = options.document ?? createDocument();
  const observers = [];
  const timers = [];
  class MutationObserverStub {
    constructor(callback) {
      this.callback = callback;
      this.active = true;
      this.observed = false;
      observers.push(this);
    }
    observe() { this.observed = true; }
    disconnect() { this.active = false; }
  }
  const defaultFetch = async (url) => {
    const target = String(url);
    if (target.includes(STATE_PATH)) return jsonResponse(statePayload());
    return jsonResponse({ ok: true });
  };
  let registration = null;
  const windowListeners = [];
  const fakeWindow = {
    __ModuleLoader__: { load(captured) { registration = captured; } },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(type, handler, capture) { windowListeners.push({ type, handler, capture, active: true }); },
    removeEventListener(type, handler, capture) {
      const found = windowListeners.find((entry) => entry.type === type && entry.handler === handler && entry.capture === capture);
      if (found !== undefined) found.active = false;
    },
  };
  const sandbox = {
    window: fakeWindow,
    console,
    URL,
    JSON,
    Promise,
    Set,
    Map,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    Error,
    RegExp,
    Symbol,
    setTimeout(fn, ms) { timers.push({ fn, ms }); return { unref() {} }; },
    clearTimeout() {},
    navigator: { language: options.language ?? 'zh-CN' },
    location: options.location ?? { protocol: 'http:', href: 'http://127.0.0.1:42612/' },
    fetch: options.fetch ?? defaultFetch,
    document,
    MutationObserver: MutationObserverStub,
  };
  if (options.transport !== undefined) sandbox.__DSH_TRANSPORT__ = options.transport;
  vm.createContext(sandbox);
  vm.runInContext(BUNDLE_SOURCE, sandbox, { filename: 'dsh-workspace-vault/client.js' });
  assert.ok(registration !== null, 'bundle must call window.__ModuleLoader__.load');
  assert.equal(registration.id, 'dsh-workspace-vault');
  const require = (specifier) => {
    if (specifier === 'react') return react;
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') throw new Error('primitives unavailable in test');
    throw new Error('unexpected require: ' + specifier);
  };
  const plugin = registration.factory(require);
  return { sandbox, registration, plugin, document, observers, timers, windowListeners, fakeWindow };
}

// ==== Tests =================================================================
test('state parser normalizes the GET /state payload', () => {
  const { plugin } = loadBundle();
  const internal = plugin.__internal;
  const parsed = internal.parseStatePayload({
    ok: true,
    version: 1,
    hasPassword: true,
    phone: { masked: '138****8000' },
    hiddenWorkspaceIds: ['h-1', 'h-1', '', 7, 'h-2'],
    encryptedWorkspaceIds: ['e-1'],
    pinnedWorkspaceIds: ['p-2', 'p-1'],
    hiddenRoot: 'C:\\hidden',
    extra: 'kept-out',
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.hasPassword, true);
  deepEqualCross(parsed.phone, { masked: '138****8000' });
  deepEqualCross(parsed.hiddenWorkspaceIds, ['h-1', 'h-2']);
  deepEqualCross(parsed.encryptedWorkspaceIds, ['e-1']);
  deepEqualCross(parsed.pinnedWorkspaceIds, ['p-2', 'p-1']);
  assert.equal(parsed.hiddenRoot, 'C:\\hidden');

  const broken = internal.parseStatePayload(null);
  assert.equal(broken.ok, false);
  assert.equal(internal.parseStatePayload({ ok: false, code: 'io-error' }).ok, false);
  assert.equal(internal.parseStatePayload({ ok: true }).hasPassword, false);
  assert.equal(internal.parseStatePayload({ ok: true }).phone, null);
});

test('visibility rules cover the four sidebar modes', () => {
  const { plugin } = loadBundle();
  const internal = plugin.__internal;
  const sessionMap = { 's-hidden': 'h', 's-enc': 'e', 's-normal': 'n' };
  const base = {
    hiddenMode: false,
    hiddenIds: ['h'],
    encryptedIds: ['e'],
    unlockedIds: [],
    sessionMap,
  };

  // normal mode: hidden rows disappear, encrypted rows stay but their sessions hide
  assert.equal(internal.visibilityOfRow('workspace:h', base).visible, false);
  assert.equal(internal.visibilityOfRow('workspace:n', base).visible, true);
  assert.equal(internal.visibilityOfRow('workspace:e', base).visible, true);
  assert.equal(internal.visibilityOfRow('workspace:e', base).locked, true);
  assert.equal(internal.visibilityOfRow('session:s-hidden', base).visible, false);
  assert.equal(internal.visibilityOfRow('session:s-enc', base).visible, false);
  assert.equal(internal.visibilityOfRow('session:s-normal', base).visible, true);
  assert.equal(internal.visibilityOfRow('overflow:e', base).visible, false);
  assert.equal(internal.visibilityOfRow('overflow:h', base).visible, false);
  assert.equal(internal.visibilityOfRow('empty', base).visible, true);
  assert.equal(internal.visibilityOfRow('workspace:', base).visible, true);

  // unlocking one workspace reveals only its rows
  const unlocked = { ...base, unlockedIds: ['e'] };
  assert.equal(internal.visibilityOfRow('session:s-enc', unlocked).visible, true);
  assert.equal(internal.visibilityOfRow('overflow:e', unlocked).visible, true);
  assert.equal(internal.visibilityOfRow('session:s-enc', unlocked).locked, false);

  // hidden mode: only hidden content is visible, ungrouped rows disappear
  const hiddenMode = { ...base, hiddenMode: true };
  assert.equal(internal.visibilityOfRow('workspace:h', hiddenMode).visible, true);
  assert.equal(internal.visibilityOfRow('workspace:n', hiddenMode).visible, false);
  assert.equal(internal.visibilityOfRow('session:s-hidden', hiddenMode).visible, true);
  assert.equal(internal.visibilityOfRow('session:s-normal', hiddenMode).visible, false);
  assert.equal(internal.visibilityOfRow('workspace:', hiddenMode).visible, false);
  assert.equal(internal.visibilityOfRow('overflow:h', hiddenMode).visible, true);

  // hidden mode never bypasses a workspace lock
  const hiddenLocked = { hiddenMode: true, hiddenIds: ['h'], encryptedIds: ['h'], unlockedIds: [], sessionMap };
  assert.equal(internal.visibilityOfRow('workspace:h', hiddenLocked).visible, true);
  assert.equal(internal.visibilityOfRow('session:s-hidden', hiddenLocked).visible, false);
  assert.equal(internal.visibilityOfRow('overflow:h', hiddenLocked).visible, false);
});

test('row keys, session map and main-session derivation follow native structures', () => {
  const { plugin } = loadBundle();
  const internal = plugin.__internal;
  deepEqualCross(internal.parseRowKey('workspace:ws-1'), { kind: 'workspace', id: 'ws-1' });
  deepEqualCross(internal.parseRowKey('workspace:'), { kind: 'workspace', id: '' });
  deepEqualCross(internal.parseRowKey('session:s-1'), { kind: 'session', id: 's-1' });
  deepEqualCross(internal.parseRowKey('overflow:ws-1'), { kind: 'overflow', id: 'ws-1' });
  assert.equal(internal.parseRowKey('empty'), null);
  assert.equal(internal.parseRowKey(undefined), null);

  const map = internal.sessionWorkspaceMap({
    items: [
      { workspaceId: 'ws-1', sessionIds: ['s-1', 's-2'] },
      { workspaceId: 'ws-2', sessionIds: ['s-3'] },
      { workspaceId: '', sessionIds: ['s-ignored'] },
    ],
  });
  deepEqualCross(map, { 's-1': 'ws-1', 's-2': 'ws-1', 's-3': 'ws-2' });

  const snapshot = {
    ids: ['s-0', 's-1'],
    byId: {
      's-0': { id: 's-0', retainedBy: { mainView: 0 } },
      's-1': { id: 's-1', retainedBy: { mainView: 1 } },
    },
  };
  assert.equal(internal.mainSessionIdOf(snapshot), 's-1');
  assert.equal(internal.mainSessionIdOf({ ids: [], byId: {} }), undefined);
  assert.equal(internal.mainSessionIdOf(null), undefined);
  assert.equal(internal.workspaceTitleOf('C:\\Users\\me\\proj\\'), 'proj');
  assert.equal(internal.workspaceTitleOf('/home/me/proj'), 'proj');
});

test('state updates: hidden / encrypted / pinned sets are replaced from responses', () => {
  const { plugin } = loadBundle();
  const internal = plugin.__internal;
  const parsed = internal.parseStatePayload(statePayload({ hiddenWorkspaceIds: ['h-1'], encryptedWorkspaceIds: ['e-1'], pinnedWorkspaceIds: ['p-1'] }));
  assert.equal(internal.applyStatePayload(parsed), true);
  deepEqualCross(internal.state.hiddenIds, ['h-1']);
  deepEqualCross(internal.state.encryptedIds, ['e-1']);
  deepEqualCross(internal.state.pinnedIds, ['p-1']);

  internal.applyHiddenResult({ ok: true, hiddenWorkspaceIds: ['h-2', 'h-1'] });
  deepEqualCross(internal.state.hiddenIds, ['h-2', 'h-1']);
  internal.applyHiddenResult(null, { workspaceId: 'h-3', hidden: true });
  deepEqualCross(internal.state.hiddenIds, ['h-2', 'h-1', 'h-3']);
  internal.applyHiddenResult(null, { workspaceId: 'h-2', hidden: false });
  deepEqualCross(internal.state.hiddenIds, ['h-1', 'h-3']);

  internal.applyEncryptedResult({ ok: true, encryptedWorkspaceIds: ['e-2'] });
  deepEqualCross(internal.state.encryptedIds, ['e-2']);
  internal.applyEncryptedResult(null, { workspaceId: 'e-2', encrypted: false });
  deepEqualCross(internal.state.encryptedIds, []);

  internal.applyPinnedResult({ ok: true, pinnedWorkspaceIds: ['p-1', 'p-2'] });
  deepEqualCross(internal.state.pinnedIds, ['p-1', 'p-2']);

  const future = Date.now() + 60_000;
  internal.applyUnlockResult({ token: 'tok-1', expiresAt: future });
  assert.equal(internal.state.token, 'tok-1');
  assert.equal(internal.isTokenValid(), true);
  assert.equal(internal.isTokenValid(future + 1), false);
  internal.applyUnlockResult({ token: 'tok-2' });
  assert.equal(internal.isTokenValid(), true);
  internal.resetPageSecrets();
  assert.equal(internal.state.token, null);
  assert.equal(internal.state.hiddenMode, false);
  deepEqualCross(internal.state.unlockedIds, []);
});

test('main-content guard flags hidden and locked current workspaces only', () => {
  const { plugin } = loadBundle();
  const internal = plugin.__internal;
  const base = {
    hiddenMode: false,
    hiddenIds: ['h'],
    encryptedIds: ['e'],
    unlockedIds: [],
    sessionMap: { 's-hidden': 'h', 's-enc': 'e', 's-normal': 'n' },
  };
  deepEqualCross(internal.mainGuardDecision({ ...base, currentSessionId: 's-hidden' }), { kind: 'hidden', workspaceId: 'h' });
  deepEqualCross(internal.mainGuardDecision({ ...base, currentSessionId: 's-enc' }), { kind: 'encrypted', workspaceId: 'e' });
  assert.equal(internal.mainGuardDecision({ ...base, unlockedIds: ['e'], currentSessionId: 's-enc' }), null);
  assert.equal(internal.mainGuardDecision({ ...base, currentSessionId: 's-normal' }), null);
  assert.equal(internal.mainGuardDecision({ ...base, currentSessionId: undefined }), null);
  assert.equal(internal.mainGuardDecision({ ...base, hiddenMode: true, currentSessionId: 's-hidden' }), null);
});

test('apply claims the slots, installs styles, and dispose removes every owned resource', async () => {
  const document = createDocument();
  const { plugin, observers, windowListeners } = loadBundle({ document });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();

  const slotNames = fake.registrations.map((entry) => entry.options.name);
  assert.equal(slotNames.filter((name) => name === OVERLAY_SLOT).length, 3);
  assert.ok(slotNames.includes(HEADER_ACTIONS_SLOT));
  assert.ok(fake.registrations.some((entry) => entry.options.id === 'dsh-workspace-vault.pin-session'));
  assert.ok(fake.registrations.some((entry) => entry.options.id === 'dsh-workspace-vault.workspace-menu'));
  assert.equal(fake.localeRegisters[0].namespace, 'dsh-workspace-vault');
  assert.ok(typeof fake.localeRegisters[0].dictionaries.zh['hidden.toggle.enter'] === 'string');
  assert.ok(typeof fake.localeRegisters[0].dictionaries.en['hidden.toggle.enter'] === 'string');
  assert.ok(typeof fake.localeRegisters[0].dictionaries.zh['menu.rename'] === 'string');

  assert.equal(document.head.children.filter((child) => child.attrs['data-plugin-css'] !== undefined).length, 1);
  assert.equal(observers.length, 1);
  assert.equal(observers[0].active, true);
  assert.equal(observers[0].observed, true);
  const capture = document.listeners.find((entry) => entry.type === 'click' && entry.capture === true);
  assert.ok(capture !== undefined, 'workspace row capture listener must be installed');
  const addGuard = windowListeners.find((entry) => entry.type === 'click' && entry.active === true);
  assert.ok(addGuard !== undefined, 'hidden-mode add guard must listen on window capture');

  for (const cleanup of fake.cleanups) cleanup();
  assert.equal(observers[0].active, false);
  assert.equal(document.head.children.length, 0);
  assert.equal(capture.active, false);
  assert.equal(addGuard.active, false);
  assert.equal(plugin.__internal.state.loaded, true);
});

test('password setup dialog posts setup then unlock and enters the hidden space', async () => {
  const calls = [];
  const fetchMock = async (url, init) => {
    const target = String(url);
    const body = init !== undefined && init.body !== undefined ? JSON.parse(init.body) : null;
    calls.push({ url: target, method: init !== undefined ? init.method : 'GET', body });
    if (target.includes(STATE_PATH)) return jsonResponse(statePayload({ hasPassword: false }));
    if (target.includes(PASSWORD_PATH)) return jsonResponse({ ok: true, hasPassword: true, phone: { masked: '138****8000' } });
    if (target.includes(UNLOCK_PATH)) return jsonResponse({ ok: true, token: 'tok-setup', expiresAt: Date.now() + 1_800_000 });
    return jsonResponse({ ok: true });
  };
  const { plugin } = loadBundle({ document: createDocument(), fetch: fetchMock });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();

  plugin.__internal.openSetupDialog();
  const view = mount(plugin.__internal.PasswordSetupForm, { t: createT() });
  typeInto(inputById(view.tree, 'dsh-workspace-vault-setup-password'), 'secret12');
  typeInto(inputById(view.tree, 'dsh-workspace-vault-setup-confirm'), 'secret12');
  typeInto(inputById(view.tree, 'dsh-workspace-vault-setup-phone'), '138 0013 8000');
  click(buttonWithExactText(view.tree, '保存并进入'));
  await flush();

  const setupCall = calls.find((call) => call.method === 'POST' && call.url.endsWith(PASSWORD_PATH));
  assert.ok(setupCall !== undefined, 'setup POST missing');
  deepEqualCross(setupCall.body, { action: 'setup', password: 'secret12', phone: '13800138000' });
  const unlockCall = calls.find((call) => call.method === 'POST' && call.url.endsWith(UNLOCK_PATH));
  assert.ok(unlockCall !== undefined, 'automatic unlock POST missing');
  deepEqualCross(unlockCall.body, { password: 'secret12' });

  assert.equal(plugin.__internal.state.hasPassword, true);
  assert.equal(plugin.__internal.state.hiddenMode, true);
  assert.equal(plugin.__internal.state.token, 'tok-setup');
  assert.equal(plugin.__internal.store.kind, null);
});

test('setup dialog rejects mismatched passwords locally without a request', async () => {
  const calls = [];
  const fetchMock = async (url, init) => {
    calls.push({ url: String(url), method: init !== undefined ? init.method : 'GET' });
    if (String(url).includes(STATE_PATH)) return jsonResponse(statePayload({ hasPassword: false }));
    return jsonResponse({ ok: true });
  };
  const { plugin } = loadBundle({ document: createDocument(), fetch: fetchMock });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();
  plugin.__internal.openSetupDialog();
  const view = mount(plugin.__internal.PasswordSetupForm, { t: createT() });
  typeInto(inputById(view.tree, 'dsh-workspace-vault-setup-password'), 'secret12');
  typeInto(inputById(view.tree, 'dsh-workspace-vault-setup-confirm'), 'secret13');
  click(buttonWithExactText(view.tree, '保存并进入'));
  await flush();
  const posts = calls.filter((call) => call.method === 'POST');
  assert.equal(posts.length, 0);
  const alert = findAll(view.tree, (node) => node.props !== undefined && node.props.role === 'alert')[0];
  assert.ok(alert !== undefined, 'local validation message must render');
  assert.equal(textOf(alert), '两次输入的密码不一致');
});

test('unlock dialog enters hidden mode; leaving navigates to a visible workspace first', async () => {
  const fetchMock = async (url) => {
    const target = String(url);
    if (target.includes(STATE_PATH)) return jsonResponse(statePayload({ hiddenWorkspaceIds: ['ws-hidden'] }));
    if (target.includes(UNLOCK_PATH)) return jsonResponse({ ok: true, token: 'tok-hidden', expiresAt: Date.now() + 1_800_000 });
    return jsonResponse({ ok: true });
  };
  const workspacesSnapshot = {
    phase: 'ready',
    items: [
      { workspaceId: 'ws-hidden', title: 'Hidden', sessionIds: ['s-hidden'] },
      { workspaceId: 'ws-visible', title: 'Visible', sessionIds: [] },
    ],
    pinnedSessionIds: [],
    archivedSessionIds: [],
  };
  const sessionsSnapshot = {
    phase: 'ready',
    ids: ['s-hidden'],
    byId: { 's-hidden': { id: 's-hidden', retainedBy: { mainView: 1 } } },
  };
  const { plugin } = loadBundle({ document: createDocument(), fetch: fetchMock });
  const fake = createFakeCtx({ workspacesSnapshot, sessionsSnapshot });
  plugin.apply(fake.ctx);
  await flush();

  plugin.__internal.openUnlockDialog({ purpose: 'hidden' });
  const view = mount(plugin.__internal.UnlockForm, { t: createT() });
  typeInto(inputById(view.tree, 'dsh-workspace-vault-unlock-password'), 'secret12');
  click(buttonWithExactText(view.tree, '解锁'));
  await flush();
  assert.equal(plugin.__internal.state.hiddenMode, true);
  assert.equal(plugin.__internal.state.token, 'tok-hidden');

  await plugin.__internal.leaveHiddenMode();
  await flush();
  assert.equal(plugin.__internal.state.hiddenMode, false);
  deepEqualCross(fake.calls.openWorkspace, ['ws-visible']);
});

test('task pin button reads useWorkspaces and calls pinSession / unpinSession', async () => {
  const { plugin } = loadBundle({ document: createDocument() });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();

  const pinnedSeat = (selector) => selector({ pinnedSessionIds: ['s-1'] });
  const pinnedView = mount(plugin.__internal.PinSessionButton, { sessionId: 's-1', t: createT(), useWorkspaces: pinnedSeat });
  click(buttonByLabel(pinnedView.tree, '取消置顶'));
  await flush();
  deepEqualCross(fake.calls.unpinned, ['s-1']);

  const looseView = mount(plugin.__internal.PinSessionButton, {
    sessionId: 's-2',
    t: createT(),
    useWorkspaces: (selector) => selector({ pinnedSessionIds: ['s-1'] }),
  });
  click(buttonByLabel(looseView.tree, '置顶当前任务'));
  await flush();
  deepEqualCross(fake.calls.pinned, ['s-2']);
});

test('encrypted-row capture opens the unlock dialog instead of the native toggle', async () => {
  const document = createDocument();
  const fetchMock = async (url) => {
    const target = String(url);
    if (target.includes(STATE_PATH)) return jsonResponse(statePayload({ encryptedWorkspaceIds: ['ws-enc'] }));
    return jsonResponse({ ok: true });
  };
  const workspacesSnapshot = {
    phase: 'ready',
    items: [{ workspaceId: 'ws-enc', title: 'Locked', sessionIds: [] }],
    pinnedSessionIds: [],
    archivedSessionIds: [],
  };
  const { plugin } = loadBundle({ document, fetch: fetchMock });
  const fake = createFakeCtx({ workspacesSnapshot });
  plugin.apply(fake.ctx);
  await flush();

  const capture = document.listeners.find((entry) => entry.type === 'click' && entry.capture === true);
  assert.ok(capture !== undefined, 'capture listener missing');

  const row = fakeElement('div');
  row.setAttribute('data-row-key', 'workspace:ws-enc');
  const makeEvent = () => ({
    target: row,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  });

  const lockedEvent = makeEvent();
  capture.handler(lockedEvent);
  assert.equal(lockedEvent.prevented, true);
  assert.equal(lockedEvent.stopped, true);
  assert.equal(plugin.__internal.store.kind, 'unlock');
  assert.equal(plugin.__internal.store.workspaceId, 'ws-enc');
  assert.equal(plugin.__internal.store.purpose, 'workspace');

  // Once that workspace is unlocked for this page the native row toggle works again.
  plugin.__internal.state.unlockedIds = ['ws-enc'];
  const unlockedEvent = makeEvent();
  capture.handler(unlockedEvent);
  assert.equal(unlockedEvent.prevented, false);
  assert.equal(unlockedEvent.stopped, false);
});

test('create-hidden posts create-hidden then hidden and records the workspace', async () => {
  const calls = [];
  const fetchMock = async (url, init) => {
    const target = String(url);
    const body = init !== undefined && init.body !== undefined ? JSON.parse(init.body) : null;
    calls.push({ url: target, method: init !== undefined ? init.method : 'GET', body });
    if (target.includes(STATE_PATH)) return jsonResponse(statePayload());
    if (target.includes(CREATE_HIDDEN_PATH)) return jsonResponse({ ok: true, path: 'C:\\Users\\test\\.dsh\\hidden-space\\Private', name: 'Private' });
    if (target.includes(HIDDEN_PATH)) return jsonResponse({ ok: true, hiddenWorkspaceIds: ['ws-new'] });
    return jsonResponse({ ok: true });
  };
  const { plugin } = loadBundle({ document: createDocument(), fetch: fetchMock });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();
  plugin.__internal.applyUnlockResult({ token: 'tok-hidden', expiresAt: Date.now() + 1_800_000 });
  plugin.__internal.openCreateHiddenDialog();

  const view = mount(plugin.__internal.CreateHiddenForm, { t: createT() });
  typeInto(inputById(view.tree, 'dsh-workspace-vault-create-name'), 'Private');
  click(buttonWithExactText(view.tree, '创建'));
  await flush();

  deepEqualCross(fake.calls.created, [{ path: 'C:\\Users\\test\\.dsh\\hidden-space\\Private' }]);
  const createCall = calls.find((call) => call.method === 'POST' && call.url.endsWith(CREATE_HIDDEN_PATH));
  assert.ok(createCall !== undefined, 'create-hidden POST missing');
  deepEqualCross(createCall.body, { token: 'tok-hidden', name: 'Private' });
  const hiddenCall = calls.find((call) => call.method === 'POST' && call.url.endsWith(HIDDEN_PATH));
  assert.ok(hiddenCall !== undefined, 'hidden POST missing');
  deepEqualCross(hiddenCall.body, { token: 'tok-hidden', workspaceId: 'ws-new', hidden: true });
  deepEqualCross(plugin.__internal.state.hiddenIds, ['ws-new']);
  assert.equal(plugin.__internal.store.kind, null);
});

// ==== task-8 regressions ====================================================
function buildSidebar(header) {
  const root = fakeElement('div');
  const list = fakeElement('div');
  list.setAttribute('class', 'GAkraW_list');
  const row = fakeElement('div');
  row.setAttribute('data-row-key', 'workspace:ws-1');
  row.setAttribute('class', 'wnFoaW_projectRow');
  const actions = fakeElement('span');
  actions.setAttribute('class', 'wnFoaW_rowActions');
  const nativeMenu = fakeElement('button');
  nativeMenu.setAttribute('class', 'wnFoaW_iconButton');
  nativeMenu.setAttribute('aria-label', '工作区操作');
  actions.appendChild(nativeMenu);
  row.appendChild(actions);
  const title = fakeElement('span');
  title.setAttribute('class', 'wnFoaW_title');
  title.textContent = '工作区一';
  row.appendChild(title);
  list.appendChild(row);
  root.appendChild(header);
  root.appendChild(list);
  return { root, list, row, actions, nativeMenu };
}

test('hidden-space shield sits before searchSlot, not inside headerActions', async () => {
  const document = createDocument();
  const { plugin } = loadBundle({ document });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();

  const header = fakeElement('div');
  header.setAttribute('class', 'GAkraW_sectionHeader');
  const label = fakeElement('span');
  label.setAttribute('class', 'GAkraW_sectionLabel');
  const searchSlot = fakeElement('div');
  searchSlot.setAttribute('class', 'GAkraW_searchSlot');
  const searchButton = fakeElement('button');
  searchButton.setAttribute('aria-label', '搜索会话');
  searchSlot.appendChild(searchButton);
  const headerActions = fakeElement('span');
  headerActions.setAttribute('class', 'GAkraW_headerActions');
  const viewButton = fakeElement('button');
  viewButton.setAttribute('aria-label', '视图选项');
  headerActions.appendChild(viewButton);
  const addButton = fakeElement('button');
  addButton.setAttribute('aria-label', '添加工作区');
  headerActions.appendChild(addButton);
  header.appendChild(label);
  header.appendChild(searchSlot);
  header.appendChild(headerActions);
  const built = buildSidebar(header);
  document.sidebarRoot = built.root;

  plugin.__internal.ensureNow();
  const toggle = header.querySelector('[data-dsh-workspace-vault="hidden-space-toggle"]');
  assert.ok(toggle !== null, 'shield button missing');
  const order = header.children.map((child) => {
    if (child === label) return 'label';
    if (child === toggle) return 'toggle';
    if (child === searchSlot) return 'search';
    if (child === headerActions) return 'actions';
    return 'other';
  });
  deepEqualCross(order, ['label', 'toggle', 'search', 'actions']);
  assert.equal(headerActions.children.includes(toggle), false);
  assert.equal(headerActions.children.includes(addButton), true);
  assert.equal(headerActions.children.includes(viewButton), true);

  // Idempotent: another decoration pass keeps exactly one shield.
  plugin.__internal.ensureNow();
  assert.equal(header.querySelectorAll('[data-dsh-workspace-vault="hidden-space-toggle"]').length, 1);

  // Rail mode without a search slot: the shield becomes the first header child.
  const railHeader = fakeElement('div');
  railHeader.setAttribute('class', 'GAkraW_sectionHeader');
  const railActions = fakeElement('span');
  railActions.setAttribute('class', 'GAkraW_headerActions');
  railHeader.appendChild(railActions);
  plugin.__internal.ensureToggle(railHeader);
  const railToggle = railHeader.querySelector('[data-dsh-workspace-vault="hidden-space-toggle"]');
  assert.ok(railToggle !== null);
  assert.equal(railHeader.firstChild, railToggle);
});

test('pinned rows carry the highlight attribute while pin/lock/hidden row buttons stay out', async () => {
  const document = createDocument();
  const { plugin } = loadBundle({ document });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();
  plugin.__internal.applyStatePayload(plugin.__internal.parseStatePayload(statePayload({
    pinnedWorkspaceIds: ['ws-1'],
    encryptedWorkspaceIds: ['ws-1'],
    hiddenWorkspaceIds: ['ws-1'],
  })));

  const header = fakeElement('div');
  header.setAttribute('class', 'GAkraW_sectionHeader');
  const searchSlot = fakeElement('div');
  searchSlot.setAttribute('class', 'GAkraW_searchSlot');
  header.appendChild(searchSlot);
  const headerActions = fakeElement('span');
  headerActions.setAttribute('class', 'GAkraW_headerActions');
  header.appendChild(headerActions);
  const built = buildSidebar(header);
  document.sidebarRoot = built.root;
  plugin.__internal.ensureWorkspaceRow(built.row);

  const row = built.row;
  assert.equal(row.getAttribute('data-dsh-workspace-vault-pinned'), '1');
  // Pin now lives in the "…" menu; no standalone row buttons remain.
  assert.equal(row.querySelector('[data-dsh-workspace-vault="pin"]'), null);
  assert.equal(row.querySelector('[data-dsh-workspace-vault="lock"]'), null);
  assert.equal(row.querySelector('[data-dsh-workspace-vault="hidden-toggle"]'), null);
  const pinBadge = row.querySelector('[data-dsh-workspace-vault="pin-badge"]');
  assert.ok(pinBadge !== null);
  assert.ok(pinBadge.innerHTML.indexOf('<svg') !== -1);
  assert.ok(row.querySelector('[data-dsh-workspace-vault="lock-badge"]') !== null);
  assert.ok(row.querySelector('[data-dsh-workspace-vault="hidden-badge"]') !== null);
  assert.equal(plugin.__internal.findNativeRowMenuButton(row), built.nativeMenu);

  // Unpinning removes the highlight and the badge, still leaving no row pin button.
  plugin.__internal.applyPinnedResult({ ok: true, pinnedWorkspaceIds: [] });
  plugin.__internal.ensureWorkspaceRow(row);
  assert.equal(row.getAttribute('data-dsh-workspace-vault-pinned'), null);
  assert.equal(row.querySelector('[data-dsh-workspace-vault="pin"]'), null);
  assert.equal(row.querySelector('[data-dsh-workspace-vault="pin-badge"]'), null);

  // A freshly created workspace row without rowActions is decorated on the next pass.
  const freshRow = fakeElement('div');
  freshRow.setAttribute('data-row-key', 'workspace:ws-new');
  built.list.appendChild(freshRow);
  plugin.__internal.ensureNow();
  assert.equal(freshRow.querySelector('[data-dsh-workspace-vault="pin"]'), null);
  const freshActions = fakeElement('span');
  freshActions.setAttribute('class', 'wnFoaW_rowActions');
  freshRow.appendChild(freshActions);
  plugin.__internal.ensureNow();
  assert.equal(freshRow.querySelector('[data-dsh-workspace-vault="pin"]'), null);
  assert.equal(freshRow.querySelector('[data-dsh-workspace-vault="pin-badge"]'), null);
});

test('row capture replaces the native "…" menu and keeps pin clicks working on locked rows', async () => {
  const document = createDocument();
  const { plugin } = loadBundle({ document });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();
  plugin.__internal.applyStatePayload(plugin.__internal.parseStatePayload(statePayload({ encryptedWorkspaceIds: ['ws-1'] })));

  const row = fakeElement('div');
  row.setAttribute('data-row-key', 'workspace:ws-1');
  const actions = fakeElement('span');
  actions.setAttribute('class', 'wnFoaW_rowActions');
  row.appendChild(actions);
  const nativeMenu = fakeElement('button');
  actions.appendChild(nativeMenu);
  const ourPin = fakeElement('button');
  ourPin.setAttribute('data-dsh-workspace-vault', 'pin');
  actions.appendChild(ourPin);
  const plain = fakeElement('span');
  row.appendChild(plain);

  const makeEvent = (target) => ({
    target,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  });

  const menuEvent = makeEvent(nativeMenu);
  plugin.__internal.handleRowClickCapture(menuEvent);
  assert.equal(menuEvent.prevented, true);
  assert.equal(menuEvent.stopped, true);
  deepEqualCross(plugin.__internal.store.menu, { workspaceId: 'ws-1', x: 216, y: 16, title: '工作区一' });
  assert.equal(plugin.__internal.store.kind, null);

  plugin.__internal.closeWorkspaceMenu();
  const pinEvent = makeEvent(ourPin);
  plugin.__internal.handleRowClickCapture(pinEvent);
  assert.equal(pinEvent.prevented, false);
  assert.equal(pinEvent.stopped, false);
  assert.equal(plugin.__internal.store.kind, null);

  const rowEvent = makeEvent(plain);
  plugin.__internal.handleRowClickCapture(rowEvent);
  assert.equal(rowEvent.prevented, true);
  assert.equal(plugin.__internal.store.kind, 'unlock');
});

test('workspace menu items drive pin/rename/delete, and Esc closes the menu', async () => {
  const document = createDocument();
  const calls = [];
  const fetchMock = async (url, init) => {
    const target = String(url);
    const body = init !== undefined && init.body !== undefined ? JSON.parse(init.body) : null;
    calls.push({ url: target, method: init !== undefined ? init.method : 'GET', body });
    if (target.includes(STATE_PATH)) return jsonResponse(statePayload());
    if (target.includes(PIN_WORKSPACE_PATH)) return jsonResponse({ ok: true, pinnedWorkspaceIds: [] });
    return jsonResponse({ ok: true });
  };
  const { plugin } = loadBundle({ document, fetch: fetchMock });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();
  plugin.__internal.applyStatePayload(plugin.__internal.parseStatePayload(statePayload({
    pinnedWorkspaceIds: ['ws-1'],
    encryptedWorkspaceIds: ['ws-1'],
    hiddenWorkspaceIds: ['ws-1'],
  })));

  const items = plugin.__internal.workspaceMenuItems('ws-1');
  const labels = items.filter((item) => item.separator !== true).map((item) => item.label);
  deepEqualCross(labels, ['取消置顶', '解锁工作区', '移出隐藏空间', '重命名', '删除工作区']);
  const pinItem = items.find((item) => item.id === 'pin');
  assert.equal(typeof pinItem.icon, 'string');
  assert.ok(pinItem.icon.indexOf('<svg') !== -1);
  assert.equal(items.find((item) => item.id === 'delete').danger, true);
  assert.equal(items.find((item) => item.id === 'rename').danger, false);

  plugin.__internal.openWorkspaceMenu('ws-1', { x: 20, y: 24, title: '工作区一' });
  const view = mount(plugin.__internal.WorkspaceMenuOverlay, { t: createT() });
  assert.equal(findAll(view.tree, (node) => node.props !== undefined && node.props.role === 'menu').length, 1);
  click(buttonByLabel(view.tree, '取消置顶'));
  await flush();
  const pinCall = calls.find((call) => call.method === 'POST' && call.url.endsWith(PIN_WORKSPACE_PATH));
  assert.ok(pinCall !== undefined, 'pin-workspace POST missing');
  deepEqualCross(pinCall.body, { workspaceId: 'ws-1', pinned: false });
  assert.equal(plugin.__internal.store.menu, null);

  plugin.__internal.openWorkspaceMenu('ws-1', { x: 20, y: 24, title: '工作区一' });
  const renameView = mount(plugin.__internal.WorkspaceMenuOverlay, { t: createT() });
  click(buttonByLabel(renameView.tree, '重命名'));
  assert.equal(plugin.__internal.store.kind, 'rename');
  assert.equal(plugin.__internal.store.menu, null);

  plugin.__internal.closeDialog();
  plugin.__internal.openWorkspaceMenu('ws-1', { x: 20, y: 24, title: '工作区一' });
  const escView = mount(plugin.__internal.WorkspaceMenuOverlay, { t: createT() });
  const keyListener = document.listeners.filter((entry) => entry.type === 'keydown' && entry.active === true).pop();
  assert.ok(keyListener !== undefined, 'menu key listener missing');
  keyListener.handler({ key: 'Escape', preventDefault() {} });
  assert.equal(plugin.__internal.store.menu, null);
  assert.equal(escView.tree, null);
});

test('rename dialog prefills the title and calls workspaces.rename; failures stay inline', async () => {
  const { plugin } = loadBundle({ document: createDocument() });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();
  plugin.__internal.openRenameDialog('ws-1');
  const view = mount(plugin.__internal.RenameWorkspaceForm, { t: createT() });
  const input = inputById(view.tree, 'dsh-workspace-vault-rename-title');
  assert.equal(input.props.value, '工作区一');
  typeInto(input, '  新名字  ');
  click(buttonWithExactText(view.tree, '保存'));
  await flush();
  deepEqualCross(fake.calls.renamed, [{ workspaceId: 'ws-1', title: '新名字' }]);
  assert.equal(plugin.__internal.store.kind, null);

  const failing = createFakeCtx({ renameFailure: new Error('rename broke') });
  const failingBundle = loadBundle({ document: createDocument() });
  failingBundle.plugin.apply(failing.ctx);
  await flush();
  failingBundle.plugin.__internal.openRenameDialog('ws-1');
  const failingView = mount(failingBundle.plugin.__internal.RenameWorkspaceForm, { t: createT() });
  typeInto(inputById(failingView.tree, 'dsh-workspace-vault-rename-title'), '另一个名字');
  click(buttonWithExactText(failingView.tree, '保存'));
  await flush();
  const alert = findAll(failingView.tree, (node) => node.props !== undefined && node.props.role === 'alert')[0];
  assert.ok(alert !== undefined, 'rename failure must render inline');
  assert.ok(textOf(alert).includes('rename broke'));
  assert.equal(failingBundle.plugin.__internal.store.kind, 'rename');
});

test('delete dialog states folder/session retention and calls workspaces.delete', async () => {
  const { plugin } = loadBundle({ document: createDocument() });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();
  plugin.__internal.openDeleteDialog('ws-1');
  const view = mount(plugin.__internal.DeleteWorkspaceForm, { t: createT() });
  assert.ok(textOf(view.tree).includes('工作区一'));
  assert.ok(textOf(view.tree).includes('文件夹与会话记录会保留'));
  assert.ok(textOf(view.tree).includes('未分组'));
  click(buttonWithExactText(view.tree, '删除'));
  await flush();
  deepEqualCross(fake.calls.deleted, ['ws-1']);
  assert.equal(plugin.__internal.store.kind, null);
});

test('pin order mismatch posts pin-workspace {reapply:true} once, then throttles', async () => {
  const calls = [];
  const fetchMock = async (url, init) => {
    const target = String(url);
    const body = init !== undefined && init.body !== undefined ? JSON.parse(init.body) : null;
    calls.push({ url: target, method: init !== undefined ? init.method : 'GET', body });
    if (target.includes(STATE_PATH)) return jsonResponse(statePayload({ pinnedWorkspaceIds: ['ws-2', 'ws-1'] }));
    if (target.includes(PIN_WORKSPACE_PATH)) return jsonResponse({ ok: true, pinnedWorkspaceIds: ['ws-2', 'ws-1'], order: ['ws-2', 'ws-1'] });
    return jsonResponse({ ok: true });
  };
  const workspacesSnapshot = {
    phase: 'ready',
    items: [
      { workspaceId: 'ws-1', title: '工作区一', sessionIds: [] },
      { workspaceId: 'ws-2', title: '工作区二', sessionIds: [] },
    ],
    pinnedSessionIds: [],
    archivedSessionIds: [],
  };
  const { plugin } = loadBundle({ document: createDocument(), fetch: fetchMock });
  const fake = createFakeCtx({ workspacesSnapshot });
  plugin.apply(fake.ctx);
  await flush();

  const reapplyCalls = calls.filter((call) => call.method === 'POST' && call.url.endsWith(PIN_WORKSPACE_PATH) && call.body !== null && call.body.reapply === true);
  assert.equal(reapplyCalls.length, 1, 'exactly one reapply request');
  deepEqualCross(reapplyCalls[0].body, { reapply: true });
  deepEqualCross(plugin.__internal.state.pinnedIds, ['ws-2', 'ws-1']);
  assert.equal(plugin.__internal.pinnedPrefixMatches({ items: [{ workspaceId: 'ws-2' }, { workspaceId: 'ws-1' }] }), true);
  assert.equal(plugin.__internal.pinnedPrefixMatches({ items: [{ workspaceId: 'ws-1' }, { workspaceId: 'ws-2' }] }), false);
  assert.equal(plugin.__internal.maybeReapplyPinnedOrder(), false, 'throttled within 3s');
});

test('a stale reapply response cannot undo a completed unpin', async () => {
  let releaseReapply = null;
  const reapplyGate = new Promise((resolve) => { releaseReapply = resolve; });
  let reapplyStarted = false;
  const fetchMock = async (url, init) => {
    const target = String(url);
    const body = init !== undefined && init.body !== undefined ? JSON.parse(init.body) : null;
    if (target.includes(STATE_PATH)) return jsonResponse(statePayload());
    if (target.includes(PIN_WORKSPACE_PATH)) {
      if (body !== null && body.reapply === true) {
        reapplyStarted = true;
        await reapplyGate;
        // Old projection captured before the unpin.
        return jsonResponse({ ok: true, pinnedWorkspaceIds: ['ws-2'], order: ['ws-2', 'ws-1'] });
      }
      return jsonResponse({ ok: true, pinnedWorkspaceIds: [], order: ['ws-2', 'ws-1'] });
    }
    return jsonResponse({ ok: true });
  };
  const workspacesSnapshot = {
    phase: 'ready',
    items: [
      { workspaceId: 'ws-1', title: '工作区一', sessionIds: [] },
      { workspaceId: 'ws-2', title: '工作区二', sessionIds: [] },
    ],
    pinnedSessionIds: [],
    archivedSessionIds: [],
  };
  const { plugin } = loadBundle({ document: createDocument(), fetch: fetchMock });
  const fake = createFakeCtx({ workspacesSnapshot });
  plugin.apply(fake.ctx);
  await flush();

  plugin.__internal.applyPinnedResult({ pinnedWorkspaceIds: ['ws-2'] });
  assert.equal(plugin.__internal.maybeReapplyPinnedOrder(), true);
  await flush();
  assert.equal(reapplyStarted, true, 'reapply request is in flight');

  await plugin.__internal.performPinWorkspace('ws-2', false);
  deepEqualCross(plugin.__internal.state.pinnedIds, [], 'unpin takes effect immediately');
  releaseReapply();
  await flush();
  deepEqualCross(plugin.__internal.state.pinnedIds, [], 'late reapply response must not restore the old pin');
});

test('hidden mode routes the native "+" click to our create-hidden dialog', async () => {
  const document = createDocument();
  const { plugin, windowListeners } = loadBundle({ document });
  const fake = createFakeCtx();
  plugin.apply(fake.ctx);
  await flush();
  const guard = windowListeners.find((entry) => entry.type === 'click' && entry.active === true);
  assert.ok(guard !== undefined);

  const addButton = fakeElement('button');
  addButton.setAttribute('aria-label', '添加工作区');
  const makeEvent = () => ({
    target: addButton,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  });

  const normalEvent = makeEvent();
  guard.handler(normalEvent);
  assert.equal(normalEvent.prevented, false);
  assert.equal(plugin.__internal.store.kind, null);

  plugin.__internal.enterHiddenMode();
  const hiddenEvent = makeEvent();
  guard.handler(hiddenEvent);
  assert.equal(hiddenEvent.prevented, true);
  assert.equal(hiddenEvent.stopped, true);
  assert.equal(plugin.__internal.store.kind, 'create-hidden');
});
