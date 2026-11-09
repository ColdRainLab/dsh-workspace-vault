/**
 * dsh-workspace-vault — host half.
 *
 * Owns the durable state behind the Workspace Vault client half:
 *   - workspace pin order (reapplied through ctx.workspaceRegistry),
 *   - one master password (scrypt, never stored in clear),
 *   - an optional locally verified phone number for password recovery,
 *   - hidden-workspace / encrypted-workspace id sets, and
 *   - hidden workspace directories under <DSH_HOME>/hidden-space.
 *
 * Routes are exact matches on ctx.webServer and follow
 * `dsh-workspace-vault/API.md` exactly:
 *   GET  /api/workspace-vault/state
 *   POST /api/workspace-vault/password
 *   POST /api/workspace-vault/unlock
 *   POST /api/workspace-vault/check-token
 *   POST /api/workspace-vault/pin-workspace
 *   POST /api/workspace-vault/hidden
 *   POST /api/workspace-vault/encrypt
 *   POST /api/workspace-vault/create-hidden
 *
 * Business failures answer HTTP 200 with `{ ok:false, code, message }`; a body
 * that is not valid JSON answers 400; a wrong method answers 405. Plain ESM,
 * Node builtins only, no build step.
 */

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";

/** Plugin name as mounted by the Cordis loader. */
export const name = "dsh-workspace-vault";

/** The web server serves the routes; the registry applies the pinned order. */
export const inject = ["webServer", "workspaceRegistry"];

/** Route paths (API.md §4) — exact matches. */
export const STATE_PATH = "/api/workspace-vault/state";
export const PASSWORD_PATH = "/api/workspace-vault/password";
export const UNLOCK_PATH = "/api/workspace-vault/unlock";
export const CHECK_TOKEN_PATH = "/api/workspace-vault/check-token";
export const PIN_WORKSPACE_PATH = "/api/workspace-vault/pin-workspace";
export const HIDDEN_PATH = "/api/workspace-vault/hidden";
export const ENCRYPT_PATH = "/api/workspace-vault/encrypt";
export const CREATE_HIDDEN_PATH = "/api/workspace-vault/create-hidden";

/** State schema version written to disk. */
export const STATE_VERSION = 1;
/** Directory (below DSH home) holding the state file. */
export const STATE_DIR_NAME = "workspace-vault";
/** State file name. */
export const STATE_FILE_NAME = "state.json";
/** Directory (below DSH home) holding hidden workspace directories. */
export const HIDDEN_ROOT_NAME = "hidden-space";
/** Accepted master-password length (API.md §4). */
export const PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 128;
/** Unlock-token lifetime: fixed 30 minutes, never sliding. */
export const TOKEN_TTL_MS = 30 * 60 * 1000;
/** Longest accepted hidden-workspace name (workspace-plus rule). */
export const MAX_NAME_LENGTH = 80;
/** scrypt parameters fixed by API.md §2. */
export const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64, saltBytes: 16 });
/** How often `apply()` retries applying the saved pin order. */
export const PIN_ORDER_RETRY_MS = 500;
/** Maximum number of startup retries for the pin order. */
export const PIN_ORDER_MAX_ATTEMPTS = 20;
/** Largest accepted JSON request body. */
const MAX_BODY_BYTES = 64 * 1024;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const HEX_SALT = /^[0-9a-f]{32}$/i;
const HEX_HASH = /^[0-9a-f]{128}$/i;
const HEX_SHA256 = /^[0-9a-f]{64}$/i;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Whether a value is a non-array object. */
function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Human-readable message of any thrown value. */
function messageOf(error) {
	if (error instanceof Error) return error.message;
	return String(error);
}

/** Expand a leading `~`, `~/` or `~\`; other values pass through. */
function expandHome(value) {
	if (value === "~") return homedir();
	if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
	return value;
}

/** Resolve the DSH home: `DSH_HOME` (with `~` expansion) or `~/.dsh`. */
export function resolveHome(env = process.env) {
	const configured = env?.DSH_HOME;
	const value = typeof configured === "string" && configured.trim().length > 0 ? configured : join(homedir(), ".dsh");
	return resolve(expandHome(value));
}

/** Whether `child` is lexically inside `parent` (not equal). */
export function isInside(parent, child) {
	const rel = relative(resolve(parent), resolve(child));
	return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}

/** Deduplicate string ids while keeping first-seen order. */
function uniqueStrings(value) {
	if (!Array.isArray(value)) return [];
	const seen = new Set();
	const result = [];
	for (const item of value) {
		if (typeof item !== "string" || item.length === 0 || seen.has(item)) continue;
		seen.add(item);
		result.push(item);
	}
	return result;
}

/** sha256 hex of a UTF-8 string. */
function sha256Hex(value) {
	return createHash("sha256").update(String(value), "utf8").digest("hex");
}

/** Constant-time comparison of two hex strings of equal length. */
function safeEqualHex(left, right) {
	try {
		if (typeof left !== "string" || typeof right !== "string") return false;
		if (left.length === 0 || left.length !== right.length) return false;
		const a = Buffer.from(left, "hex");
		const b = Buffer.from(right, "hex");
		if (a.length === 0 || a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

/** Error carrying a stable wire code; only malformed transport bodies use a non-200 status. */
export class VaultError extends Error {
	constructor(code, message, status = 200) {
		super(message);
		this.name = "VaultError";
		this.code = code;
		this.status = status;
	}
}

// ---------------------------------------------------------------------------
// Paths and state document
// ---------------------------------------------------------------------------

/** On-disk locations derived from DSH home. */
export function statePaths(env = process.env) {
	const home = resolveHome(env);
	const root = join(home, STATE_DIR_NAME);
	return { home, root, file: join(root, STATE_FILE_NAME), hiddenRoot: join(home, HIDDEN_ROOT_NAME) };
}

/** Fresh empty state document (API.md §2 schema). */
export function defaultState() {
	return {
		version: STATE_VERSION,
		password: null,
		phone: null,
		hiddenWorkspaceIds: [],
		encryptedWorkspaceIds: [],
		pinnedWorkspaceIds: []
	};
}

/** Normalize a stored password record, or null when it does not match the schema. */
function normalizePasswordRecord(value) {
	if (!isPlainObject(value) || value.algorithm !== "scrypt") return null;
	if (typeof value.salt !== "string" || !HEX_SALT.test(value.salt)) return null;
	if (typeof value.hash !== "string" || !HEX_HASH.test(value.hash)) return null;
	const N = Number.isInteger(value.N) && value.N > 1 && value.N <= 65536 ? value.N : SCRYPT.N;
	const r = Number.isInteger(value.r) && value.r > 0 && value.r <= 16 ? value.r : SCRYPT.r;
	const p = Number.isInteger(value.p) && value.p > 0 && value.p <= 16 ? value.p : SCRYPT.p;
	const keylen = Number.isInteger(value.keylen) && value.keylen > 0 && value.keylen <= 128 ? value.keylen : SCRYPT.keylen;
	return { ...value, algorithm: "scrypt", salt: value.salt.toLowerCase(), hash: value.hash.toLowerCase(), N, r, p, keylen };
}

/** Normalize a stored phone record, or null when it does not match the schema. */
function normalizePhoneRecord(value) {
	if (!isPlainObject(value) || typeof value.hash !== "string" || !HEX_SHA256.test(value.hash)) return null;
	const masked = typeof value.masked === "string" && value.masked.length > 0 ? value.masked : "****";
	return { ...value, hash: value.hash.toLowerCase(), masked };
}

/**
 * Fill missing fields with defaults, keep unknown fields verbatim (API.md §2)
 * and coerce the known collections into shapes the routes can trust.
 * @param input - parsed state file contents.
 */
export function normalizeState(input) {
	const base = isPlainObject(input) ? { ...input } : {};
	base.version = STATE_VERSION;
	base.password = normalizePasswordRecord(base.password);
	base.phone = normalizePhoneRecord(base.phone);
	base.hiddenWorkspaceIds = uniqueStrings(base.hiddenWorkspaceIds);
	base.encryptedWorkspaceIds = uniqueStrings(base.encryptedWorkspaceIds);
	base.pinnedWorkspaceIds = uniqueStrings(base.pinnedWorkspaceIds);
	return base;
}

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------

/** Whether a candidate master password satisfies the 4–128 character rule. */
export function validatePassword(raw) {
	if (typeof raw !== "string") return { ok: false, code: "invalid-password", message: "密码必须是字符串" };
	if (raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH) {
		return { ok: false, code: "invalid-password", message: `密码长度需为 ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 个字符` };
	}
	return { ok: true, password: raw };
}

/** Hash a master password with scrypt and a fresh 16-byte random salt. */
export function hashPassword(password, params = SCRYPT) {
	const salt = randomBytes(params.saltBytes ?? SCRYPT.saltBytes);
	const N = params.N ?? SCRYPT.N;
	const r = params.r ?? SCRYPT.r;
	const p = params.p ?? SCRYPT.p;
	const keylen = params.keylen ?? SCRYPT.keylen;
	const hash = scryptSync(String(password), salt, keylen, { N, r, p });
	return { algorithm: "scrypt", salt: salt.toString("hex"), hash: hash.toString("hex"), N, r, p, keylen };
}

/** Constant-time password check against a stored record; never throws. */
export function verifyPassword(password, record) {
	try {
		if (typeof password !== "string" || !isPlainObject(record)) return false;
		if (typeof record.salt !== "string" || typeof record.hash !== "string") return false;
		const salt = Buffer.from(record.salt, "hex");
		const expected = Buffer.from(record.hash, "hex");
		const keylen = Number.isInteger(record.keylen) ? record.keylen : SCRYPT.keylen;
		if (salt.length !== SCRYPT.saltBytes || expected.length !== keylen) return false;
		const N = Number.isInteger(record.N) ? record.N : SCRYPT.N;
		const r = Number.isInteger(record.r) ? record.r : SCRYPT.r;
		const p = Number.isInteger(record.p) ? record.p : SCRYPT.p;
		if (N < 2 || N > 65536 || (N & (N - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 16) return false;
		const actual = scryptSync(password, salt, keylen, { N, r, p, maxmem: 128 * N * r + 1024 * 1024 });
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}

/** Keep only digits, requiring 6–20 of them (API.md §2). */
export function normalizePhone(raw) {
	if (typeof raw === "number" && Number.isFinite(raw)) raw = String(raw);
	if (typeof raw !== "string") return { ok: false, code: "bad-request", message: "手机号必须是字符串" };
	const digits = raw.replace(/\D/g, "");
	if (digits.length < 6 || digits.length > 20) return { ok: false, code: "bad-request", message: "手机号需为 6–20 位数字" };
	return { ok: true, digits };
}

/** Masked display form: `前3 + "****" + 后4` when length ≥ 7, else `"****"`. */
export function maskPhone(value) {
	const digits = String(value);
	if (digits.length < 7) return "****";
	return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/** Build the stored phone record: sha256 of the normalized digits plus the mask. */
export function phoneRecord(raw) {
	const normalized = normalizePhone(raw);
	if (normalized.ok !== true) return normalized;
	return { ok: true, record: { hash: sha256Hex(normalized.digits), masked: maskPhone(normalized.digits) } };
}

// ---------------------------------------------------------------------------
// In-memory unlock tokens (API.md §3)
// ---------------------------------------------------------------------------

/**
 * Process-local token table: `Map<token, expiresAt>`, fixed 30-minute
 * expiry, lost on restart. No sliding renewal.
 * @param options.now - clock accessor (tests inject one).
 * @param options.ttlMs - token lifetime override.
 */
export function createTokenStore(options = {}) {
	const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : TOKEN_TTL_MS;
	const now = typeof options.now === "function" ? options.now : () => Date.now();
	const tokens = new Map();

	const prune = () => {
		const current = now();
		for (const [token, expiresAt] of tokens) {
			if (!(expiresAt > current)) tokens.delete(token);
		}
	};
	const issue = () => {
		prune();
		const token = randomUUID();
		const expiresAt = now() + ttlMs;
		tokens.set(token, expiresAt);
		return { token, expiresAt };
	};
	const isValid = (token) => {
		if (typeof token !== "string" || token.length === 0) return false;
		prune();
		const expiresAt = tokens.get(token);
		return typeof expiresAt === "number" && expiresAt > now();
	};
	const clear = () => tokens.clear();
	const size = () => {
		prune();
		return tokens.size;
	};
	return { ttlMs, issue, isValid, clear, size };
}

// ---------------------------------------------------------------------------
// Durable state store: atomic writes, broken-file backup, serialized mutation
// ---------------------------------------------------------------------------

/**
 * Small JSON store for `<DSH_HOME>/workspace-vault/state.json`.
 *
 * - A missing file reads as the default state.
 * - An unparseable (or structurally unusable) file is renamed to
 *   `state.json.broken-<ts>` before falling back to the default state.
 * - Every write goes through a temp file in the same directory plus `rename`.
 * - All reads and mutations are serialized through one promise queue, so two
 *   concurrent route calls cannot interleave read/modify/write.
 *
 * @param options.env - environment used for DSH home resolution.
 * @param options.fsOps - injectable filesystem operations.
 * @param options.logger - optional logger (warn only).
 */
export function createStateStore(options = {}) {
	const env = options.env ?? process.env;
	const fsOps = { readFile, writeFile, rename, unlink, mkdir, lstat, ...(options.fsOps ?? {}) };
	const logger = options.logger ?? {};
	const paths = statePaths(env);
	let queue = Promise.resolve();

	/** Run one task after every previously enqueued task settled. */
	const serialize = (task) => {
		const next = queue.then(task, task);
		queue = next.then(() => undefined, () => undefined);
		return next;
	};

	/** Move an unreadable state file aside without ever overwriting an older backup. */
	const backupBroken = async () => {
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		let target = `${paths.file}.broken-${stamp}`;
		for (let counter = 1; counter < 100; counter += 1) {
			try {
				await fsOps.lstat(target);
				target = `${paths.file}.broken-${stamp}-${counter}`;
			} catch {
				break;
			}
		}
		try {
			await fsOps.rename(paths.file, target);
		} catch {
			try {
				const text = await fsOps.readFile(paths.file, "utf8");
				await fsOps.writeFile(target, text, "utf8");
			} catch {
				// best effort: the fallback default state is still returned
			}
		}
		logger.warn?.(`[dsh-workspace-vault] unreadable state file moved to ${target}`);
	};

	const readOnce = async () => {
		let text;
		try {
			text = await fsOps.readFile(paths.file, "utf8");
		} catch (error) {
			if (error !== null && typeof error === "object" && error.code === "ENOENT") return defaultState();
			throw new VaultError("io-error", `无法读取状态文件：${messageOf(error)}`);
		}
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch {
			await backupBroken();
			return defaultState();
		}
		if (!isPlainObject(parsed)) {
			await backupBroken();
			return defaultState();
		}
		return normalizeState(parsed);
	};

	const writeOnce = async (state) => {
		await fsOps.mkdir(paths.root, { recursive: true });
		const temp = `${paths.file}.tmp-${process.pid}-${randomUUID()}`;
		const payload = JSON.stringify(state, null, 2) + "\n";
		try {
			await fsOps.writeFile(temp, payload, "utf8");
			await fsOps.rename(temp, paths.file);
		} catch (error) {
			try {
				await fsOps.unlink(temp);
			} catch {
				// the temp file may never have been created
			}
			throw new VaultError("io-error", `无法写入状态文件：${messageOf(error)}`);
		}
	};

	/** Serialized read of the normalized state. */
	const read = () => serialize(readOnce);

	/**
	 * Serialized read-modify-write. The mutator edits the passed state in place
	 * and returns `{ changed?: boolean, value }`; `changed === false` skips the
	 * write (used for idempotent calls).
	 */
	const update = (mutator) =>
		serialize(async () => {
			const state = await readOnce();
			const outcome = await mutator(state);
			if (outcome === null || typeof outcome !== "object" || outcome.changed !== false) {
				await writeOnce(state);
			}
			return outcome === null || typeof outcome !== "object" ? undefined : outcome.value;
		});

	return { paths, read, update };
}

// ---------------------------------------------------------------------------
// Workspace name validation (workspace-plus rules, API.md §4)
// ---------------------------------------------------------------------------

/**
 * Validate one hidden-workspace name. The name becomes one directory segment,
 * so separators, control characters, Windows-reserved device names and
 * trailing dots are refused with `invalid-name`.
 */
export function validateName(raw) {
	if (typeof raw !== "string") return invalidName("工作区名称必须是字符串");
	const value = raw.trim();
	if (value.length === 0) return invalidName("请输入工作区名称");
	if (value.length > MAX_NAME_LENGTH) return invalidName(`工作区名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
	if (/[\u0000-\u001f\u007f]/.test(value)) return invalidName("工作区名称不能包含控制字符");
	if (/[<>:"/\\|?*]/.test(value)) return invalidName('工作区名称不能包含 < > : " / \\ | ? * 这些字符');
	if (value === "." || value === "..") return invalidName("工作区名称不能是 . 或 ..");
	if (value.endsWith(".")) return invalidName("工作区名称不能以句点结尾");
	if (WINDOWS_RESERVED.test(value)) return invalidName("这个名称在 Windows 上是保留设备名，请换一个");
	return { ok: true, name: value };
}

function invalidName(message) {
	return { ok: false, code: "invalid-name", message };
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Build the vault core with injectable services/filesystem/clock so the unit
 * tests drive the production path against a temporary DSH home.
 *
 * @param options.env - environment mapping for DSH home resolution.
 * @param options.getRegistry - accessor for `ctx.workspaceRegistry`.
 * @param options.fsOps - injectable filesystem operations.
 * @param options.now - clock accessor for the token table.
 * @param options.tokenTtlMs - token lifetime override.
 * @param options.store - injectable state store.
 * @param options.tokens - injectable token store.
 * @param options.logger - optional logger.
 */
export function createCore(options = {}) {
	const env = options.env ?? process.env;
	const fsOps = { lstat, mkdir, realpath, ...(options.fsOps ?? {}) };
	const logger = options.logger ?? {};
	const getRegistry = typeof options.getRegistry === "function" ? options.getRegistry : () => undefined;
	const store = options.store ?? createStateStore({ env, fsOps, logger });
	const tokens = options.tokens ?? createTokenStore({ now: options.now, ttlMs: options.tokenTtlMs });

	/** Read the registry defensively: a missing or throwing service is just `undefined`. */
	const registryOf = () => {
		try {
			const value = getRegistry();
			return value === null ? undefined : value;
		} catch {
			return undefined;
		}
	};

	/** Current workspace projection (registry order), filtered to usable entries. */
	const listWorkspaces = () => {
		const registryService = registryOf();
		try {
			const list = typeof registryService?.list === "function" ? registryService.list() : [];
			if (!Array.isArray(list)) return [];
			return list.filter((workspace) => isPlainObject(workspace) && typeof workspace.id === "string");
		} catch {
			return [];
		}
	};

	/** `true`/`false` when the registry can answer, `undefined` when it cannot. */
	const workspaceExists = (workspaceId) => {
		const registryService = registryOf();
		if (registryService === undefined) return undefined;
		try {
			if (typeof registryService.get === "function") return registryService.get(workspaceId) !== undefined;
		} catch {
			// fall through to the list projection
		}
		return listWorkspaces().some((workspace) => workspace.id === workspaceId);
	};

	/** Reject an unknown workspace id; unavailable registry is an io-error. */
	const requireWorkspace = (workspaceId) => {
		const exists = workspaceExists(workspaceId);
		if (exists === undefined) throw new VaultError("io-error", "工作区注册表不可用，请稍后再试");
		if (exists === false) throw new VaultError("unknown-workspace", "工作区不存在（可能已经被删除）");
	};

	/** Require a currently valid unlock token. */
	const requireToken = (body) => {
		if (!tokens.isValid(body?.token)) throw new VaultError("token-invalid", "解锁令牌无效或已过期，请重新解锁");
	};

	/** Client-facing projection of the state (API.md §4 GET state). */
	const viewOf = (state) => ({
		ok: true,
		version: STATE_VERSION,
		hasPassword: state.password !== null,
		phone: state.phone === null ? null : { masked: state.phone.masked },
		hiddenWorkspaceIds: [...state.hiddenWorkspaceIds],
		encryptedWorkspaceIds: [...state.encryptedWorkspaceIds],
		pinnedWorkspaceIds: [...state.pinnedWorkspaceIds],
		hiddenRoot: store.paths.hiddenRoot
	});

	/** Serialized raw state read (also used by the startup pin-order retry). */
	const readState = () => store.read();

	/** GET /state projection. */
	const getState = async () => viewOf(await store.read());

	/**
	 * Compute the target workspace order and apply it with stepwise
	 * `registry.insertBefore` calls, re-reading the registry after each step.
	 * Tolerates stale ids and registries that are not ready yet.
	 * @param options.state - state snapshot (read when omitted).
	 * @param options.unpinnedFirst - id to move to the front of the non-pinned block.
	 * @returns the final workspace-id order (empty when the registry is unusable).
	 */
	const applyPinnedOrder = async (options = {}) => {
		const registryService = registryOf();
		if (registryService === undefined || typeof registryService.list !== "function") return [];
		const state = options.state ?? (await store.read());
		const current = listWorkspaces().map((workspace) => workspace.id);
		if (current.length === 0) return [];

		const currentSet = new Set(current);
		const pinned = uniqueStrings(state.pinnedWorkspaceIds).filter((id) => currentSet.has(id));
		const pinnedSet = new Set(pinned);
		const unpinned = current.filter((id) => !pinnedSet.has(id));
		if (typeof options.unpinnedFirst === "string") {
			const index = unpinned.indexOf(options.unpinnedFirst);
			if (index > 0) {
				unpinned.splice(index, 1);
				unpinned.unshift(options.unpinnedFirst);
			}
		}
		const desired = [...pinned, ...unpinned];
		if (typeof registryService.insertBefore !== "function") return current;

		let order = current;
		for (let index = 0; index < desired.length; index += 1) {
			const id = desired[index];
			if (order[index] === id) continue;
			// DOM-style insertBefore: put `id` immediately before whatever element
			// currently occupies the target position. Choosing `desired[index+1]`
			// is not enough when the current order differs before that anchor.
			let beforeId = order[index];
			if (beforeId === id) {
				beforeId = undefined;
			} else if (typeof beforeId !== "string" || !order.includes(beforeId)) {
				beforeId = undefined;
				for (let next = index + 1; next < desired.length; next += 1) {
					if (order.includes(desired[next])) {
						beforeId = desired[next];
						break;
					}
				}
			}
			try {
				const committed = await registryService.insertBefore(id, beforeId);
				order = Array.isArray(committed)
					? committed.filter((value) => typeof value === "string")
					: listWorkspaces().map((workspace) => workspace.id);
			} catch (error) {
				logger.warn?.(`[dsh-workspace-vault] insertBefore(${id}) failed: ${messageOf(error)}`);
				try {
					order = listWorkspaces().map((workspace) => workspace.id);
				} catch {
					order = current;
				}
				continue;
			}
			if (order.length === 0) order = current;
		}
		logger.info?.(`[dsh-workspace-vault] applied workspace order: ${order.join(", ")}`);
		return order;
	};

	/**
	 * POST /password — `setup`, `change` or `recover`.
	 * Every mutation is serialized by the state store, so concurrent calls
	 * cannot race the "already configured" decision.
	 */
	const password = async (body = {}) => {
		const action = body?.action;
		if (typeof action !== "string") throw new VaultError("bad-request", "缺少 action（setup / change / recover）");

		if (action === "setup") {
			const value = await store.update((state) => {
				// Checked first so a retried setup reports `already-configured` even
				// when the retried body is otherwise invalid.
				if (state.password !== null) throw new VaultError("already-configured", "已经设置过主密码");
				const next = validatePassword(body?.password);
				if (next.ok !== true) throw new VaultError(next.code, next.message);
				let phone = null;
				if (body?.phone !== undefined && body?.phone !== null && String(body.phone).trim() !== "") {
					const candidate = phoneRecord(body.phone);
					if (candidate.ok !== true) throw new VaultError("bad-request", candidate.message);
					phone = candidate.record;
				}
				state.password = hashPassword(next.password);
				state.phone = phone;
				return { changed: true, value: { phone: state.phone === null ? null : { masked: state.phone.masked } } };
			});
			logger.info?.("[dsh-workspace-vault] master password configured");
			return { ok: true, hasPassword: true, phone: value.phone };
		}

		if (action === "change") {
			const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
			const value = await store.update((state) => {
				if (state.password === null) throw new VaultError("bad-password", "尚未设置主密码，请先设置密码");
				if (!verifyPassword(current, state.password)) throw new VaultError("bad-password", "密码不正确");
				const next = validatePassword(body?.password);
				if (next.ok !== true) throw new VaultError(next.code, next.message);
				state.password = hashPassword(next.password);
				return { changed: true, value: { phone: state.phone === null ? null : { masked: state.phone.masked } } };
			});
			logger.info?.("[dsh-workspace-vault] master password changed");
			return { ok: true, hasPassword: true, phone: value.phone };
		}

		if (action === "recover") {
			const candidate = normalizePhone(body?.phone);
			if (candidate.ok !== true) throw new VaultError("bad-request", candidate.message);
			const next = validatePassword(body?.password);
			if (next.ok !== true) throw new VaultError(next.code, next.message);
			const value = await store.update((state) => {
				if (state.password === null) throw new VaultError("bad-password", "尚未设置主密码，请先设置密码");
				if (state.phone === null) throw new VaultError("no-phone", "尚未绑定手机号，无法找回密码");
				if (!safeEqualHex(sha256Hex(candidate.digits), state.phone.hash)) {
					throw new VaultError("bad-phone", "手机号与绑定的号码不一致");
				}
				state.password = hashPassword(next.password);
				tokens.clear();
				return { changed: true, value: { phone: state.phone === null ? null : { masked: state.phone.masked } } };
			});
			logger.info?.("[dsh-workspace-vault] master password recovered (all unlock tokens invalidated)");
			return { ok: true, hasPassword: true, phone: value.phone };
		}

		throw new VaultError("bad-request", `未知的 action：${action}`);
	};

	/** POST /unlock — verify the master password and issue one 30-minute token. */
	const unlock = async (body = {}) => {
		const candidate = typeof body?.password === "string" ? body.password : "";
		const state = await store.read();
		if (state.password === null) throw new VaultError("bad-password", "尚未设置主密码，请先设置密码");
		if (!verifyPassword(candidate, state.password)) throw new VaultError("bad-password", "密码不正确");
		const issued = tokens.issue();
		logger.info?.("[dsh-workspace-vault] unlock token issued");
		return { ok: true, token: issued.token, expiresAt: issued.expiresAt };
	};

	/** POST /check-token. */
	const checkToken = async (body = {}) => {
		if (!tokens.isValid(body?.token)) throw new VaultError("token-invalid", "解锁令牌无效或已过期，请重新解锁");
		return { ok: true };
	};

	/**
	 * POST /pin-workspace — persist the MRU pin list, then reorder the host
	 * registry to `[pinned..., 其余保持当前相对顺序]`. An unpinned workspace
	 * lands at the front of the non-pinned block.
	 */
	const pinWorkspace = async (body = {}) => {
		// A client may ask the host to re-assert the saved pinned prefix after a
		// restart or a workspace-list reshuffle (no membership change). Used by
		// the sidebar decorator when the native order no longer starts with the
		// pinned ids; keeping this on the existing pin route preserves the host
		// route surface.
		if (body?.reapply === true) {
			const state = await store.read();
			const order = await applyPinnedOrder({ state });
			return { ok: true, pinnedWorkspaceIds: [...state.pinnedWorkspaceIds], order };
		}
		const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
		if (workspaceId === "") throw new VaultError("bad-request", "workspaceId 必须是工作区标识");
		if (typeof body?.pinned !== "boolean") throw new VaultError("bad-request", "pinned 必须是布尔值");
		requireWorkspace(workspaceId);

		const value = await store.update((state) => {
			const wasPinned = state.pinnedWorkspaceIds.includes(workspaceId);
			state.pinnedWorkspaceIds = body.pinned
				? [workspaceId, ...state.pinnedWorkspaceIds.filter((id) => id !== workspaceId)]
				: state.pinnedWorkspaceIds.filter((id) => id !== workspaceId);
			return { changed: true, value: { pinnedWorkspaceIds: [...state.pinnedWorkspaceIds], wasPinned } };
		});

		const order = await applyPinnedOrder({
			state: normalizeState({ pinnedWorkspaceIds: value.pinnedWorkspaceIds }),
			unpinnedFirst: value.wasPinned && body.pinned === false ? workspaceId : undefined
		});
		return { ok: true, pinnedWorkspaceIds: value.pinnedWorkspaceIds, order };
	};

	/** Shared implementation of POST /hidden and POST /encrypt. */
	const setMembership = async (body, field, label) => {
		requireToken(body);
		const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
		if (workspaceId === "") throw new VaultError("bad-request", "workspaceId 必须是工作区标识");
		if (typeof body?.flag !== "boolean") throw new VaultError("bad-request", `${label} 必须是布尔值`);
		requireWorkspace(workspaceId);
		const memberships = await store.update((state) => {
			const current = Array.isArray(state[field]) ? state[field] : [];
			const next = body.flag ? (current.includes(workspaceId) ? current : [...current, workspaceId]) : current.filter((id) => id !== workspaceId);
			state[field] = next;
			return { changed: true, value: [...next] };
		});
		return { ok: true, [field]: memberships };
	};

	/** POST /hidden — mark a workspace as hidden (no data is deleted). */
	const hidden = async (body = {}) => {
		const result = await setMembership({ ...body, flag: body?.hidden }, "hiddenWorkspaceIds", "hidden");
		return { ok: true, hiddenWorkspaceIds: result.hiddenWorkspaceIds };
	};

	/** POST /encrypt — mark a workspace as locked (no data is deleted). */
	const encrypt = async (body = {}) => {
		const result = await setMembership({ ...body, flag: body?.encrypted }, "encryptedWorkspaceIds", "encrypted");
		return { ok: true, encryptedWorkspaceIds: result.encryptedWorkspaceIds };
	};

	/**
	 * POST /create-hidden — create (or reuse) `<hiddenRoot>/<name>` and return
	 * its canonical absolute path. Existing directory contents are never
	 * overwritten; an existing non-directory is a `name-taken` conflict.
	 */
	const createHidden = async (body = {}) => {
		requireToken(body);
		const validation = validateName(body?.name);
		if (validation.ok !== true) throw new VaultError(validation.code, validation.message);
		const workspaceName = validation.name;

		let base = store.paths.hiddenRoot;
		if (body?.baseDir !== undefined && body?.baseDir !== null) {
			if (typeof body.baseDir !== "string" || body.baseDir.trim().length === 0) {
				throw new VaultError("bad-request", "baseDir 必须是绝对路径");
			}
			const raw = body.baseDir.trim();
			const expanded = expandHome(raw);
			if (!isAbsolute(expanded)) throw new VaultError("bad-request", `baseDir 不是绝对路径：${raw}`);
			base = resolve(expanded);
		}
		const target = join(base, workspaceName);
		if (!isInside(base, target)) throw new VaultError("invalid-name", "工作区名称会逃出 baseDir，已拒绝");

		try {
			await fsOps.mkdir(base, { recursive: true });
		} catch (error) {
			throw new VaultError("io-error", `无法创建隐藏空间目录：${messageOf(error)}`);
		}

		let info = null;
		try {
			info = await fsOps.lstat(target);
		} catch (error) {
			if (error === null || typeof error !== "object" || error.code !== "ENOENT") {
				throw new VaultError("io-error", `无法检查目录 '${target}'：${messageOf(error)}`);
			}
		}
		if (info !== null && !info.isDirectory()) {
			throw new VaultError("name-taken", `「${workspaceName}」已存在且不是文件夹，请换一个名称`);
		}
		try {
			await fsOps.mkdir(target, { recursive: true });
		} catch (error) {
			if (error === null || typeof error !== "object" || error.code !== "EEXIST") {
				throw new VaultError("io-error", `无法创建目录 '${target}'：${messageOf(error)}`);
			}
		}

		let realTarget;
		try {
			realTarget = await fsOps.realpath(target);
		} catch (error) {
			throw new VaultError("io-error", `无法解析目录路径：${messageOf(error)}`);
		}
		logger.info?.(`[dsh-workspace-vault] hidden workspace ${info === null ? "created" : "reused"}: ${realTarget}`);
		return { ok: true, path: realTarget, name: workspaceName };
	};

	return {
		paths: store.paths,
		tokens,
		readState,
		getState,
		password,
		unlock,
		checkToken,
		pinWorkspace,
		hidden,
		encrypt,
		createHidden,
		applyPinnedOrder
	};
}

// ---------------------------------------------------------------------------
// HTTP transport
// ---------------------------------------------------------------------------

/** Write one JSON response; a committed response is left alone. */
function writeJson(res, status, body) {
	if (res === null || typeof res !== "object" || res.headersSent === true) {
		try {
			res?.destroy?.();
		} catch {
			// the socket is already gone
		}
		return;
	}
	try {
		res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
		res.end(JSON.stringify(body));
	} catch {
		try {
			res.destroy?.();
		} catch {
			// ignore
		}
	}
}

/** Map a thrown value to the wire envelope: business failures stay HTTP 200. */
function writeFailure(res, error) {
	if (error instanceof VaultError) {
		const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 200;
		writeJson(res, status, { ok: false, code: error.code, message: error.message });
		return;
	}
	writeJson(res, 200, { ok: false, code: "io-error", message: messageOf(error) });
}

/** Parse a bounded JSON object body; malformed JSON is an HTTP 400. */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new VaultError("bad-request", "请求体过大", 400);
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim().length === 0) return {};
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new VaultError("bad-request", "请求体不是合法 JSON", 400);
	}
	if (!isPlainObject(parsed)) throw new VaultError("bad-request", "请求体必须是 JSON 对象", 400);
	return parsed;
}

/**
 * Build the eight route handlers around one core (exported for unit tests).
 * @param core - result of {@link createCore}.
 */
export function createRouteHandlers(core) {
	const wrap = (method, invoke) => async (req, res) => {
		if (req?.method !== method) {
			writeJson(res, 405, { ok: false, code: "method-not-allowed", message: `请使用 ${method}` });
			return;
		}
		try {
			const body = method === "POST" ? await readJsonBody(req) : {};
			writeJson(res, 200, await invoke(body, req));
		} catch (error) {
			writeFailure(res, error);
		}
	};
	return {
		state: wrap("GET", () => core.getState()),
		password: wrap("POST", (body) => core.password(body)),
		unlock: wrap("POST", (body) => core.unlock(body)),
		checkToken: wrap("POST", (body) => core.checkToken(body)),
		pinWorkspace: wrap("POST", (body) => core.pinWorkspace(body)),
		hidden: wrap("POST", (body) => core.hidden(body)),
		encrypt: wrap("POST", (body) => core.encrypt(body)),
		createHidden: wrap("POST", (body) => core.createHidden(body))
	};
}

/** Exact route bindings in API.md order. */
const ROUTE_BINDINGS = Object.freeze([
	{ path: STATE_PATH, handler: "state", label: "state" },
	{ path: PASSWORD_PATH, handler: "password", label: "password" },
	{ path: UNLOCK_PATH, handler: "unlock", label: "unlock" },
	{ path: CHECK_TOKEN_PATH, handler: "checkToken", label: "check-token" },
	{ path: PIN_WORKSPACE_PATH, handler: "pinWorkspace", label: "pin-workspace" },
	{ path: HIDDEN_PATH, handler: "hidden", label: "hidden" },
	{ path: ENCRYPT_PATH, handler: "encrypt", label: "encrypt" },
	{ path: CREATE_HIDDEN_PATH, handler: "createHidden", label: "create-hidden" }
]);

// ---------------------------------------------------------------------------
// Cordis plugin entry
// ---------------------------------------------------------------------------

/** Read one optional service from the context. */
function serviceOf(ctx, serviceName) {
	try {
		if (typeof ctx?.get === "function") {
			const value = ctx.get(serviceName);
			if (value !== undefined && value !== null) return value;
		}
	} catch {
		// fall through
	}
	try {
		return ctx?.[serviceName];
	} catch {
		return undefined;
	}
}

/**
 * Retry applying the saved pin order until the registry has workspaces, so a
 * restart restores the pinned order once the registry finishes booting.
 * Returns a disposer for `ctx.effect`.
 * @param core - vault core.
 * @param options.logger - optional logger.
 * @param options.intervalMs - retry interval.
 * @param options.maxAttempts - retry cap.
 */
export function startPinnedOrderScheduler(core, options = {}) {
	const logger = options.logger ?? {};
	const intervalMs = Number.isFinite(options.intervalMs) && options.intervalMs >= 0 ? options.intervalMs : PIN_ORDER_RETRY_MS;
	const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0 ? options.maxAttempts : PIN_ORDER_MAX_ATTEMPTS;
	let attempts = 0;
	let timer = null;
	let disposed = false;

	const schedule = () => {
		if (disposed) return;
		timer = setTimeout(() => {
			timer = null;
			void tick();
		}, intervalMs);
		timer.unref?.();
	};

	const tick = async () => {
		if (disposed) return;
		attempts += 1;
		try {
			const state = await core.readState();
			if (state.pinnedWorkspaceIds.length === 0) return;
			const order = await core.applyPinnedOrder({ state });
			if (order.length > 0) return;
		} catch (error) {
			logger.warn?.(`[dsh-workspace-vault] pinned order retry failed: ${messageOf(error)}`);
		}
		if (disposed || attempts >= maxAttempts) return;
		schedule();
	};

	// First attempt as soon as the microtask queue allows, then retry.
	timer = setTimeout(() => {
		timer = null;
		void tick();
	}, 0);
	timer.unref?.();

	return () => {
		disposed = true;
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};
}

/**
 * Mount the plugin: register the eight exact routes and the startup
 * pin-order retry, each through `ctx.effect` so unload/dispose cleans up.
 * Every registration is guarded: a missing service or a duplicate route logs a
 * warning instead of escaping into the loader.
 * @param ctx - Cordis host context.
 */
export function apply(ctx) {
	const logger = ctx?.logger;
	const core = createCore({
		getRegistry: () => serviceOf(ctx, "workspaceRegistry"),
		env: process.env,
		logger
	});

	const webServer = serviceOf(ctx, "webServer");
	if (webServer !== undefined && typeof webServer.register === "function" && typeof ctx?.effect === "function") {
		const handlers = createRouteHandlers(core);
		for (const binding of ROUTE_BINDINGS) {
			try {
				ctx.effect(
					() => webServer.register({ kind: "exact", path: binding.path, handler: handlers[binding.handler] }),
					`dsh-workspace-vault: ${binding.label} route`
				);
			} catch (error) {
				logger?.warn?.(`[dsh-workspace-vault] route ${binding.path} not mounted: ${messageOf(error)}`);
			}
		}
		logger?.info?.("[dsh-workspace-vault] routes mounted");
	} else {
		logger?.warn?.("[dsh-workspace-vault] ctx.webServer is unavailable; HTTP routes are not mounted");
	}

	if (typeof ctx?.effect === "function") {
		try {
			ctx.effect(() => startPinnedOrderScheduler(core, { logger }), "dsh-workspace-vault: pinned workspace order");
		} catch (error) {
			logger?.warn?.(`[dsh-workspace-vault] pinned order scheduler not mounted: ${messageOf(error)}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Test seam
// ---------------------------------------------------------------------------

/**
 * Implementation details exported for `tests/host.test.mjs`. Not part of the
 * client/host contract.
 */
export const __test = Object.freeze({
	name,
	inject,
	STATE_VERSION,
	TOKEN_TTL_MS,
	MAX_NAME_LENGTH,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH,
	SCRYPT,
	PIN_ORDER_RETRY_MS,
	PIN_ORDER_MAX_ATTEMPTS,
	ROUTE_BINDINGS,
	VaultError,
	resolveHome,
	statePaths,
	defaultState,
	normalizeState,
	validatePassword,
	validateName,
	hashPassword,
	verifyPassword,
	normalizePhone,
	maskPhone,
	phoneRecord,
	createTokenStore,
	createStateStore,
	createCore,
	createRouteHandlers,
	startPinnedOrderScheduler,
	apply
});
