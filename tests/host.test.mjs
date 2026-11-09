/**
 * Host-half unit tests for dsh-workspace-vault (API.md §2/§3/§4).
 *
 * Run with the DSH runtime Node (v24):
 *   node --test tests/host.test.mjs
 *   node tests/host.test.mjs
 *
 * Every test drives the production core against a temporary DSH home; nothing
 * touches the real `~/.dsh` except the two `apply()` tests, which point
 * `process.env.DSH_HOME` at a temp directory and restore it afterwards.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import * as vault from "../lib/index.js";

const H = vault.__test;
const PASSWORD = "vault-pass-123";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tempHome(t) {
	const home = await mkdtemp(join(tmpdir(), "dsh-vault-host-"));
	t.after(async () => {
		await rm(home, { recursive: true, force: true });
	});
	return home;
}

async function tempDir(t, prefix = "dsh-vault-base-") {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	t.after(async () => {
		await rm(dir, { recursive: true, force: true });
	});
	return dir;
}

/** Point process.env.DSH_HOME at a temp home for the duration of one test. */
async function useTempEnv(t) {
	const home = await tempHome(t);
	const previous = process.env.DSH_HOME;
	process.env.DSH_HOME = home;
	t.after(() => {
		if (previous === undefined) delete process.env.DSH_HOME;
		else process.env.DSH_HOME = previous;
	});
	return home;
}

function createCore(home, extra = {}) {
	return H.createCore({ env: { DSH_HOME: home }, ...extra });
}

/** In-memory registry double exposing the exact subset the vault uses. */
function fakeRegistry(ids = []) {
	const order = [...ids];
	const calls = [];
	const snapshot = () => order.map((id) => ({ id, path: `C:\\ws\\${id}`, title: id }));
	return {
		order,
		calls,
		workspaces: {
			get order() {
				return order;
			}
		},
		list: () => snapshot(),
		get: (id) => snapshot().find((workspace) => workspace.id === id),
		async insertBefore(id, beforeId) {
			calls.push([id, beforeId ?? null]);
			const from = order.indexOf(id);
			assert.notEqual(from, -1, `insertBefore received an unknown id: ${id}`);
			order.splice(from, 1);
			if (beforeId === undefined) {
				order.push(id);
				return [...order];
			}
			const to = order.indexOf(beforeId);
			if (to === -1) order.push(id);
			else order.splice(to, 0, id);
			return [...order];
		}
	};
}

async function setupPassword(core, password = PASSWORD, phone) {
	const body = { action: "setup", password };
	if (phone !== undefined) body.phone = phone;
	return core.password(body);
}

async function issueToken(core, password = PASSWORD) {
	const result = await core.unlock({ password });
	return result.token;
}

async function rejection(promise) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	return null;
}

function assertCode(error, code) {
	assert.ok(error instanceof H.VaultError, `expected a VaultError, got ${String(error)}`);
	assert.equal(error.code, code);
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 1000) {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (predicate()) return;
		await delay(20);
	}
	assert.fail("condition was not reached before the timeout");
}

function stateFile(home) {
	return join(home, "workspace-vault", "state.json");
}

async function readStateFile(home) {
	return JSON.parse(await readFile(stateFile(home), "utf8"));
}

/** Minimal IncomingMessage double for the route handlers. */
function fakeRequest({ method = "GET", body, raw } = {}) {
	const text = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : "";
	return {
		method,
		async *[Symbol.asyncIterator]() {
			if (text.length > 0) yield Buffer.from(text, "utf8");
		}
	};
}

/** Minimal ServerResponse double that records status/headers and parsed JSON. */
function fakeResponse() {
	const res = {
		status: null,
		headers: null,
		payload: undefined,
		headersSent: false,
		writeHead(status, headers) {
			res.status = status;
			res.headers = headers;
			res.headersSent = true;
		},
		end(text) {
			res.payload = text === undefined ? undefined : JSON.parse(text);
		},
		destroy() {}
	};
	return res;
}

async function callRoute(handler, request) {
	const res = fakeResponse();
	await handler(request, res);
	return res;
}

/** Fake web server: exact routes, duplicate detection, disposers. */
function fakeServer() {
	const routes = [];
	return {
		routes,
		register(route) {
			if (routes.some((existing) => existing.kind === route.kind && existing.path === route.path)) {
				throw new Error(`duplicate route: ${route.kind} ${route.path}`);
			}
			routes.push(route);
			return () => {
				const index = routes.indexOf(route);
				if (index >= 0) routes.splice(index, 1);
			};
		}
	};
}

/** Fake Cordis context: records effect labels, runs each callback, keeps disposers. */
function fakeContext(services = {}) {
	const context = {
		effects: [],
		disposers: [],
		effect(callback, label) {
			context.effects.push(label);
			const cleanup = callback();
			if (typeof cleanup === "function") context.disposers.push(cleanup);
			return cleanup;
		},
		get(serviceName) {
			return services[serviceName];
		},
		...services
	};
	return context;
}

function disposeAll(context) {
	for (const dispose of [...context.disposers].reverse()) {
		try {
			dispose();
		} catch {
			// cleanup must never throw out of the test
		}
	}
}

// ---------------------------------------------------------------------------
// State, paths, projections
// ---------------------------------------------------------------------------

test("state projection starts at defaults and reads do not create the file", async (t) => {
	const home = await tempHome(t);
	assert.equal(H.resolveHome({ DSH_HOME: "~" }), homedir());
	const paths = H.statePaths({ DSH_HOME: home });
	assert.equal(paths.root, join(home, "workspace-vault"));
	assert.equal(paths.file, stateFile(home));
	assert.equal(paths.hiddenRoot, join(home, "hidden-space"));

	const core = createCore(home);
	const state = await core.getState();
	assert.deepEqual(state, {
		ok: true,
		version: 1,
		hasPassword: false,
		phone: null,
		hiddenWorkspaceIds: [],
		encryptedWorkspaceIds: [],
		pinnedWorkspaceIds: [],
		hiddenRoot: join(home, "hidden-space")
	});
	await assert.rejects(readFile(stateFile(home), "utf8"), { code: "ENOENT" });
});

test("setup stores a scrypt record, a hashed phone and no plaintext password", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	const result = await setupPassword(core, "secret-pass", "13800138000");
	assert.deepEqual(result, { ok: true, hasPassword: true, phone: { masked: "138****8000" } });

	const raw = await readFile(stateFile(home), "utf8");
	assert.equal(raw.includes("secret-pass"), false);
	const document = JSON.parse(raw);
	assert.equal(document.version, 1);
	assert.equal(document.password.algorithm, "scrypt");
	assert.match(document.password.salt, /^[0-9a-f]{32}$/);
	assert.match(document.password.hash, /^[0-9a-f]{128}$/);
	assert.deepEqual(
		{ N: document.password.N, r: document.password.r, p: document.password.p, keylen: document.password.keylen },
		{ N: 16384, r: 8, p: 1, keylen: 64 }
	);
	assert.equal(document.phone.hash, createHash("sha256").update("13800138000").digest("hex"));
	assert.equal(document.phone.masked, "138****8000");
	// Atomic write: no temp file survives.
	const entries = await readdir(join(home, "workspace-vault"));
	assert.deepEqual(entries.filter((entry) => entry.includes(".tmp-")), []);

	const state = await core.getState();
	assert.equal(state.hasPassword, true);
	assert.deepEqual(state.phone, { masked: "138****8000" });
});

test("setup rejects invalid passwords and reports already-configured", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	assertCode(await rejection(core.password({ action: "setup", password: "abc" })), "invalid-password");
	assertCode(await rejection(core.password({ action: "setup", password: "x".repeat(129) })), "invalid-password");
	assertCode(await rejection(core.password({ action: "setup" })), "invalid-password");
	assertCode(await rejection(core.password({})), "bad-request");
	assertCode(await rejection(core.password({ action: "nope", password: PASSWORD })), "bad-request");

	await setupPassword(core);
	assertCode(await rejection(core.password({ action: "setup", password: "other-pass" })), "already-configured");
});

test("change verifies the current password and rotates salt/hash", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	await setupPassword(core, "old-pass");
	const before = await readStateFile(home);

	assertCode(await rejection(core.password({ action: "change", currentPassword: "wrong", password: "new-pass" })), "bad-password");
	assertCode(await rejection(core.password({ action: "change", currentPassword: "old-pass", password: "a" })), "invalid-password");

	const result = await core.password({ action: "change", currentPassword: "old-pass", password: "new-pass" });
	assert.deepEqual(result, { ok: true, hasPassword: true, phone: null });

	const after = await readStateFile(home);
	assert.notEqual(after.password.salt, before.password.salt);
	assert.notEqual(after.password.hash, before.password.hash);
	assertCode(await rejection(core.unlock({ password: "old-pass" })), "bad-password");
	assert.equal((await core.unlock({ password: "new-pass" })).ok, true);
});

test("recover: no-phone, bad-phone, then success invalidates every token", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	await setupPassword(core, "first-pass", "13800138000");
	const token = await issueToken(core, "first-pass");

	assertCode(await rejection(core.password({ action: "recover", phone: "13900139000", password: "reset-pass" })), "bad-phone");
	assertCode(await rejection(core.password({ action: "recover", phone: "nope", password: "reset-pass" })), "bad-request");

	const result = await core.password({ action: "recover", phone: "138-0013-8000", password: "reset-pass" });
	assert.deepEqual(result, { ok: true, hasPassword: true, phone: { masked: "138****8000" } });

	// Old tokens die, the old password stops working, the new one works.
	assertCode(await rejection(core.checkToken({ token })), "token-invalid");
	assertCode(await rejection(core.unlock({ password: "first-pass" })), "bad-password");
	assert.equal((await core.unlock({ password: "reset-pass" })).ok, true);

	// Recover without a configured password is the vague bad-password.
	const bare = createCore(await tempHome(t));
	assertCode(await rejection(bare.password({ action: "recover", phone: "13800138000", password: "reset-pass" })), "bad-password");
});

test("unlock issues a fixed 30-minute token and check-token rejects invalid/expired ones", async (t) => {
	const home = await tempHome(t);
	let clock = 1_700_000_000_000;
	const core = createCore(home, { now: () => clock });

	assertCode(await rejection(core.unlock({ password: "whatever" })), "bad-password");
	await setupPassword(core);
	assertCode(await rejection(core.unlock({ password: "wrong-pass" })), "bad-password");

	const issued = await core.unlock({ password: PASSWORD });
	assert.equal(issued.ok, true);
	assert.equal(typeof issued.token, "string");
	assert.equal(issued.expiresAt, clock + 30 * 60 * 1000);
	assert.deepEqual(await core.checkToken({ token: issued.token }), { ok: true });
	assertCode(await rejection(core.checkToken({ token: randomUUID() })), "token-invalid");
	assertCode(await rejection(core.checkToken({})), "token-invalid");

	clock += 30 * 60 * 1000;
	assertCode(await rejection(core.checkToken({ token: issued.token })), "token-invalid");

	const second = await core.unlock({ password: PASSWORD });
	assert.equal(second.expiresAt, clock + 30 * 60 * 1000);
});

test("concurrent password mutations are serialized: exactly one setup wins", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	const results = await Promise.allSettled([
		core.password({ action: "setup", password: "first-pass" }),
		core.password({ action: "setup", password: "second-pass" })
	]);
	const fulfilled = results.filter((result) => result.status === "fulfilled");
	const rejected = results.filter((result) => result.status === "rejected");
	assert.equal(fulfilled.length, 1);
	assert.equal(rejected.length, 1);
	assertCode(rejected[0].reason, "already-configured");

	const accepted = [];
	for (const password of ["first-pass", "second-pass"]) {
		const error = await rejection(core.unlock({ password }));
		if (error === null) accepted.push(password);
	}
	assert.equal(accepted.length, 1);
});

test("a corrupt state file is backed up as state.json.broken-<ts> and falls back to defaults", async (t) => {
	const home = await tempHome(t);
	const root = join(home, "workspace-vault");
	await mkdir(root, { recursive: true });
	await writeFile(stateFile(home), "{ this is not json", "utf8");

	const core = createCore(home);
	const state = await core.getState();
	assert.equal(state.hasPassword, false);
	assert.deepEqual(state.pinnedWorkspaceIds, []);

	const backups = (await readdir(root)).filter((entry) => entry.startsWith("state.json.broken-"));
	assert.equal(backups.length, 1);
	assert.equal(await readFile(join(root, backups[0]), "utf8"), "{ this is not json");

	// The store keeps working from the default state after the backup.
	await setupPassword(core);
	assert.equal((await core.getState()).hasPassword, true);

	// Structurally wrong JSON (an array) is backed up too.
	const other = await tempHome(t);
	await mkdir(join(other, "workspace-vault"), { recursive: true });
	await writeFile(stateFile(other), "[1,2,3]", "utf8");
	const otherCore = createCore(other);
	assert.equal((await otherCore.getState()).hasPassword, false);
	const otherBackups = (await readdir(join(other, "workspace-vault"))).filter((entry) => entry.startsWith("state.json.broken-"));
	assert.equal(otherBackups.length, 1);
});

test("unknown state fields survive mutations, and pin/hidden/encrypt persist across reload", async (t) => {
	const home = await tempHome(t);
	const root = join(home, "workspace-vault");
	await mkdir(root, { recursive: true });
	await writeFile(
		stateFile(home),
		JSON.stringify({ version: 1, customFlag: { keep: true }, pinnedWorkspaceIds: ["w1"] }),
		"utf8"
	);

	const core = createCore(home, { getRegistry: () => fakeRegistry(["w1", "w2"]) });
	await setupPassword(core);
	let document = await readStateFile(home);
	assert.deepEqual(document.customFlag, { keep: true });
	assert.deepEqual(document.pinnedWorkspaceIds, ["w1"]);

	const token = await issueToken(core);
	assert.deepEqual((await core.hidden({ token, workspaceId: "w1", hidden: true })).hiddenWorkspaceIds, ["w1"]);
	assert.deepEqual((await core.encrypt({ token, workspaceId: "w2", encrypted: true })).encryptedWorkspaceIds, ["w2"]);

	const reloaded = createCore(home, { getRegistry: () => fakeRegistry(["w1", "w2"]) });
	const state = await reloaded.getState();
	assert.equal(state.hasPassword, true);
	assert.deepEqual(state.pinnedWorkspaceIds, ["w1"]);
	assert.deepEqual(state.hiddenWorkspaceIds, ["w1"]);
	assert.deepEqual(state.encryptedWorkspaceIds, ["w2"]);

	document = await readStateFile(home);
	assert.deepEqual(document.customFlag, { keep: true });
});

// ---------------------------------------------------------------------------
// hidden / encrypt
// ---------------------------------------------------------------------------

test("hidden/encrypt require a token, validate workspace ids and dedupe", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home, { getRegistry: () => fakeRegistry(["w1", "w2"]) });
	await setupPassword(core);

	assertCode(await rejection(core.hidden({ workspaceId: "w1", hidden: true })), "token-invalid");
	const token = await issueToken(core);
	assertCode(await rejection(core.hidden({ token, workspaceId: "nope", hidden: true })), "unknown-workspace");
	assertCode(await rejection(core.hidden({ token, workspaceId: "", hidden: true })), "bad-request");
	assertCode(await rejection(core.hidden({ token, workspaceId: "w1", hidden: "yes" })), "bad-request");

	assert.deepEqual((await core.hidden({ token, workspaceId: "w1", hidden: true })).hiddenWorkspaceIds, ["w1"]);
	assert.deepEqual((await core.hidden({ token, workspaceId: "w2", hidden: true })).hiddenWorkspaceIds, ["w1", "w2"]);
	assert.deepEqual((await core.hidden({ token, workspaceId: "w1", hidden: true })).hiddenWorkspaceIds, ["w1", "w2"]);
	assert.deepEqual((await core.hidden({ token, workspaceId: "w1", hidden: false })).hiddenWorkspaceIds, ["w2"]);
	assert.deepEqual((await core.encrypt({ token, workspaceId: "w2", encrypted: true })).encryptedWorkspaceIds, ["w2"]);
	assert.deepEqual((await core.encrypt({ token, workspaceId: "w2", encrypted: false })).encryptedWorkspaceIds, []);
});

// ---------------------------------------------------------------------------
// pin-workspace / registry order
// ---------------------------------------------------------------------------

test("pin-workspace keeps MRU order and applies it through stepwise insertBefore", async (t) => {
	const home = await tempHome(t);
	const registry = fakeRegistry(["w1", "w2", "w3", "w4"]);
	const core = createCore(home, { getRegistry: () => registry });

	assertCode(await rejection(core.pinWorkspace({ workspaceId: "nope", pinned: true })), "unknown-workspace");
	assertCode(await rejection(core.pinWorkspace({ workspaceId: "w1", pinned: "yes" })), "bad-request");
	assertCode(await rejection(core.pinWorkspace({ pinned: true })), "bad-request");

	const first = await core.pinWorkspace({ workspaceId: "w3", pinned: true });
	assert.deepEqual(first.pinnedWorkspaceIds, ["w3"]);
	assert.deepEqual(first.order, ["w3", "w1", "w2", "w4"]);
	assert.deepEqual(registry.order, ["w3", "w1", "w2", "w4"]);
	assert.ok(registry.calls.length > 0, "the reorder went through insertBefore");

	const second = await core.pinWorkspace({ workspaceId: "w1", pinned: true });
	assert.deepEqual(second.pinnedWorkspaceIds, ["w1", "w3"]);
	assert.deepEqual(registry.order, ["w1", "w3", "w2", "w4"]);
	assert.deepEqual(second.order, registry.order);
	assert.deepEqual((await readStateFile(home)).pinnedWorkspaceIds, ["w1", "w3"]);

	// Re-pinning the head is idempotent.
	const third = await core.pinWorkspace({ workspaceId: "w1", pinned: true });
	assert.deepEqual(third.pinnedWorkspaceIds, ["w1", "w3"]);
	assert.deepEqual(registry.order, ["w1", "w3", "w2", "w4"]);

	// Unpinning puts the workspace at the front of the non-pinned block.
	const unpinned = await core.pinWorkspace({ workspaceId: "w1", pinned: false });
	assert.deepEqual(unpinned.pinnedWorkspaceIds, ["w3"]);
	assert.deepEqual(unpinned.order, ["w3", "w1", "w2", "w4"]);
	assert.deepEqual(registry.order, ["w3", "w1", "w2", "w4"]);

	// Unpinning a never-pinned workspace changes nothing.
	const untouched = await core.pinWorkspace({ workspaceId: "w2", pinned: false });
	assert.deepEqual(untouched.pinnedWorkspaceIds, ["w3"]);
	assert.deepEqual(registry.order, ["w3", "w1", "w2", "w4"]);
});

test("applyPinnedOrder restores saved pins once the registry is available", async (t) => {
	const home = await tempHome(t);
	const seedRegistry = fakeRegistry(["a", "b", "c"]);
	const seed = createCore(home, { getRegistry: () => seedRegistry });
	await seed.pinWorkspace({ workspaceId: "c", pinned: true });
	await seed.pinWorkspace({ workspaceId: "b", pinned: true });
	assert.deepEqual(seedRegistry.order, ["b", "c", "a"]);

	// Fresh boot with an empty registry: nothing to apply yet, no crash.
	const bootedRegistry = fakeRegistry([]);
	const booted = createCore(home, { getRegistry: () => bootedRegistry });
	assert.deepEqual(await booted.applyPinnedOrder(), []);

	// Registry comes up with its own order; the saved pins are re-applied.
	bootedRegistry.order.push("a", "b", "c");
	const restored = await booted.applyPinnedOrder();
	assert.deepEqual(restored, ["b", "c", "a"]);
	assert.deepEqual(bootedRegistry.order, ["b", "c", "a"]);
	assert.deepEqual((await booted.getState()).pinnedWorkspaceIds, ["b", "c"]);

	// Stale pinned ids are tolerated (skipped) and the order still normalizes.
	const staleRegistry = fakeRegistry(["a", "b"]);
	const stale = createCore(home, { getRegistry: () => staleRegistry });
	assert.deepEqual(await stale.applyPinnedOrder(), ["b", "a"]);
});

test("startPinnedOrderScheduler retries until the registry has workspaces", async (t) => {
	const home = await tempHome(t);
	const seedRegistry = fakeRegistry(["a", "b", "c"]);
	const seed = createCore(home, { getRegistry: () => seedRegistry });
	await seed.pinWorkspace({ workspaceId: "c", pinned: true });

	const lateRegistry = fakeRegistry([]);
	const core = createCore(home, { getRegistry: () => lateRegistry });
	const dispose = H.startPinnedOrderScheduler(core, { intervalMs: 20, maxAttempts: 50 });
	try {
		await delay(60);
		assert.deepEqual(lateRegistry.order, []);
		lateRegistry.order.push("a", "b", "c");
		await waitFor(() => lateRegistry.order.join(",") === "c,a,b", 2000);
		assert.deepEqual(lateRegistry.order, ["c", "a", "b"]);
	} finally {
		dispose();
	}
});

// ---------------------------------------------------------------------------
// create-hidden
// ---------------------------------------------------------------------------

test("create-hidden rejects invalid names with invalid-name", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	await setupPassword(core);
	const token = await issueToken(core);

	const invalidNames = [
		"",
		"   ",
		".",
		"..",
		"a/b",
		"a\\b",
		"bad:name",
		"bad*name",
		"bad?name",
		"bad|name",
		'bad"name',
		"bad<name>",
		"trail.",
		"x".repeat(81),
		"a\u0000b",
		"con",
		"CON",
		"con.txt",
		"aux",
		"nul",
		"com1",
		"lpt9"
	];
	for (const candidate of invalidNames) {
		const error = await rejection(core.createHidden({ token, name: candidate }));
		assertCode(error, "invalid-name");
	}
});

test("create-hidden creates an absolute canonical directory, reuses it and never overwrites", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	await setupPassword(core);
	const token = await issueToken(core);

	const created = await core.createHidden({ token, name: "秘密 项目" });
	assert.deepEqual(created, { ok: true, path: await realpath(join(home, "hidden-space", "秘密 项目")), name: "秘密 项目" });
	assert.equal((await lstat(created.path)).isDirectory(), true);

	await writeFile(join(created.path, "keep.txt"), "keep", "utf8");
	const reused = await core.createHidden({ token, name: "秘密 项目" });
	assert.equal(reused.path, created.path);
	assert.equal(await readFile(join(created.path, "keep.txt"), "utf8"), "keep");

	// Leading/trailing whitespace is trimmed by the name rule.
	const trimmed = await core.createHidden({ token, name: "  padded  " });
	assert.equal(trimmed.name, "padded");

	// An existing file with the same name is a conflict, not a directory to adopt.
	await writeFile(join(home, "hidden-space", "conflict"), "file", "utf8");
	assertCode(await rejection(core.createHidden({ token, name: "conflict" })), "name-taken");

	assert.equal((await core.getState()).hiddenRoot, join(home, "hidden-space"));
});

test("create-hidden honors an absolute baseDir and requires a valid token", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	await setupPassword(core);
	const token = await issueToken(core);
	const base = await tempDir(t);

	assertCode(await rejection(core.createHidden({ name: "x" })), "token-invalid");
	const created = await core.createHidden({ token, name: "x", baseDir: base });
	assert.equal(created.path, await realpath(join(base, "x")));
	assert.equal((await core.createHidden({ token, name: "x", baseDir: base })).path, created.path);
	assertCode(await rejection(core.createHidden({ token, name: "x", baseDir: "relative/dir" })), "bad-request");
});

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

test("routes follow API.md: 405 on wrong method, 400 on malformed JSON, 200 + flat envelope on business failure", async (t) => {
	const home = await tempHome(t);
	const core = createCore(home);
	const handlers = H.createRouteHandlers(core);

	const stateResponse = await callRoute(handlers.state, fakeRequest({ method: "GET" }));
	assert.equal(stateResponse.status, 200);
	assert.equal(stateResponse.headers["content-type"], "application/json; charset=utf-8");
	assert.equal(stateResponse.payload.ok, true);
	assert.equal(stateResponse.payload.hasPassword, false);

	const wrongMethod = await callRoute(handlers.unlock, fakeRequest({ method: "GET" }));
	assert.equal(wrongMethod.status, 405);
	assert.deepEqual(wrongMethod.payload, { ok: false, code: "method-not-allowed", message: "请使用 POST" });

	const malformed = await callRoute(handlers.unlock, fakeRequest({ method: "POST", raw: "{oops" }));
	assert.equal(malformed.status, 400);
	assert.equal(malformed.payload.ok, false);
	assert.equal(malformed.payload.code, "bad-request");

	const arrayBody = await callRoute(handlers.unlock, fakeRequest({ method: "POST", raw: "[1,2]" }));
	assert.equal(arrayBody.status, 400);

	// Business failures keep HTTP 200 with the flat `{ ok:false, code, message }` envelope.
	const wrongPassword = await callRoute(handlers.unlock, fakeRequest({ method: "POST", body: { password: "nope" } }));
	assert.equal(wrongPassword.status, 200);
	assert.deepEqual(wrongPassword.payload, { ok: false, code: "bad-password", message: "尚未设置主密码，请先设置密码" });

	await callRoute(handlers.password, fakeRequest({ method: "POST", body: { action: "setup", password: PASSWORD } }));
	const unlocked = await callRoute(handlers.unlock, fakeRequest({ method: "POST", body: { password: PASSWORD } }));
	assert.equal(unlocked.payload.ok, true);
	assert.equal(typeof unlocked.payload.token, "string");
	assert.equal(typeof unlocked.payload.expiresAt, "number");

	const badToken = await callRoute(
		handlers.hidden,
		fakeRequest({ method: "POST", body: { token: "nope", workspaceId: "w1", hidden: true } })
	);
	assert.equal(badToken.status, 200);
	assert.equal(badToken.payload.code, "token-invalid");

	const emptyBody = await callRoute(handlers.checkToken, fakeRequest({ method: "POST" }));
	assert.deepEqual(emptyBody.payload, { ok: false, code: "token-invalid", message: "解锁令牌无效或已过期，请重新解锁" });
});

// ---------------------------------------------------------------------------
// Cordis entry
// ---------------------------------------------------------------------------

test("plugin exports the loader contract and the client-facing route paths", () => {
	assert.equal(vault.name, "dsh-workspace-vault");
	assert.deepEqual(vault.inject, ["webServer", "workspaceRegistry"]);
	assert.deepEqual(
		H.ROUTE_BINDINGS.map((binding) => binding.path),
		[
			"/api/workspace-vault/state",
			"/api/workspace-vault/password",
			"/api/workspace-vault/unlock",
			"/api/workspace-vault/check-token",
			"/api/workspace-vault/pin-workspace",
			"/api/workspace-vault/hidden",
			"/api/workspace-vault/encrypt",
			"/api/workspace-vault/create-hidden"
		]
	);
	assert.equal(typeof vault.apply, "function");
});

test("apply mounts all eight exact routes through ctx.effect and cleans them up", async (t) => {
	await useTempEnv(t);
	const server = fakeServer();
	const ctx = fakeContext({ webServer: server });
	assert.doesNotThrow(() => vault.apply(ctx));
	assert.equal(server.routes.length, 8);
	assert.deepEqual(
		server.routes.map((route) => `${route.kind} ${route.path}`),
		H.ROUTE_BINDINGS.map((binding) => `exact ${binding.path}`)
	);
	assert.equal(ctx.effects.filter((label) => label.endsWith("route")).length, 8);
	disposeAll(ctx);
	assert.equal(server.routes.length, 0);
});

test("apply never throws when services are missing or registration fails", async (t) => {
	await useTempEnv(t);
	assert.doesNotThrow(() => vault.apply({}));

	const ctx = fakeContext({
		webServer: {
			register() {
				throw new Error("duplicate route");
			}
		}
	});
	assert.doesNotThrow(() => vault.apply(ctx));
	disposeAll(ctx);
});

test("apply() retries the saved pinned order after the registry becomes available", async (t) => {
	const home = await useTempEnv(t);
	const seedRegistry = fakeRegistry(["a", "b", "c"]);
	await createCore(home, { getRegistry: () => seedRegistry }).pinWorkspace({ workspaceId: "c", pinned: true });

	const server = fakeServer();
	const lateRegistry = fakeRegistry([]);
	const ctx = fakeContext({ webServer: server, workspaceRegistry: lateRegistry });
	assert.doesNotThrow(() => vault.apply(ctx));
	assert.equal(server.routes.length, 8);

	try {
		await delay(40);
		assert.deepEqual(lateRegistry.order, []);
		lateRegistry.order.push("a", "b", "c");
		await waitFor(() => lateRegistry.order.join(",") === "c,a,b", 2000);
		assert.deepEqual(lateRegistry.order, ["c", "a", "b"]);
	} finally {
		disposeAll(ctx);
	}
});
