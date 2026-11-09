window.__ModuleLoader__.load({
	id: 'dsh-workspace-vault',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		// ==== Module table externals ==========================================
		var React = require('react');
		var primitives = null;
		try {
			primitives = require('@deepseek-ai/dsh-client-ui-primitives');
		} catch (error) {
			primitives = null;
		}

		// ==== Identity ========================================================
		var PLUGIN_ID = 'dsh-workspace-vault';
		var NS = 'dsh-workspace-vault';
		var STATE_PATH = 'api/workspace-vault/state';
		var PASSWORD_PATH = 'api/workspace-vault/password';
		var UNLOCK_PATH = 'api/workspace-vault/unlock';
		var CHECK_TOKEN_PATH = 'api/workspace-vault/check-token';
		var PIN_WORKSPACE_PATH = 'api/workspace-vault/pin-workspace';
		var HIDDEN_PATH = 'api/workspace-vault/hidden';
		var ENCRYPT_PATH = 'api/workspace-vault/encrypt';
		var CREATE_HIDDEN_PATH = 'api/workspace-vault/create-hidden';
		var OVERLAY_SLOT = 'shell.overlay';
		var HEADER_ACTIONS_SLOT = 'conversation.session.header.actions';
		var STYLE_MARKER = PLUGIN_ID + '/client.css';
		var ATTR = 'data-dsh-workspace-vault';
		var HIDDEN_CLASS = 'dsh-workspace-vault-hidden';
		var TOKEN_TTL_MS = 30 * 60 * 1000;
		var DIALOG_ORDER = 610;
		var GUARD_ORDER = 605;
		var PIN_ACTIONS_ORDER = 500;
		var MENU_OVERLAY_ORDER = 615;
		var REAPPLY_THROTTLE_MS = 3000;
		// After an explicit pin/unpin, a stale reapply response must never be
		// allowed to overwrite the newer membership. The cooldown also keeps the
		// decorator from firing a reapply right behind the user's own action.
		var REAPPLY_PIN_COOLDOWN_MS = 5000;
		var PINNED_ATTR = 'data-dsh-workspace-vault-pinned';
		var CLIENT_VERSION = '0.1.0';

		// ==== Copy ============================================================
		var DICTS = {
			zh: {
				'hidden.toggle.enter': '隐藏空间',
				'hidden.toggle.exit': '退出隐藏空间',
				'hidden.banner.title': '隐藏空间',
				'hidden.banner.new': '新建隐藏工作区',
				'hidden.banner.exit': '退出',
				'setup.title': '设置主密码',
				'setup.intro': '密码和状态只保存在本机，用于隐藏空间与工作区加密；DSH 不会发送短信，也不会把密码写入日志。',
				'setup.password': '新密码',
				'setup.passwordPlaceholder': '4–128 个字符',
				'setup.confirm': '确认密码',
				'setup.phone': '手机号（可选）',
				'setup.phonePlaceholder': '仅用于本地找回',
				'setup.phoneHint': '留空则忘记密码后无法找回。',
				'setup.submit': '保存并进入',
				'unlock.title': '解锁保险库',
				'unlock.intro': '输入主密码以解锁隐藏空间与加密工作区。解锁令牌只保存在本页内存，刷新页面即重新上锁。',
				'unlock.password': '主密码',
				'unlock.submit': '解锁',
				'unlock.forgot': '忘记密码？',
				'unlock.cancel': '取消',
				'recover.title': '找回主密码',
				'recover.intro': '本地校验：输入绑定手机号并设置新密码。DSH 没有短信通道，不会发送验证码。',
				'recover.phone': '绑定手机号',
				'recover.password': '新密码',
				'recover.confirm': '确认新密码',
				'recover.submit': '重置并解锁',
				'recover.back': '返回解锁',
				'create.title': '新建隐藏工作区',
				'create.intro': '隐藏工作区不参与云同步，只留在本机；退出隐藏空间后从侧栏消失。',
				'create.name': '名称',
				'create.namePlaceholder': '例如：私人 / 草稿',
				'create.submit': '创建',
				'create.creating': '正在创建…',
				'encrypt.title': '加密工作区',
				'encrypt.intro': '输入主密码确认。加密是访问锁，不是磁盘静态加密：会话日志仍以 DSH 原生明文格式存放。',
				'encrypt.password': '主密码',
				'encrypt.submit': '加密',
				'encrypt.target': '目标：{title}',
				'row.pin': '置顶工作区',
				'row.unpin': '取消置顶',
				'row.encrypt': '加密工作区',
				'row.unlock': '解锁工作区',
				'row.decrypt': '取消加密',
				'row.hide': '移入隐藏空间',
				'row.unhide': '移出隐藏空间',
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
				'badge.hidden': '隐藏空间工作区',
				'error.renameRequired': '请输入名称',
				'error.renameFailed': '重命名失败：{message}',
				'error.deleteFailed': '删除失败：{message}',
				'badge.pinned': '已置顶',
				'badge.encrypted': '已加密',
				'task.pin': '置顶当前任务',
				'task.unpin': '取消置顶',
				'guard.hidden.title': '隐藏空间已上锁',
				'guard.hidden.body': '当前会话位于隐藏空间，解锁后才能显示内容。',
				'guard.encrypted.title': '工作区已加密',
				'guard.encrypted.body': '当前会话所在的工作区已加密，解锁后才能显示内容。',
				'guard.unlock': '解锁',
				'guard.leave': '离开',
				'guard.note': '页面刷新后自动重新上锁；访问锁不改变磁盘上的明文。',
				'error.passwordRequired': '请输入密码',
				'error.passwordRule': '密码需为 4–128 个字符',
				'error.passwordMismatch': '两次输入的密码不一致',
				'error.phoneFormat': '手机号需为 6–20 位数字',
				'error.phoneRequired': '请输入手机号',
				'error.nameRequired': '请输入名称',
				'error.badPassword': '密码错误',
				'error.invalidPassword': '密码需为 4–128 个字符',
				'error.tokenInvalid': '解锁令牌已过期，请重新解锁',
				'error.tokenRequired': '请先解锁',
				'error.noPhone': '未绑定手机号，无法找回',
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
			},
			en: {
				'hidden.toggle.enter': 'Hidden space',
				'hidden.toggle.exit': 'Leave hidden space',
				'hidden.banner.title': 'HIDDEN SPACE',
				'hidden.banner.new': 'New hidden workspace',
				'hidden.banner.exit': 'Exit',
				'setup.title': 'Set master password',
				'setup.intro': 'The password and vault state stay on this machine. It guards the hidden space and workspace locks; DSH never sends SMS or writes the password to a log.',
				'setup.password': 'New password',
				'setup.passwordPlaceholder': '4–128 characters',
				'setup.confirm': 'Confirm password',
				'setup.phone': 'Phone (optional)',
				'setup.phonePlaceholder': 'Used only for local recovery',
				'setup.phoneHint': 'Leave it empty and a forgotten password cannot be recovered.',
				'setup.submit': 'Save and enter',
				'unlock.title': 'Unlock the vault',
				'unlock.intro': 'Enter the master password to unlock the hidden space and locked workspaces. The token lives in this page’s memory only; a page refresh locks everything again.',
				'unlock.password': 'Master password',
				'unlock.submit': 'Unlock',
				'unlock.forgot': 'Forgot password?',
				'unlock.cancel': 'Cancel',
				'recover.title': 'Recover master password',
				'recover.intro': 'Local check only: enter the bound phone number and a new password. DSH has no SMS channel and sends no code.',
				'recover.phone': 'Bound phone',
				'recover.password': 'New password',
				'recover.confirm': 'Confirm new password',
				'recover.submit': 'Reset and unlock',
				'recover.back': 'Back to unlock',
				'create.title': 'New hidden workspace',
				'create.intro': 'Hidden workspaces never sync to the cloud and stay on this machine; they leave the sidebar when you exit the hidden space.',
				'create.name': 'Name',
				'create.namePlaceholder': 'e.g. Private / Draft',
				'create.submit': 'Create',
				'create.creating': 'Creating…',
				'encrypt.title': 'Lock workspace',
				'encrypt.intro': 'Confirm with the master password. This is an access lock, not disk encryption: session logs keep their native plaintext form.',
				'encrypt.password': 'Master password',
				'encrypt.submit': 'Lock',
				'encrypt.target': 'Target: {title}',
				'row.pin': 'Pin workspace',
				'row.unpin': 'Unpin workspace',
				'row.encrypt': 'Lock workspace',
				'row.unlock': 'Unlock workspace',
				'row.decrypt': 'Remove lock',
				'row.hide': 'Move to hidden space',
				'row.unhide': 'Move out of hidden space',
				'menu.aria': 'Workspace menu',
				'menu.rename': 'Rename',
				'menu.delete': 'Delete workspace',
				'rename.title': 'Rename workspace',
				'rename.label': 'Name',
				'rename.submit': 'Save',
				'rename.saving': 'Saving…',
				'delete.title': 'Delete workspace',
				'delete.intro': 'This removes “{title}” from the workspace list. The folder and session logs are kept; its sessions appear under Ungrouped.',
				'delete.submit': 'Delete',
				'delete.deleting': 'Deleting…',
				'badge.hidden': 'Hidden-space workspace',
				'error.renameRequired': 'Enter a name',
				'error.renameFailed': 'Rename failed: {message}',
				'error.deleteFailed': 'Delete failed: {message}',
				'badge.pinned': 'Pinned',
				'badge.encrypted': 'Locked',
				'task.pin': 'Pin this task',
				'task.unpin': 'Unpin this task',
				'guard.hidden.title': 'Hidden space is locked',
				'guard.hidden.body': 'The current session lives in the hidden space. Unlock it to show the content.',
				'guard.encrypted.title': 'Workspace is locked',
				'guard.encrypted.body': 'The current session belongs to a locked workspace. Unlock it to show the content.',
				'guard.unlock': 'Unlock',
				'guard.leave': 'Leave',
				'guard.note': 'A page refresh locks everything again; this access lock does not change the plaintext on disk.',
				'error.passwordRequired': 'Enter the password',
				'error.passwordRule': 'Password must be 4–128 characters',
				'error.passwordMismatch': 'Passwords do not match',
				'error.phoneFormat': 'Phone must be 6–20 digits',
				'error.phoneRequired': 'Enter the phone number',
				'error.nameRequired': 'Enter a name',
				'error.badPassword': 'Wrong password',
				'error.invalidPassword': 'Password must be 4–128 characters',
				'error.tokenInvalid': 'Unlock token expired; unlock again',
				'error.tokenRequired': 'Unlock first',
				'error.noPhone': 'No bound phone number; recovery is unavailable',
				'error.badPhone': 'Phone number does not match',
				'error.alreadyConfigured': 'A master password is already set',
				'error.nameTaken': 'Name already exists',
				'error.invalidName': 'Invalid name',
				'error.io': 'File-system operation failed',
				'error.badRequest': 'Invalid request',
				'error.unknownWorkspace': 'Unknown workspace',
				'error.generic': 'Failed: {message}',
				'error.serviceUnavailable': 'Service unavailable',
				'workspace.untitled': 'Untitled workspace',
			},
		};

		var boundT = null;

		function fallbackLang() {
			try {
				if (typeof navigator !== 'undefined' && navigator && typeof navigator.language === 'string' && /^en/i.test(navigator.language)) return 'en';
			} catch (error) { /* not a page context */ }
			return 'zh';
		}

		function translate(key, params) {
			if (boundT !== null) {
				try {
					var projected = boundT(key, params);
					if (typeof projected === 'string' && projected !== key) return projected;
				} catch (error) { /* fall through */ }
			}
			var dict = DICTS[fallbackLang()] || DICTS.zh;
			var template = dict[key];
			if (typeof template !== 'string') return key;
			if (params === undefined) return template;
			return template.replace(/\{(\w+)\}/g, function (match, name) {
				return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
			});
		}

		/** Prefer the host-provided translator, falling back to our own table. */
		function seatTranslate(seat) {
			if (typeof seat !== 'function') return translate;
			return function (key, params) {
				try {
					var projected = seat(key, params);
					if (typeof projected === 'string' && projected !== key) return projected;
				} catch (error) { /* fall through */ }
				return translate(key, params);
			};
		}

		function messageOf(reason) {
			if (reason instanceof Error && typeof reason.message === 'string') return reason.message;
			if (reason !== null && typeof reason === 'object' && typeof reason.message === 'string') return reason.message;
			return String(reason);
		}

		/** Host business errors carry a code; map the known ones onto our copy. */
		function errorText(reason) {
			var code = reason !== null && reason !== undefined && typeof reason === 'object' && typeof reason.code === 'string' ? reason.code : null;
			var keys = {
				'bad-password': 'error.badPassword',
				'invalid-password': 'error.invalidPassword',
				'token-invalid': 'error.tokenInvalid',
				'token-required': 'error.tokenRequired',
				'no-phone': 'error.noPhone',
				'bad-phone': 'error.badPhone',
				'already-configured': 'error.alreadyConfigured',
				'name-taken': 'error.nameTaken',
				'invalid-name': 'error.invalidName',
				'io-error': 'error.io',
				'bad-request': 'error.badRequest',
				'unknown-workspace': 'error.unknownWorkspace',
			};
			if (code !== null && typeof keys[code] === 'string') return translate(keys[code]);
			var message = messageOf(reason);
			return message === '' ? translate('error.generic', { message: 'unknown' }) : message;
		}

		// ==== Vault state (memory only for token / mode / unlocked) ============
		var state = {
			loaded: false,
			loading: false,
			error: null,
			hasPassword: false,
			phone: null,
			hiddenRoot: '',
			hiddenIds: [],
			encryptedIds: [],
			pinnedIds: [],
			/** Issued by POST unlock; never persisted. */
			token: null,
			tokenExpiresAt: 0,
			/** Whether the sidebar currently shows the hidden space. */
			hiddenMode: false,
			/** Workspace ids unlocked during this page session. */
			unlockedIds: [],
		};

		function normalizeIdList(value) {
			if (!Array.isArray(value)) return [];
			var out = [];
			for (var index = 0; index < value.length; index += 1) {
				var id = value[index];
				if (typeof id !== 'string' || id === '') continue;
				if (out.indexOf(id) === -1) out.push(id);
			}
			return out;
		}

		function normalizePhone(value) {
			if (typeof value !== 'string') return '';
			return value.replace(/\D/g, '');
		}

		function normalizePhoneInfo(phone) {
			if (phone === null || phone === undefined || typeof phone !== 'object') return null;
			if (typeof phone.masked !== 'string' || phone.masked === '') return null;
			return { masked: phone.masked };
		}

		/** Pure: GET /state body -> normalized snapshot (never throws). */
		function parseStatePayload(payload) {
			if (payload === null || payload === undefined || typeof payload !== 'object') return { ok: false };
			return {
				ok: payload.ok !== false,
				version: typeof payload.version === 'number' ? payload.version : 1,
				hasPassword: payload.hasPassword === true,
				phone: normalizePhoneInfo(payload.phone),
				hiddenWorkspaceIds: normalizeIdList(payload.hiddenWorkspaceIds),
				encryptedWorkspaceIds: normalizeIdList(payload.encryptedWorkspaceIds),
				pinnedWorkspaceIds: normalizeIdList(payload.pinnedWorkspaceIds),
				hiddenRoot: typeof payload.hiddenRoot === 'string' ? payload.hiddenRoot : '',
			};
		}

		function applyStatePayload(parsed) {
			if (parsed === null || parsed === undefined || parsed.ok !== true) return false;
			state.hasPassword = parsed.hasPassword === true;
			state.phone = parsed.phone || null;
			state.hiddenRoot = typeof parsed.hiddenRoot === 'string' ? parsed.hiddenRoot : '';
			state.hiddenIds = normalizeIdList(parsed.hiddenWorkspaceIds);
			state.encryptedIds = normalizeIdList(parsed.encryptedWorkspaceIds);
			state.pinnedIds = normalizeIdList(parsed.pinnedWorkspaceIds);
			return true;
		}

		function containsId(list, id) {
			if (!Array.isArray(list) || id === null || id === undefined) return false;
			return list.indexOf(id) !== -1;
		}

		function isHidden(id) { return containsId(state.hiddenIds, id); }
		function isEncrypted(id) { return containsId(state.encryptedIds, id); }
		function isUnlocked(id) { return containsId(state.unlockedIds, id); }
		function isPinned(id) { return containsId(state.pinnedIds, id); }

		function isTokenValid(now) {
			if (state.token === null || state.token === '') return false;
			var clock = typeof now === 'number' ? now : Date.now();
			return state.tokenExpiresAt > clock;
		}

		function resetPageSecrets() {
			state.token = null;
			state.tokenExpiresAt = 0;
			state.hiddenMode = false;
			state.unlockedIds = [];
		}

		function applyUnlockResult(payload) {
			var token = payload !== null && payload !== undefined && typeof payload.token === 'string' ? payload.token : '';
			if (token === '') throw new Error(translate('error.serviceUnavailable'));
			state.token = token;
			var expires = payload !== null && payload !== undefined && typeof payload.expiresAt === 'number' ? payload.expiresAt : 0;
			state.tokenExpiresAt = expires > 0 ? expires : Date.now() + TOKEN_TTL_MS;
			return token;
		}

		function applyHiddenResult(payload, fallback) {
			if (payload !== null && payload !== undefined && Array.isArray(payload.hiddenWorkspaceIds)) {
				state.hiddenIds = normalizeIdList(payload.hiddenWorkspaceIds);
			} else if (fallback !== null && fallback !== undefined && typeof fallback.workspaceId === 'string') {
				var next = state.hiddenIds.slice();
				var index = next.indexOf(fallback.workspaceId);
				if (fallback.hidden === true && index === -1) next.push(fallback.workspaceId);
				if (fallback.hidden !== true && index !== -1) next.splice(index, 1);
				state.hiddenIds = next;
			}
			return state.hiddenIds;
		}

		function applyEncryptedResult(payload, fallback) {
			if (payload !== null && payload !== undefined && Array.isArray(payload.encryptedWorkspaceIds)) {
				state.encryptedIds = normalizeIdList(payload.encryptedWorkspaceIds);
			} else if (fallback !== null && fallback !== undefined && typeof fallback.workspaceId === 'string') {
				var next = state.encryptedIds.slice();
				var index = next.indexOf(fallback.workspaceId);
				if (fallback.encrypted === true && index === -1) next.push(fallback.workspaceId);
				if (fallback.encrypted !== true && index !== -1) next.splice(index, 1);
				state.encryptedIds = next;
			}
			return state.encryptedIds;
		}

		function applyPinnedResult(payload) {
			if (payload !== null && payload !== undefined && Array.isArray(payload.pinnedWorkspaceIds)) {
				state.pinnedIds = normalizeIdList(payload.pinnedWorkspaceIds);
			}
			return state.pinnedIds;
		}

		function addUnlocked(workspaceId) {
			if (typeof workspaceId !== 'string' || workspaceId === '') return;
			if (state.unlockedIds.indexOf(workspaceId) === -1) state.unlockedIds = state.unlockedIds.concat([workspaceId]);
		}

		function removeUnlocked(workspaceId) {
			var index = state.unlockedIds.indexOf(workspaceId);
			if (index !== -1) state.unlockedIds = state.unlockedIds.slice(0, index).concat(state.unlockedIds.slice(index + 1));
		}

		// ==== Views (state + live services snapshots) =========================
		function getService(name) {
			if (pluginCtx === null || typeof pluginCtx.get !== 'function') return undefined;
			try {
				return pluginCtx.get(name);
			} catch (error) {
				return undefined;
			}
		}

		function workspacesSnapshot() {
			var workspaces = getService('workspaces');
			try {
				if (workspaces !== undefined && workspaces !== null && workspaces.list && typeof workspaces.list.getSnapshot === 'function') {
					return workspaces.list.getSnapshot();
				}
			} catch (error) { /* snapshot not ready */ }
			return null;
		}

		function sessionsSnapshot() {
			var sessions = getService('sessions');
			try {
				if (sessions !== undefined && sessions !== null && sessions.list && typeof sessions.list.getSnapshot === 'function') {
					return sessions.list.getSnapshot();
				}
			} catch (error) { /* snapshot not ready */ }
			return null;
		}

		function workspaceTitleOf(path) {
			if (typeof path !== 'string' || path === '') return '';
			var trimmed = path.replace(/[/\\]+$/, '');
			var separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
			return trimmed.slice(separator + 1);
		}

		function workspaceTitleById(workspaceId) {
			var snapshot = workspacesSnapshot();
			var items = snapshot !== null && Array.isArray(snapshot.items) ? snapshot.items : [];
			for (var index = 0; index < items.length; index += 1) {
				var item = items[index];
				if (item === null || typeof item !== 'object' || item.workspaceId !== workspaceId) continue;
				if (typeof item.title === 'string' && item.title !== '') return item.title;
				if (typeof item.label === 'string' && item.label !== '') return item.label;
				var fromPath = workspaceTitleOf(item.path);
				if (fromPath !== '') return fromPath;
			}
			return translate('workspace.untitled');
		}

		/** sessionId -> workspaceId map derived from `workspaces.list` snapshots. */
		function sessionWorkspaceMap(snapshot) {
			var map = {};
			var items = snapshot !== null && snapshot !== undefined && Array.isArray(snapshot.items) ? snapshot.items : [];
			for (var index = 0; index < items.length; index += 1) {
				var item = items[index];
				if (item === null || typeof item !== 'object') continue;
				var workspaceId = typeof item.workspaceId === 'string' ? item.workspaceId : '';
				if (workspaceId === '') continue;
				var sessionIds = Array.isArray(item.sessionIds) ? item.sessionIds : [];
				for (var cursor = 0; cursor < sessionIds.length; cursor += 1) {
					var sessionId = sessionIds[cursor];
					if (typeof sessionId === 'string' && map[sessionId] === undefined) map[sessionId] = workspaceId;
				}
			}
			return map;
		}

		/** The session currently retained by the main view (native derivation). */
		function mainSessionIdOf(snapshot) {
			if (snapshot === null || snapshot === undefined) return undefined;
			var byId = snapshot.byId;
			if (byId !== null && byId !== undefined && typeof byId === 'object') {
				var ids = Object.keys(byId);
				for (var index = 0; index < ids.length; index += 1) {
					var summary = byId[ids[index]];
					if (summary === null || summary === undefined || typeof summary !== 'object') continue;
					var retained = summary.retainedBy;
					if (retained !== null && retained !== undefined && typeof retained === 'object' && retained.mainView > 0) return ids[index];
				}
			}
			return undefined;
		}

		function viewOf(view) {
			var source = view !== null && view !== undefined && typeof view === 'object' ? view : {};
			return {
				hiddenMode: source.hiddenMode === true,
				hiddenIds: Array.isArray(source.hiddenIds) ? source.hiddenIds : [],
				encryptedIds: Array.isArray(source.encryptedIds) ? source.encryptedIds : [],
				unlockedIds: Array.isArray(source.unlockedIds) ? source.unlockedIds : [],
				sessionMap: source.sessionMap !== null && typeof source.sessionMap === 'object' ? source.sessionMap : {},
			};
		}

		function currentView() {
			var snapshot = workspacesSnapshot();
			var map = sessionWorkspaceMap(snapshot);
			var currentSessionId = mainSessionIdOf(sessionsSnapshot());
			var currentWorkspaceId = currentSessionId !== undefined ? map[currentSessionId] : undefined;
			return {
				hiddenMode: state.hiddenMode,
				hiddenIds: state.hiddenIds,
				encryptedIds: state.encryptedIds,
				unlockedIds: state.unlockedIds,
				sessionMap: map,
				currentSessionId: currentSessionId,
				currentWorkspaceId: currentWorkspaceId,
			};
		}

		// ==== Visibility rules (pure) =========================================
		function workspaceRowVisible(workspaceId, view) {
			var v = viewOf(view);
			if (workspaceId === null || workspaceId === undefined || workspaceId === '') return !v.hiddenMode;
			return v.hiddenMode ? containsId(v.hiddenIds, workspaceId) : !containsId(v.hiddenIds, workspaceId);
		}

		function workspaceLocked(workspaceId, view) {
			var v = viewOf(view);
			if (workspaceId === null || workspaceId === undefined || workspaceId === '') return false;
			return containsId(v.encryptedIds, workspaceId) && !containsId(v.unlockedIds, workspaceId);
		}

		/** Parse a native `data-row-key` into its entity. */
		function parseRowKey(rawKey) {
			if (typeof rawKey !== 'string') return null;
			if (rawKey.indexOf('workspace:') === 0) return { kind: 'workspace', id: rawKey.slice('workspace:'.length) };
			if (rawKey.indexOf('session:') === 0) return { kind: 'session', id: rawKey.slice('session:'.length) };
			if (rawKey.indexOf('overflow:') === 0) return { kind: 'overflow', id: rawKey.slice('overflow:'.length) };
			return null;
		}

		/**
		 * Pure visibility decision for one row key.
		 * @returns {{visible: boolean, kind: string, id: string|null, workspaceId?: string, locked?: boolean}}
		 */
		function visibilityOfRow(rawKey, view) {
			var parsed = parseRowKey(rawKey);
			if (parsed === null) return { visible: true, kind: 'other', id: null };
			var v = viewOf(view);
			if (parsed.kind === 'workspace') {
				return {
					visible: workspaceRowVisible(parsed.id, v),
					kind: 'workspace',
					id: parsed.id,
					workspaceId: parsed.id,
					locked: workspaceLocked(parsed.id, v),
				};
			}
			if (parsed.kind === 'overflow') {
				var overflowLocked = workspaceLocked(parsed.id, v);
				return {
					visible: workspaceRowVisible(parsed.id, v) && !overflowLocked,
					kind: 'overflow',
					id: parsed.id,
					workspaceId: parsed.id,
					locked: overflowLocked,
				};
			}
			var workspaceId = v.sessionMap[parsed.id];
			if (typeof workspaceId !== 'string') workspaceId = '';
			var locked = workspaceLocked(workspaceId, v);
			return {
				visible: workspaceRowVisible(workspaceId, v) && !locked,
				kind: 'session',
				id: parsed.id,
				workspaceId: workspaceId,
				locked: locked,
			};
		}

		/**
		 * Main-content protection: which lock covers the current session, if any.
		 * @returns {{kind: 'hidden'|'encrypted', workspaceId: string}|null}
		 */
		function mainGuardDecision(view) {
			var v = view !== null && view !== undefined && typeof view === 'object' ? view : currentView();
			var sessionId = v.currentSessionId;
			if (sessionId === null || sessionId === undefined || sessionId === '') return null;
			var map = v.sessionMap !== null && v.sessionMap !== undefined && typeof v.sessionMap === 'object' ? v.sessionMap : {};
			var workspaceId = map[sessionId];
			if (typeof workspaceId !== 'string' || workspaceId === '') return null;
			var hiddenIds = Array.isArray(v.hiddenIds) ? v.hiddenIds : [];
			var encryptedIds = Array.isArray(v.encryptedIds) ? v.encryptedIds : [];
			var unlockedIds = Array.isArray(v.unlockedIds) ? v.unlockedIds : [];
			if (v.hiddenMode !== true && containsId(hiddenIds, workspaceId)) return { kind: 'hidden', workspaceId: workspaceId };
			if (containsId(encryptedIds, workspaceId) && !containsId(unlockedIds, workspaceId)) return { kind: 'encrypted', workspaceId: workspaceId };
			return null;
		}

		function firstNonHiddenWorkspaceId() {
			var snapshot = workspacesSnapshot();
			var items = snapshot !== null && Array.isArray(snapshot.items) ? snapshot.items : [];
			for (var index = 0; index < items.length; index += 1) {
				var item = items[index];
				if (item === null || typeof item !== 'object') continue;
				if (typeof item.workspaceId !== 'string' || item.workspaceId === '') continue;
				if (!isHidden(item.workspaceId)) return item.workspaceId;
			}
			return null;
		}

		// ==== Styles ==========================================================
		var CSS = [
			':root{--dsh-vault-y:var(--ef-y,#f2f013);--dsh-vault-y-soft:rgba(242,240,19,0.14);--dsh-vault-line:var(--dsw-alias-border-l1,rgba(255,255,255,0.12));--dsh-vault-line-2:var(--dsw-alias-border-l2,rgba(255,255,255,0.16))}',
			'.dsh-workspace-vault-hidden{display:none!important}',
			// header icon
			'.dsh-workspace-vault__iconBtn{box-sizing:border-box;width:28px;height:28px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary,rgba(230,230,230,0.72));display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none;transition:color .12s linear,background-color .12s linear}',
			'.dsh-workspace-vault__iconBtn:hover{color:var(--dsw-alias-label-primary,#e6e6e6);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,0.14))}',
			'.dsh-workspace-vault__iconBtn.is-active{color:var(--dsh-vault-y);background:var(--dsh-vault-y-soft)}',
			'.dsh-workspace-vault__iconBtn svg{width:16px;height:16px;display:block}',
			// hidden-mode banner
			'.dsh-workspace-vault__banner{box-sizing:border-box;display:flex;align-items:center;gap:6px;margin:0 4px 4px;padding:3px 6px 3px 8px;border:1px solid var(--dsh-vault-y);background:linear-gradient(90deg,rgba(242,240,19,0.16),rgba(242,240,19,0.04));color:var(--dsh-vault-y);font-size:11px;line-height:16px;letter-spacing:.08em;text-transform:uppercase}',
			'.dsh-workspace-vault__bannerTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}',
			'.dsh-workspace-vault__bannerBtn{box-sizing:border-box;height:20px;padding:0 6px;border:1px solid var(--dsh-vault-line-2);background:transparent;color:inherit;font:inherit;font-size:11px;line-height:18px;letter-spacing:.04em;cursor:pointer;white-space:nowrap}',
			'.dsh-workspace-vault__bannerBtn:hover{border-color:var(--dsh-vault-y);background:var(--dsh-vault-y-soft)}',
			// row hover buttons + badges
			'.dsh-workspace-vault__rowBtn{box-sizing:border-box;width:18px;height:18px;padding:0;border:0;border-radius:2px;background:transparent;color:var(--dsw-alias-label-tertiary,rgba(230,230,230,0.5));display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none}',
			'.dsh-workspace-vault__rowBtn:hover{color:var(--dsh-vault-y);background:var(--dsh-vault-y-soft)}',
			'.dsh-workspace-vault__rowBtn svg{width:14px;height:14px;display:block}',
			'.dsh-workspace-vault__rowBtn.is-on{color:var(--dsh-vault-y)}',
			'.dsh-workspace-vault__badge{display:inline-flex;align-items:center;justify-content:center;width:14px;height:18px;margin-left:4px;color:var(--dsw-alias-label-caption,rgba(230,230,230,0.4));flex:none}',
			'.dsh-workspace-vault__badge.is-on{color:var(--dsh-vault-y)}',
			'.dsh-workspace-vault__badge svg{width:12px;height:12px;display:block}',
			'html[data-dsh-endfield] .dsh-workspace-vault__rowBtn:hover{box-shadow:0 0 0 1px var(--dsh-vault-y)}',
			// dialog shell
			'.dsh-workspace-vault__backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(3,5,4,0.62);pointer-events:auto}',
			'.dsh-workspace-vault__card{box-sizing:border-box;position:relative;width:min(460px,100%);background:var(--dsw-specific-menu,#1c1e1c);color:var(--dsw-alias-label-primary,#e6e6e6);border:1px solid var(--dsh-vault-line);border-radius:2px;box-shadow:0 18px 60px rgba(0,0,0,0.6);padding:20px 20px 16px;font-size:14px;line-height:22px;overflow:hidden}',
			'.dsh-workspace-vault__bar{position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--dsh-vault-y),transparent 72%)}',
			'.dsh-workspace-vault__title{margin:0 0 6px;font-size:15px;font-weight:600;line-height:22px;letter-spacing:.06em;text-transform:uppercase}',
			'.dsh-workspace-vault__intro{margin:0 0 14px;color:var(--dsw-alias-label-secondary,rgba(230,230,230,0.72));font-size:12px;line-height:18px}',
			'.dsh-workspace-vault__target{margin:0 0 12px;padding:4px 8px;border-left:2px solid var(--dsh-vault-y);background:var(--dsh-vault-y-soft);color:var(--dsw-alias-label-secondary,rgba(230,230,230,0.78));font-size:12px;line-height:18px;word-break:break-all}',
			'.dsh-workspace-vault__label{display:block;margin:0 0 6px;color:var(--dsw-alias-label-secondary,rgba(230,230,230,0.72));font-size:11px;line-height:16px;letter-spacing:.08em;text-transform:uppercase}',
			'.dsh-workspace-vault__input{box-sizing:border-box;width:100%;height:34px;padding:0 10px;border:1px solid var(--dsh-vault-line-2);border-radius:2px;background:rgba(0,0,0,0.18);color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:13px;outline:none;margin-bottom:12px}',
			'.dsh-workspace-vault__input:focus{border-color:var(--dsh-vault-y);box-shadow:0 0 0 1px var(--dsh-vault-y-soft)}',
			'.dsh-workspace-vault__hint{margin:0 0 12px;color:var(--dsw-alias-label-tertiary,rgba(230,230,230,0.56));font-size:12px;line-height:18px}',
			'.dsh-workspace-vault__error{margin:0 0 12px;padding:6px 8px;border-left:2px solid var(--dsw-alias-state-error-primary,#f85149);color:var(--dsw-alias-state-error-primary,#f85149);font-size:12px;line-height:18px}',
			'.dsh-workspace-vault__footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:4px}',
			'.dsh-workspace-vault__footerLeft{margin-right:auto;display:flex;align-items:center;gap:8px}',
			'.dsh-workspace-vault__btn{height:32px;min-width:72px;padding:0 14px;border-radius:2px;border:1px solid var(--dsh-vault-line-2);background:transparent;color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:13px;line-height:30px;cursor:pointer}',
			'.dsh-workspace-vault__btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,0.14))}',
			'.dsh-workspace-vault__btn:disabled{opacity:0.55;cursor:default}',
			'.dsh-workspace-vault__btn--link{border:0;background:transparent;min-width:0;padding:0 2px;color:var(--dsw-alias-link,#7aa7ff);font-size:12px}',
			'.dsh-workspace-vault__btn--danger{color:var(--dsw-alias-state-error-primary,#f85149);border-color:rgba(248,81,73,0.55)}',
			'.dsh-workspace-vault__btn--danger:hover:not(:disabled){background:rgba(248,81,73,0.12);border-color:var(--dsw-alias-state-error-primary,#f85149)}',
			'.dsh-workspace-vault__btn--primary{background:var(--dsh-vault-y);border-color:transparent;color:#070a08;font-weight:600}',
			'.dsh-workspace-vault__btn--primary:hover:not(:disabled){background:var(--ef-y-hi,#fbfa6a)}',
			'html[data-dsh-endfield] .dsh-workspace-vault__btn--primary:not(:disabled){background-color:var(--ef-y,#f2f013)!important;color:#070a08!important;border:0!important;border-radius:2px!important;font-weight:600;clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));box-shadow:0 0 0 1px rgba(242,240,19,0.4),0 6px 18px rgba(242,240,19,0.14)}',
			'html[data-dsh-endfield] .dsh-workspace-vault__btn--primary:disabled{background-color:var(--ef-y,#f2f013)!important;color:#070a08!important;opacity:0.4}',
			'html[data-dsh-endfield] .dsh-workspace-vault__card{border-color:rgba(242,240,19,0.3)}',
			'html[data-dsh-endfield] .dsh-workspace-vault__banner{border-color:var(--ef-y,#f2f013)}',
			// main-content guard
			'.dsh-workspace-vault__guard{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;padding:32px;background:radial-gradient(circle at 50% 40%, rgba(242,240,19,0.08), rgba(3,5,4,0.97) 62%)}',
			'.dsh-workspace-vault__guardCard{box-sizing:border-box;width:min(420px,100%);text-align:center;padding:28px 24px;border:1px solid var(--dsh-vault-line);background:var(--dsw-specific-menu,#1c1e1c);box-shadow:0 18px 70px rgba(0,0,0,0.65)}',
			'.dsh-workspace-vault__guardGlyph{display:block;margin:0 auto 12px;width:44px;height:44px;color:var(--dsh-vault-y)}',
			'.dsh-workspace-vault__guardTitle{margin:0 0 8px;font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}',
			'.dsh-workspace-vault__guardBody{margin:0 0 18px;color:var(--dsw-alias-label-secondary,rgba(230,230,230,0.72));font-size:13px;line-height:20px}',
			'.dsh-workspace-vault__guardNote{margin:14px 0 0;color:var(--dsw-alias-label-tertiary,rgba(230,230,230,0.5));font-size:11px;line-height:16px}',
			// task pin header button
			'.dsh-workspace-vault__headerBtn{box-sizing:border-box;height:26px;padding:0 8px;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsh-vault-line-2);border-radius:2px;background:transparent;color:var(--dsw-alias-label-secondary,rgba(230,230,230,0.72));font:inherit;font-size:12px;line-height:24px;cursor:pointer;white-space:nowrap}',
			'.dsh-workspace-vault__headerBtn:hover{border-color:var(--dsh-vault-y);color:var(--dsh-vault-y)}',
			'.dsh-workspace-vault__headerBtn.is-pinned{border-color:var(--dsh-vault-y);color:var(--dsh-vault-y);background:var(--dsh-vault-y-soft)}',
			'.dsh-workspace-vault__headerBtnGlyph{display:inline-flex;align-items:center;justify-content:center;font-size:12px;line-height:1}',
			'.dsh-workspace-vault__headerBtnGlyph svg{width:13px;height:13px;display:block}',
			// pinned workspace row highlight (custom attribute set by the decorator)
			'[data-dsh-workspace-vault-pinned="1"]{position:relative;box-shadow:inset 3px 0 0 var(--dsw-alias-state-business-primary,#4c8dff);background:linear-gradient(90deg,var(--dsw-alias-interactive-bg-selected,rgba(76,141,255,0.12)),transparent 62%)}',
			'[data-dsh-workspace-vault-pinned="1"] [class*="title"]{color:var(--dsw-alias-label-primary,#e6e6e6);font-weight:600}',
			'html[data-dsh-endfield] [data-dsh-workspace-vault-pinned="1"]{box-shadow:inset 3px 0 0 var(--ef-y,#f2f013);background:linear-gradient(90deg,rgba(242,240,19,0.16),rgba(242,240,19,0.03) 66%,transparent)}',
			'html[data-dsh-endfield] [data-dsh-workspace-vault-pinned="1"] [class*="title"]{color:var(--ef-y,#f2f013);font-weight:600}',
			// workspace "…" menu
			'.dsh-workspace-vault__menu{position:fixed;z-index:1200;box-sizing:border-box;min-width:196px;padding:4px;background:var(--dsw-specific-menu,#1c1e1c);border:1px solid var(--dsh-vault-y);box-shadow:0 14px 40px rgba(0,0,0,0.6);clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))}',
			'.dsh-workspace-vault__menuItem{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 10px;border:0;background:transparent;color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:12px;line-height:30px;text-align:left;cursor:pointer;white-space:nowrap}',
			'.dsh-workspace-vault__menuItem:hover:not(:disabled){background:var(--dsh-vault-y-soft);color:var(--dsh-vault-y)}',
			'.dsh-workspace-vault__menuItem:disabled{opacity:0.5;cursor:default}',
			'.dsh-workspace-vault__menuItem.is-danger{color:var(--dsw-alias-state-error-primary,#f85149)}',
			'.dsh-workspace-vault__menuItem.is-danger:hover:not(:disabled){background:rgba(248,81,73,0.12);color:var(--dsw-alias-state-error-primary,#f85149)}',
			'.dsh-workspace-vault__menuGlyph{width:14px;flex:none;text-align:center;font-size:12px;opacity:0.85;display:inline-flex;align-items:center;justify-content:center}',
			'.dsh-workspace-vault__menuGlyph svg{width:14px;height:14px;display:block}',
			'.dsh-workspace-vault__menuSep{height:1px;margin:4px 6px;background:var(--dsh-vault-line)}',
			'html[data-dsh-endfield] .dsh-workspace-vault__menu{border-color:var(--ef-y,#f2f013);background:rgba(12,14,12,0.98)}',
		].join('');

		function ensureStyles() {
			if (typeof document === 'undefined' || document === null || typeof document.createElement !== 'function') return function () {};
			var selector = 'style[data-plugin-css="' + STYLE_MARKER + '"]';
			var existing = typeof document.querySelector === 'function' ? document.querySelector(selector) : null;
			if (existing !== null && existing !== undefined) {
				existing.textContent = CSS;
				return function () {};
			}
			var style = document.createElement('style');
			style.setAttribute('data-plugin', PLUGIN_ID);
			style.setAttribute('data-plugin-css', STYLE_MARKER);
			style.textContent = CSS;
			if (document.head && typeof document.head.appendChild === 'function') document.head.appendChild(style);
			return function () {
				if (style.parentNode && typeof style.parentNode.removeChild === 'function') style.parentNode.removeChild(style);
			};
		}

		// ==== HTTP ============================================================
		function readTransport() {
			try {
				if (typeof globalThis !== 'undefined' && globalThis !== null && typeof globalThis.__DSH_TRANSPORT__ === 'object' && globalThis.__DSH_TRANSPORT__ !== null) return globalThis.__DSH_TRANSPORT__;
			} catch (error) { /* not a page context */ }
			return undefined;
		}

		function pageBaseUrl() {
			try {
				if (typeof document !== 'undefined' && document !== null && typeof document.baseURI === 'string' && document.baseURI !== '') return document.baseURI;
			} catch (error) { /* no document */ }
			return '';
		}

		function resolveUrl(path, locationLike, transportLike) {
			var loc = locationLike !== undefined ? locationLike : (typeof location !== 'undefined' ? location : undefined);
			var transport = transportLike !== undefined ? transportLike : readTransport();
			if (pageBaseUrl() !== '') return path;
			var protocol = loc && typeof loc.protocol === 'string' ? loc.protocol : '';
			if (protocol === 'dsh-app:') {
				var base = transport && typeof transport.streamBaseUrl === 'string' ? transport.streamBaseUrl : '';
				if (base === '') throw new Error('desktop host address unavailable');
				return new URL(path, base).href;
			}
			return '/' + path;
		}

		function resolveTarget(path) {
			var transport = readTransport();
			if (transport !== undefined && typeof transport.fetch === 'function') {
				return { fetch: function (url, init) { return transport.fetch(url, init); }, url: path };
			}
			var host = typeof globalThis !== 'undefined' && globalThis !== null ? globalThis : undefined;
			var doFetch = host !== undefined && typeof host.fetch === 'function' ? host.fetch : undefined;
			if (typeof doFetch !== 'function') return { fetch: undefined, url: resolveUrl(path, undefined, transport) };
			return {
				// `window.fetch` must keep its host receiver; a bare property call
				// throws "Illegal invocation".
				fetch: function (url, init) { return doFetch.call(host, url, init); },
				url: resolveUrl(path, undefined, transport),
			};
		}

		/**
		 * Host contract: business failures are HTTP 200 + `{ok:false, code, message}`;
		 * malformed JSON is HTTP 400. Handle both layers.
		 */
		async function requestJson(path, method, body) {
			var target = resolveTarget(path);
			if (typeof target.fetch !== 'function') throw new Error(translate('error.serviceUnavailable'));
			var init = { method: method, headers: {}, credentials: 'same-origin' };
			if (body !== undefined) {
				init.headers['content-type'] = 'application/json';
				init.body = JSON.stringify(body);
			}
			var response = await target.fetch(target.url, init);
			var payload = null;
			try { payload = await response.json(); } catch (error) { payload = null; }
			if (!response.ok) {
				var httpMessage = payload && typeof payload.message === 'string' ? payload.message : (payload && payload.error && typeof payload.error.message === 'string' ? payload.error.message : 'HTTP ' + response.status);
				var httpError = new Error(httpMessage);
				if (payload && typeof payload.code === 'string') httpError.code = payload.code;
				throw httpError;
			}
			if (payload !== null && typeof payload === 'object' && payload.ok === false) {
				var businessError = new Error(typeof payload.message === 'string' && payload.message !== '' ? payload.message : (typeof payload.code === 'string' ? payload.code : 'request failed'));
				if (typeof payload.code === 'string') businessError.code = payload.code;
				throw businessError;
			}
			return payload;
		}

		// ==== Module-scope store ==============================================
		/** Root client context captured by apply; overlays use its services. */
		var pluginCtx = null;
		var store = {
			kind: null,
			workspaceId: null,
			purpose: null,
			workspaceTitle: null,
			notice: null,
			/** Workspace "…" menu: { workspaceId, x, y, title } while open. */
			menu: null,
		};
		var subscribers = new Set();

		function notify() {
			subscribers.forEach(function (listener) {
				try { listener(); } catch (error) { /* one subscriber must not break the rest */ }
			});
		}

		function patch(next) {
			var changed = false;
			Object.keys(next).forEach(function (key) {
				if (store[key] !== next[key]) { store[key] = next[key]; changed = true; }
			});
			if (changed) notify();
		}

		function subscribe(listener) {
			subscribers.add(listener);
			return function () { subscribers.delete(listener); };
		}

		function openSetupDialog() {
			patch({ kind: 'setup', workspaceId: null, purpose: null, workspaceTitle: null });
		}

		function openUnlockDialog(options) {
			var opts = options !== null && options !== undefined && typeof options === 'object' ? options : {};
			patch({
				kind: 'unlock',
				workspaceId: typeof opts.workspaceId === 'string' ? opts.workspaceId : null,
				purpose: opts.purpose === 'workspace' ? 'workspace' : 'hidden',
				workspaceTitle: typeof opts.workspaceTitle === 'string' ? opts.workspaceTitle : null,
			});
		}

		function openRecoverDialog() {
			patch({ kind: 'recover' });
		}

		function openCreateHiddenDialog() {
			patch({ kind: 'create-hidden', workspaceId: null, purpose: null, workspaceTitle: null });
		}

		function openEncryptDialog(workspaceId) {
			var title = typeof workspaceId === 'string' && workspaceId !== '' ? workspaceTitleById(workspaceId) : null;
			patch({ kind: 'encrypt', workspaceId: workspaceId, purpose: null, workspaceTitle: title });
		}

		function closeDialog() {
			patch({ kind: null, workspaceId: null, purpose: null, workspaceTitle: null });
		}

		function currentDialogOptions() {
			return { purpose: store.purpose, workspaceId: store.workspaceId };
		}

		/** Refresh sidebar decoration and overlays after any state change. */
		function refreshAll() {
			notify();
			safeEnsure();
		}

		// ==== Actions =========================================================
		function loadState() {
			state.loading = true;
			var revision = pinRevision;
			return requestJson(STATE_PATH, 'GET').then(function (payload) {
				var parsed = parseStatePayload(payload);
				if (parsed.ok !== true) throw new Error(translate('error.serviceUnavailable'));
				// A pin action may have completed while this GET was in flight; do not
				// let the older projection restore membership the user just removed.
				var pinnedBefore = Array.isArray(state.pinnedIds) ? state.pinnedIds.slice() : [];
				applyStatePayload(parsed);
				if (revision !== pinRevision) state.pinnedIds = pinnedBefore;
				state.loading = false;
				state.loaded = true;
				state.error = null;
				refreshAll();
				return parsed;
			}).catch(function (reason) {
				state.loading = false;
				state.loaded = true;
				state.error = errorText(reason);
				try { console.warn('dsh-workspace-vault: cannot load state', reason); } catch (error) { /* no console */ }
				refreshAll();
				return null;
			});
		}

		function ensureToken(purpose) {
			if (isTokenValid()) return true;
			openUnlockDialog({ purpose: purpose === 'workspace' ? 'workspace' : 'hidden', workspaceId: null });
			return false;
		}

		var pinRevision = 0;
		var pinActionInFlight = 0;
		var lastPinActionAt = 0;

		function beginPinAction() {
			pinRevision += 1;
			pinActionInFlight += 1;
			lastPinActionAt = Date.now();
			return pinRevision;
		}

		function finishPinAction() {
			pinActionInFlight = Math.max(0, pinActionInFlight - 1);
		}

		function performPinWorkspace(workspaceId, pinned) {
			if (typeof workspaceId !== 'string' || workspaceId === '') return Promise.reject(new Error(translate('error.unknownWorkspace')));
			var revision = beginPinAction();
			return requestJson(PIN_WORKSPACE_PATH, 'POST', { workspaceId: workspaceId, pinned: pinned === true }).then(function (payload) {
				// Only the newest explicit pin action may change membership; an older
				// response arriving late would otherwise flash the old pin back.
				if (revision === pinRevision) applyPinnedResult(payload);
				finishPinAction();
				refreshAll();
				return payload;
			}, function (reason) {
				finishPinAction();
				throw reason;
			});
		}

		function toggleWorkspacePin(workspaceId) {
			return performPinWorkspace(workspaceId, !isPinned(workspaceId));
		}

		/** Setup: create the master password, then immediately unlock the hidden space. */
		function performSetupPassword(password, phone) {
			var body = { action: 'setup', password: password };
			var normalized = normalizePhone(phone);
			if (normalized !== '') body.phone = normalized;
			return requestJson(PASSWORD_PATH, 'POST', body).then(function (payload) {
				state.hasPassword = true;
				if (payload !== null && payload !== undefined) state.phone = normalizePhoneInfo(payload.phone);
				return performUnlockPassword(password, { purpose: 'hidden', workspaceId: null });
			}).catch(function (reason) {
				// Another window may have configured the vault after this page loaded;
				// refresh the projection and continue in the unlock dialog.
				if (reason !== null && reason !== undefined && reason.code === 'already-configured') {
					state.hasPassword = true;
					loadState();
					openUnlockDialog({ purpose: 'hidden' });
				}
				throw reason;
			});
		}

		/** Unlock: POST unlock, then apply the dialog's purpose (hidden space or one workspace). */
		function performUnlockPassword(password, options) {
			return requestJson(UNLOCK_PATH, 'POST', { password: password }).then(function (payload) {
				applyUnlockResult(payload);
				var opts = options !== null && options !== undefined && typeof options === 'object' ? options : currentDialogOptions();
				if (opts.purpose === 'hidden') state.hiddenMode = true;
				else if (typeof opts.workspaceId === 'string' && opts.workspaceId !== '') addUnlocked(opts.workspaceId);
				closeDialog();
				refreshAll();
				return payload;
			});
		}

		function performRecoverPassword(phone, password) {
			var normalized = normalizePhone(phone);
			if (normalized === '') return Promise.reject(new Error(translate('error.phoneRequired')));
			return requestJson(PASSWORD_PATH, 'POST', { action: 'recover', phone: normalized, password: password }).then(function (payload) {
				state.hasPassword = true;
				if (payload !== null && payload !== undefined) state.phone = normalizePhoneInfo(payload.phone);
				return performUnlockPassword(password, currentDialogOptions());
			});
		}

		function performCreateHidden(name) {
			if (!ensureToken('hidden')) return Promise.reject(new Error(translate('error.tokenRequired')));
			var body = { token: state.token, name: name };
			return requestJson(CREATE_HIDDEN_PATH, 'POST', body).then(function (payload) {
				var path = payload !== null && payload !== undefined && typeof payload.path === 'string' ? payload.path : '';
				if (path === '') throw new Error(translate('error.io'));
				var workspaces = getService('workspaces');
				if (workspaces === undefined || workspaces === null || typeof workspaces.create !== 'function') throw new Error(translate('error.serviceUnavailable'));
				return Promise.resolve(workspaces.create({ path: path })).then(function (workspace) {
					var workspaceId = workspace !== null && workspace !== undefined && typeof workspace === 'object' && typeof workspace.workspaceId === 'string' ? workspace.workspaceId : '';
					if (workspaceId === '') return loadState();
					return requestJson(HIDDEN_PATH, 'POST', { token: state.token, workspaceId: workspaceId, hidden: true }).then(function (hiddenPayload) {
						applyHiddenResult(hiddenPayload, { workspaceId: workspaceId, hidden: true });
						return hiddenPayload;
					});
				});
			}).then(function (result) {
				closeDialog();
				refreshAll();
				return result;
			});
		}

		/** Encrypt confirmation: verify the master password, then lock the workspace. */
		function performEncryptWorkspace(password) {
			var workspaceId = store.workspaceId;
			if (typeof workspaceId !== 'string' || workspaceId === '') return Promise.reject(new Error(translate('error.unknownWorkspace')));
			return requestJson(UNLOCK_PATH, 'POST', { password: password }).then(function (payload) {
				applyUnlockResult(payload);
				return requestJson(ENCRYPT_PATH, 'POST', { token: state.token, workspaceId: workspaceId, encrypted: true });
			}).then(function (payload) {
				applyEncryptedResult(payload, { workspaceId: workspaceId, encrypted: true });
				closeDialog();
				refreshAll();
				return payload;
			});
		}

		function decryptWorkspace(workspaceId) {
			if (typeof workspaceId !== 'string' || workspaceId === '') return Promise.resolve(false);
			if (!isTokenValid()) {
				openUnlockDialog({ purpose: 'workspace', workspaceId: workspaceId });
				return Promise.resolve(false);
			}
			return requestJson(ENCRYPT_PATH, 'POST', { token: state.token, workspaceId: workspaceId, encrypted: false }).then(function (payload) {
				applyEncryptedResult(payload, { workspaceId: workspaceId, encrypted: false });
				removeUnlocked(workspaceId);
				refreshAll();
				return true;
			}).catch(function (reason) {
				if (reason !== null && reason !== undefined && reason.code === 'token-invalid') {
					state.token = null;
					state.tokenExpiresAt = 0;
					openUnlockDialog({ purpose: 'workspace', workspaceId: workspaceId });
				}
				throw reason;
			});
		}

		/** Row lock button: encrypt → confirm; encrypted+locked → unlock; encrypted+unlocked → remove lock. */
		function toggleWorkspaceLock(workspaceId) {
			if (typeof workspaceId !== 'string' || workspaceId === '') return;
			if (!isEncrypted(workspaceId)) {
				openEncryptDialog(workspaceId);
				return;
			}
			if (!isUnlocked(workspaceId)) {
				openUnlockDialog({ purpose: 'workspace', workspaceId: workspaceId, workspaceTitle: workspaceTitleById(workspaceId) });
				return;
			}
			decryptWorkspace(workspaceId).catch(function (reason) {
				try { console.warn('dsh-workspace-vault: decrypt failed', reason); } catch (error) { /* no console */ }
			});
		}

		function setWorkspaceHidden(workspaceId, hidden) {
			if (!ensureToken('hidden')) return Promise.reject(new Error(translate('error.tokenRequired')));
			return requestJson(HIDDEN_PATH, 'POST', { token: state.token, workspaceId: workspaceId, hidden: hidden === true }).then(function (payload) {
				applyHiddenResult(payload, { workspaceId: workspaceId, hidden: hidden === true });
				refreshAll();
				return payload;
			});
		}

		function enterHiddenMode() {
			state.hiddenMode = true;
			closeDialog();
			refreshAll();
			return true;
		}

		function exitHiddenMode() {
			state.hiddenMode = false;
			refreshAll();
			return true;
		}

		/** Leave the hidden space, moving away from hidden content first. */
		function leaveHiddenMode() {
			var current = currentView();
			var currentWorkspaceId = current.currentWorkspaceId;
			var needsNavigation = typeof currentWorkspaceId === 'string' && isHidden(currentWorkspaceId);
			if (!needsNavigation) {
				exitHiddenMode();
				return Promise.resolve(true);
			}
			var uiWorkspace = getService('uiWorkspace');
			var target = firstNonHiddenWorkspaceId();
			var moved;
			try {
				if (target !== null && uiWorkspace !== undefined && uiWorkspace !== null && typeof uiWorkspace.openWorkspace === 'function') {
					moved = Promise.resolve(uiWorkspace.openWorkspace(target));
				} else if (uiWorkspace !== undefined && uiWorkspace !== null && typeof uiWorkspace.clearMain === 'function') {
					uiWorkspace.clearMain();
					moved = Promise.resolve(true);
				} else {
					moved = Promise.resolve(true);
				}
			} catch (reason) {
				moved = Promise.resolve(true);
			}
			return moved.catch(function (reason) {
				try { console.warn('dsh-workspace-vault: cannot leave hidden workspace', reason); } catch (error) { /* no console */ }
				return true;
			}).then(function () {
				exitHiddenMode();
				return true;
			});
		}

		function openHiddenToggle() {
			if (state.hiddenMode) {
				leaveHiddenMode();
				return;
			}
			if (state.loading) return;
			// Always refresh the vault projection first: a password may have been
			// configured (or removed) after this page loaded, in another window or
			// by maintenance scripts. The projection is cheap and local-only.
			loadState().then(function () {
				if (state.error !== null) return;
				if (state.hasPassword) openUnlockDialog({ purpose: 'hidden' });
				else openSetupDialog();
			});
		}

		function pinSessionFor(sessionId) {
			var workspaces = getService('workspaces');
			if (workspaces === undefined || workspaces === null || typeof workspaces.pinSession !== 'function') return null;
			try { return Promise.resolve(workspaces.pinSession(sessionId)); } catch (error) { return Promise.reject(error); }
		}

		function unpinSessionFor(sessionId) {
			var workspaces = getService('workspaces');
			if (workspaces === undefined || workspaces === null || typeof workspaces.unpinSession !== 'function') return null;
			try { return Promise.resolve(workspaces.unpinSession(sessionId)); } catch (error) { return Promise.reject(error); }
		}

		// ==== DOM decoration helpers ==========================================
		function domDocument() {
			try {
				if (typeof document !== 'undefined' && document !== null && typeof document.createElement === 'function') return document;
			} catch (error) { /* no document */ }
			return null;
		}

		function sidebarRoot() {
			var doc = domDocument();
			if (doc === null) return null;
			try {
				if (typeof doc.querySelector === 'function') {
					var sidebar = doc.querySelector('[data-slot="sidebar"]');
					if (sidebar !== null && sidebar !== undefined) return sidebar;
				}
			} catch (error) { /* selector unsupported */ }
			return doc.body !== undefined && doc.body !== null ? doc.body : null;
		}

		function collectNodes(result) {
			var out = [];
			if (result === null || result === undefined) return out;
			if (Array.isArray(result)) return result;
			if (typeof result.length === 'number') {
				for (var index = 0; index < result.length; index += 1) out.push(result[index]);
				return out;
			}
			if (typeof result[Symbol.iterator] === 'function') {
				try {
					var iterator = result[Symbol.iterator]();
					var step = iterator.next();
					while (step !== null && step !== undefined && step.done !== true) {
						out.push(step.value);
						step = iterator.next();
					}
				} catch (error) { /* not iterable */ }
			}
			return out;
		}

		function findInjected(scope, name) {
			if (scope === null || scope === undefined || typeof scope.querySelector !== 'function') return null;
			try { return scope.querySelector('[' + ATTR + '="' + name + '"]'); } catch (error) { return null; }
		}

		function removeInjected(scope, name) {
			var element = findInjected(scope, name);
			if (element !== null && element !== undefined && element.parentNode && typeof element.parentNode.removeChild === 'function') element.parentNode.removeChild(element);
		}

		function setAttr(element, name, value) {
			if (element === null || element === undefined || typeof element.setAttribute !== 'function') return;
			var current = typeof element.getAttribute === 'function' ? element.getAttribute(name) : null;
			if (current === value) return;
			element.setAttribute(name, value);
		}

		function removeAttr(element, name) {
			if (element === null || element === undefined) return;
			if (typeof element.removeAttribute === 'function') { element.removeAttribute(name); return; }
			if (typeof element.setAttribute === 'function' && typeof element.getAttribute === 'function' && element.getAttribute(name) !== null) element.setAttribute(name, '');
		}

		function setText(element, text) {
			if (element === null || element === undefined) return;
			if (element.textContent !== text) element.textContent = text;
		}

		function setSvg(element, svg) {
			if (element === null || element === undefined) return;
			try { element.innerHTML = svg; } catch (error) { /* fake DOM */ }
		}

		function findWorkspaceSectionHeader(root) {
			if (root === null || root === undefined || typeof root.querySelectorAll !== 'function') return null;
			var headers;
			var row = null;
			try { headers = collectNodes(root.querySelectorAll('[class*="sectionHeader"]')); } catch (error) { headers = []; }
			try {
				if (typeof root.querySelector === 'function') row = root.querySelector('[data-row-key^="workspace:"]');
			} catch (error) { row = null; }
			if (row !== null && row !== undefined) {
				var ancestors = [];
				var node = row.parentElement;
				while (node !== null && node !== undefined) {
					ancestors.push(node);
					node = node.parentElement;
				}
				for (var index = 0; index < headers.length; index += 1) {
					var parent = headers[index].parentElement;
					while (parent !== null && parent !== undefined) {
						if (ancestors.indexOf(parent) !== -1) return headers[index];
						parent = parent.parentElement;
					}
				}
			}
			for (var headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
				var actions = null;
				try { actions = headers[headerIndex].querySelector('[class*="headerActions"]'); } catch (error) { actions = null; }
				if (actions !== null && actions !== undefined) return headers[headerIndex];
			}
			return headers.length > 0 ? headers[0] : null;
		}

		// Inline SVG icon set (HUD line icons; they inherit `currentColor`).
		var SVG_VAULT = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.2" d="M8 1.6 13 3.4v4.1c0 3.1-2 5.7-5 7.1-3-1.4-5-4-5-7.1V3.4z"/><circle cx="8" cy="7" r="1.15" fill="currentColor"/><path fill="currentColor" d="M7.6 8h.8l.3 2.2H7.3z"/></svg>';
		var SVG_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 1 1-1H7a1 1 0 0 1 1 1 1 1 0 0 1 1 1z"/></svg>';
		var SVG_PIN_ON = '<svg viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 1 1-1H7a1 1 0 0 1 1 1 1 1 0 0 1 1 1z"/></svg>';
		var SVG_LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 1.2A3.1 3.1 0 0 0 4.9 4.3v2H4v8.5h8V6.3h-.9v-2A3.1 3.1 0 0 0 8 1.2zm0 1.4A1.7 1.7 0 0 1 9.7 4.3v2H6.3v-2A1.7 1.7 0 0 1 8 2.6zM8 8.6a1.2 1.2 0 0 1 .6 2.2v1.9H7.4v-1.9A1.2 1.2 0 0 1 8 8.6z"/></svg>';
		var SVG_LOCK_OPEN = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 1.2A3.1 3.1 0 0 0 4.9 4.3V5h1.4v-.7A1.7 1.7 0 0 1 9.7 4.3v2H4v8.5h8V6.3h-.9v-2A3.1 3.1 0 0 0 8 1.2zM8 8.6a1.2 1.2 0 0 1 .6 2.2v1.9H7.4v-1.9A1.2 1.2 0 0 1 8 8.6z"/></svg>';
		var SVG_LOCK_GLYPH = SVG_LOCK;

		function createInjectedButton(name, className, ariaLabel, title, svg, onClick) {
			var doc = domDocument();
			if (doc === null) return null;
			var button = doc.createElement('button');
			button.setAttribute('type', 'button');
			button.setAttribute(ATTR, name);
			button.setAttribute('class', className);
			button.setAttribute('aria-label', ariaLabel);
			button.setAttribute('title', title);
			setSvg(button, svg);
			if (typeof button.addEventListener === 'function') {
				button.addEventListener('click', function (event) {
					if (event !== null && event !== undefined) {
						if (typeof event.preventDefault === 'function') event.preventDefault();
						if (typeof event.stopPropagation === 'function') event.stopPropagation();
					}
					try { onClick(event); } catch (error) {
						try { console.warn('dsh-workspace-vault: injected action failed', error); } catch (inner) { /* no console */ }
					}
				});
			}
			return button;
		}

		function createBannerButton(label, onClick) {
			var doc = domDocument();
			if (doc === null) return null;
			var button = doc.createElement('button');
			button.setAttribute('type', 'button');
			button.setAttribute('class', 'dsh-workspace-vault__bannerBtn');
			setText(button, label);
			if (typeof button.addEventListener === 'function') {
				button.addEventListener('click', function (event) {
					if (event !== null && event !== undefined) {
						if (typeof event.preventDefault === 'function') event.preventDefault();
						if (typeof event.stopPropagation === 'function') event.stopPropagation();
					}
					try { onClick(event); } catch (error) {
						try { console.warn('dsh-workspace-vault: banner action failed', error); } catch (inner) { /* no console */ }
					}
				});
			}
			return button;
		}

		/**
		 * Place the hidden-space shield inside the section header, between the
		 * section label and the search slot. The native headerActions row has
		 * `max-width:60px` (view options + add), so a third icon there clipped the
		 * native "＋" button.
		 */
		function ensureToggle(header) {
			if (header === null || header === undefined || typeof header.querySelector !== 'function') return;
			var label = state.hiddenMode ? translate('hidden.toggle.exit') : translate('hidden.toggle.enter');
			var button = findInjected(header, 'hidden-space-toggle');
			if (button === null) {
				button = createInjectedButton('hidden-space-toggle', 'dsh-workspace-vault__iconBtn', label, label, SVG_VAULT, function () { openHiddenToggle(); });
				if (button === null) return;
			}
			var searchSlot = null;
			try { searchSlot = header.querySelector('[class*="searchSlot"]'); } catch (error) { searchSlot = null; }
			try {
				if (searchSlot !== null && searchSlot !== undefined && searchSlot.parentNode === header && typeof header.insertBefore === 'function') {
					if (button.parentNode !== header || button.nextSibling !== searchSlot) header.insertBefore(button, searchSlot);
				} else if (button.parentNode !== header || header.firstChild !== button) {
					if (typeof header.insertBefore === 'function' && header.firstChild !== null && header.firstChild !== undefined) header.insertBefore(button, header.firstChild);
					else if (typeof header.appendChild === 'function') header.appendChild(button);
				}
			} catch (error) { /* header shape changed */ }
			setAttr(button, 'aria-label', label);
			setAttr(button, 'title', label);
			var className = 'dsh-workspace-vault__iconBtn' + (state.hiddenMode ? ' is-active' : '');
			setAttr(button, 'class', className);
		}

		function ensureBanner(root, header) {
			if (root === null || root === undefined || header === null || header === undefined) return;
			var parent = header.parentNode;
			if (parent === null || parent === undefined) return;
			var existing = findInjected(parent, 'hidden-banner');
			if (!state.hiddenMode) {
				if (existing !== null && existing.parentNode && typeof existing.parentNode.removeChild === 'function') existing.parentNode.removeChild(existing);
				return;
			}
			if (existing !== null) return;
			var doc = domDocument();
			if (doc === null) return;
			var banner = doc.createElement('div');
			banner.setAttribute(ATTR, 'hidden-banner');
			banner.setAttribute('class', 'dsh-workspace-vault__banner');
			banner.setAttribute('role', 'status');
			var title = doc.createElement('span');
			title.setAttribute('class', 'dsh-workspace-vault__bannerTitle');
			setText(title, translate('hidden.banner.title'));
			if (typeof banner.appendChild === 'function') banner.appendChild(title);
			var newButton = createBannerButton(translate('hidden.banner.new'), function () { openCreateHiddenDialog(); });
			var exitButton = createBannerButton(translate('hidden.banner.exit'), function () { leaveHiddenMode(); });
			if (newButton !== null && typeof banner.appendChild === 'function') banner.appendChild(newButton);
			if (exitButton !== null && typeof banner.appendChild === 'function') banner.appendChild(exitButton);
			try { parent.insertBefore(banner, header); } catch (error) {
				if (typeof parent.appendChild === 'function') parent.appendChild(banner);
			}
		}

		function ensureRowButton(row, actions, name, className, ariaLabel, title, svg, stateKey, onClick) {
			var button = findInjected(row, name);
			if (button === null) {
				button = createInjectedButton(name, className, ariaLabel, title, svg, onClick);
				if (button === null) return null;
				setAttr(button, 'data-vault-state', stateKey);
				try { actions.insertBefore(button, actions.firstChild); } catch (error) {
					if (typeof actions.appendChild === 'function') actions.appendChild(button);
				}
				return button;
			}
			setAttr(button, 'aria-label', ariaLabel);
			setAttr(button, 'title', title);
			setAttr(button, 'class', className);
			var previous = typeof button.getAttribute === 'function' ? button.getAttribute('data-vault-state') : null;
			if (previous !== stateKey) {
				setSvg(button, svg);
				setAttr(button, 'data-vault-state', stateKey);
			}
			return button;
		}

		function ensureBadge(row, actions, name, present, svg, title) {
			var badge = findInjected(row, name);
			if (!present) {
				if (badge !== null && badge.parentNode && typeof badge.parentNode.removeChild === 'function') badge.parentNode.removeChild(badge);
				return;
			}
			if (badge === null) {
				var doc = domDocument();
				if (doc === null) return;
				badge = doc.createElement('span');
				badge.setAttribute(ATTR, name);
				badge.setAttribute('class', 'dsh-workspace-vault__badge is-on');
				badge.setAttribute('title', title);
				badge.setAttribute('aria-label', title);
				setSvg(badge, svg);
				if (typeof row.insertBefore === 'function' && actions.parentNode === row) row.insertBefore(badge, actions);
				else if (typeof row.appendChild === 'function') row.appendChild(badge);
				return;
			}
			setAttr(badge, 'title', title);
		}

		function ensureWorkspaceRow(row) {
			if (row === null || row === undefined || typeof row.getAttribute !== 'function') return;
			var parsed = parseRowKey(row.getAttribute('data-row-key'));
			if (parsed === null || parsed.kind !== 'workspace') return;
			var workspaceId = parsed.id;
			var actions = null;
			try { actions = row.querySelector('[class*="rowActions"]'); } catch (error) { actions = null; }
			if (workspaceId === '') {
				removeInjected(row, 'pin');
				removeInjected(row, 'lock');
				removeInjected(row, 'hidden-toggle');
				removeInjected(row, 'pin-badge');
				removeInjected(row, 'lock-badge');
				removeInjected(row, 'hidden-badge');
				removeAttr(row, PINNED_ATTR);
				return;
			}
			var pinned = isPinned(workspaceId);
			if (pinned) setAttr(row, PINNED_ATTR, '1');
			else removeAttr(row, PINNED_ATTR);
			// Pin, lock and hidden-space moves live in our "…" menu; drop older
			// injected row buttons so only the status badges remain.
			removeInjected(row, 'pin');
			removeInjected(row, 'lock');
			removeInjected(row, 'hidden-toggle');
			if (actions === null || actions === undefined) return;
			var encrypted = isEncrypted(workspaceId);
			ensureBadge(row, actions, 'pin-badge', pinned, SVG_PIN_ON, translate('badge.pinned'));
			ensureBadge(row, actions, 'lock-badge', encrypted, encrypted ? SVG_LOCK_GLYPH : SVG_LOCK, translate('badge.encrypted'));
			ensureBadge(row, actions, 'hidden-badge', isHidden(workspaceId), SVG_VAULT, translate('badge.hidden'));
		}

		function setRowHidden(row, hidden) {
			if (row === null || row === undefined) return;
			if (row.classList !== null && row.classList !== undefined && typeof row.classList.toggle === 'function') {
				row.classList.toggle(HIDDEN_CLASS, hidden === true);
				return;
			}
			var current = typeof row.className === 'string' ? row.className : (typeof row.getAttribute === 'function' ? row.getAttribute('class') : '') || '';
			var parts = current.split(/\s+/).filter(function (part) { return part !== ''; });
			var index = parts.indexOf(HIDDEN_CLASS);
			if (hidden === true && index === -1) parts.push(HIDDEN_CLASS);
			if (hidden !== true && index !== -1) parts.splice(index, 1);
			var next = parts.join(' ');
			if (next === current) return;
			if (typeof row.className === 'string') row.className = next;
			else if (typeof row.setAttribute === 'function') row.setAttribute('class', next);
		}

		function ensureRows(root) {
			if (root === null || root === undefined || typeof root.querySelectorAll !== 'function') return;
			var rows;
			try { rows = collectNodes(root.querySelectorAll('[data-row-key]')); } catch (error) { rows = []; }
			if (rows.length === 0) return;
			var view = currentView();
			for (var index = 0; index < rows.length; index += 1) {
				var row = rows[index];
				if (row === null || row === undefined || typeof row.getAttribute !== 'function') continue;
				var rawKey = row.getAttribute('data-row-key');
				var decision = visibilityOfRow(rawKey, view);
				setRowHidden(row, !decision.visible);
				if (decision.visible && decision.kind === 'workspace') ensureWorkspaceRow(row);
			}
		}

		function removeAllInjected() {
			var doc = domDocument();
			if (doc === null) return;
			var nodes;
			try { nodes = collectNodes(doc.querySelectorAll('[' + ATTR + ']')); } catch (error) { nodes = []; }
			for (var index = 0; index < nodes.length; index += 1) {
				var node = nodes[index];
				if (node !== null && node !== undefined && node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
			}
		}

		function ensureNow() {
			if (domDocument() === null) return false;
			var root = sidebarRoot();
			if (root === null || root === undefined) return false;
			var header = findWorkspaceSectionHeader(root);
			if (header !== null && header !== undefined) {
				try { ensureToggle(header); } catch (error) {
					try { console.warn('dsh-workspace-vault: toggle decoration failed', error); } catch (inner) { /* no console */ }
				}
				try { ensureBanner(root, header); } catch (error) {
					try { console.warn('dsh-workspace-vault: banner decoration failed', error); } catch (inner) { /* no console */ }
				}
			}
			try { ensureRows(root); } catch (error) {
				try { console.warn('dsh-workspace-vault: row decoration failed', error); } catch (inner) { /* no console */ }
			}
			try { maybeReapplyPinnedOrder(); } catch (error) {
				try { console.warn('dsh-workspace-vault: pin reapply check failed', error); } catch (inner) { /* no console */ }
			}
			return true;
		}

		function safeEnsure() {
			try { return ensureNow(); } catch (error) {
				try { console.warn('dsh-workspace-vault: decoration pass failed', error); } catch (inner) { /* no console */ }
				return false;
			}
		}

		function startDecorating() {
			safeEnsure();
			var timer = null;
			var schedule = function () {
				if (timer !== null) return;
				timer = setTimeout(function () {
					timer = null;
					safeEnsure();
				}, 100);
			};
			var observer = null;
			var Observer = typeof MutationObserver !== 'undefined' ? MutationObserver : (typeof window !== 'undefined' && window !== null ? window.MutationObserver : undefined);
			var doc = domDocument();
			if (doc !== null && typeof Observer === 'function' && doc.body !== null && doc.body !== undefined) {
				try {
					observer = new Observer(schedule);
					observer.observe(doc.body, { childList: true, subtree: true });
				} catch (error) {
					observer = null;
				}
			}
			var unsubscribe = subscribe(schedule);
			var unsubscribeWorkspaces = null;
			try {
				var workspaces = getService('workspaces');
				if (workspaces !== undefined && workspaces !== null && workspaces.list && typeof workspaces.list.subscribe === 'function') {
					var disposeWorkspaces = workspaces.list.subscribe(schedule);
					if (typeof disposeWorkspaces === 'function') unsubscribeWorkspaces = disposeWorkspaces;
				}
			} catch (error) { /* snapshot store without subscribe */ }
			return function dispose() {
				if (timer !== null) {
					try { clearTimeout(timer); } catch (error) { /* cleared */ }
					timer = null;
				}
				if (observer !== null && observer !== undefined && typeof observer.disconnect === 'function') {
					try { observer.disconnect(); } catch (error) { /* already gone */ }
					observer = null;
				}
				try { unsubscribe(); } catch (error) { /* already gone */ }
				try { if (typeof unsubscribeWorkspaces === 'function') unsubscribeWorkspaces(); } catch (error) { /* already gone */ }
				removeAllInjected();
			};
		}

		function closestRowElement(target) {
			var node = target;
			var depth = 0;
			while (node !== null && node !== undefined && depth < 32) {
				if (typeof node.getAttribute === 'function') {
					var key = node.getAttribute('data-row-key');
					if (typeof key === 'string') return node;
				}
				node = node.parentElement !== undefined && node.parentElement !== null ? node.parentElement : node.parentNode;
				depth += 1;
			}
			return null;
		}

		function isWithin(target, ancestor) {
			var node = target;
			var depth = 0;
			while (node !== null && node !== undefined && depth < 64) {
				if (node === ancestor) return true;
				node = node.parentElement !== undefined && node.parentElement !== null ? node.parentElement : node.parentNode;
				depth += 1;
			}
			return false;
		}

		function isOurInjectedNode(node) {
			if (node === null || node === undefined || typeof node.getAttribute !== 'function') return false;
			return node.getAttribute(ATTR) !== null;
		}

		function isInsideOurInjection(target, row) {
			var node = target;
			var depth = 0;
			while (node !== null && node !== undefined && depth < 64) {
				if (isOurInjectedNode(node)) return true;
				if (node === row) return false;
				node = node.parentElement !== undefined && node.parentElement !== null ? node.parentElement : node.parentNode;
				depth += 1;
			}
			return false;
		}

		/** The native "…" row-menu trigger: first button in rowActions that is not ours. */
		function findNativeRowMenuButton(row) {
			if (row === null || row === undefined || typeof row.querySelector !== 'function') return null;
			var actions = null;
			try { actions = row.querySelector('[class*="rowActions"]'); } catch (error) { actions = null; }
			if (actions === null || actions === undefined) return null;
			var buttons = [];
			try { buttons = collectNodes(actions.querySelectorAll('button')); } catch (error) { buttons = []; }
			if (buttons.length === 0) {
				var stack = [actions];
				while (stack.length > 0) {
					var current = stack.shift();
					var children = current !== null && current !== undefined && Array.isArray(current.children) ? current.children : [];
					for (var childIndex = 0; childIndex < children.length; childIndex += 1) {
						var child = children[childIndex];
						if (child !== null && child !== undefined && String(child.tagName).toLowerCase() === 'button') buttons.push(child);
						else stack.push(child);
					}
				}
			}
			for (var index = 0; index < buttons.length; index += 1) {
				if (!isOurInjectedNode(buttons[index])) return buttons[index];
			}
			return null;
		}

		function addWorkspaceLabels(locale) {
			var labels = [];
			try {
				if (locale !== null && locale !== undefined && typeof locale.bind === 'function') {
					var bound = locale.bind('workspace');
					var projected = bound('workspace.add');
					if (typeof projected === 'string' && projected.length > 0 && projected !== 'workspace.add') labels.push(projected);
				}
			} catch (error) { /* fall through */ }
			labels.push('添加工作区', 'Add workspace', 'Add Workspace');
			return labels;
		}

		/** Localised native "add workspace" trigger (inside the section header actions). */
		function findAddWorkspaceTrigger(target, labels) {
			var node = target;
			var hops = 0;
			while (node !== null && node !== undefined && hops < 8) {
				if (typeof node.getAttribute === 'function') {
					var label = node.getAttribute('aria-label');
					if (typeof label === 'string' && labels.indexOf(label) !== -1) return node;
				}
				node = node.parentElement !== undefined && node.parentElement !== null ? node.parentElement : node.parentNode;
				hops += 1;
			}
			return null;
		}

		// ---- Workspace "…" menu (store + pure item builder) ------------------
		function menuPositionForRow(row) {
			var rect = null;
			try { rect = row !== null && row !== undefined && typeof row.getBoundingClientRect === 'function' ? row.getBoundingClientRect() : null; } catch (error) { rect = null; }
			var width = 1280;
			var height = 800;
			try {
				if (typeof window !== 'undefined' && window !== null) {
					if (typeof window.innerWidth === 'number' && window.innerWidth > 0) width = window.innerWidth;
					if (typeof window.innerHeight === 'number' && window.innerHeight > 0) height = window.innerHeight;
				}
			} catch (error) { /* no window metrics */ }
			var menuWidth = 208;
			var menuHeight = 232;
			var x = 12;
			var y = 12;
			if (rect !== null && typeof rect.right === 'number' && typeof rect.top === 'number') {
				x = rect.right + 6;
				y = rect.top - 4;
			}
			if (x + menuWidth > width - 8) x = width - menuWidth - 8;
			if (y + menuHeight > height - 8) y = height - menuHeight - 8;
			if (x < 8) x = 8;
			if (y < 8) y = 8;
			return { x: Math.round(x), y: Math.round(y) };
		}

		function openWorkspaceMenu(workspaceId, position) {
			if (typeof workspaceId !== 'string' || workspaceId === '') return null;
			var pos = position !== null && position !== undefined && typeof position === 'object' ? position : { x: 12, y: 12 };
			var menu = {
				workspaceId: workspaceId,
				x: typeof pos.x === 'number' ? pos.x : 12,
				y: typeof pos.y === 'number' ? pos.y : 12,
				title: typeof pos.title === 'string' && pos.title !== '' ? pos.title : workspaceTitleById(workspaceId),
			};
			patch({ menu: menu });
			return menu;
		}

		function closeWorkspaceMenu() {
			if (store.menu !== null) patch({ menu: null });
		}

		function menuWarn(operation) {
			return function (reason) {
				try { console.warn('dsh-workspace-vault: ' + operation + ' failed', reason); } catch (error) { /* no console */ }
			};
		}

		/** Build the current menu items for one workspace (labels follow live state). */
		function workspaceMenuItems(workspaceId) {
			var pinned = isPinned(workspaceId);
			var encrypted = isEncrypted(workspaceId);
			var unlocked = isUnlocked(workspaceId);
			var hidden = isHidden(workspaceId);
			var items = [];
			items.push({
				id: 'pin', separator: false, danger: false, icon: pinned ? SVG_PIN_ON : SVG_PIN,
				label: pinned ? translate('row.unpin') : translate('row.pin'),
				run: function () { closeWorkspaceMenu(); toggleWorkspacePin(workspaceId).catch(menuWarn('pin')); },
			});
			items.push({
				id: 'lock', separator: false, danger: false, glyph: '\u25a3',
				label: !encrypted ? translate('row.encrypt') : (unlocked ? translate('row.decrypt') : translate('row.unlock')),
				run: function () { closeWorkspaceMenu(); toggleWorkspaceLock(workspaceId); },
			});
			items.push({
				id: 'hidden', separator: false, danger: false, glyph: '\u25c8',
				label: hidden ? translate('row.unhide') : translate('row.hide'),
				run: function () { closeWorkspaceMenu(); setWorkspaceHidden(workspaceId, !isHidden(workspaceId)).catch(menuWarn('hidden toggle')); },
			});
			items.push({ id: 'sep', separator: true, danger: false, label: '', run: function () {} });
			items.push({
				id: 'rename', separator: false, danger: false, glyph: '\u270e', label: translate('menu.rename'),
				run: function () { closeWorkspaceMenu(); openRenameDialog(workspaceId); },
			});
			items.push({
				id: 'delete', separator: false, danger: true, glyph: '\u2421', label: translate('menu.delete'),
				run: function () { closeWorkspaceMenu(); openDeleteDialog(workspaceId); },
			});
			return items;
		}

		// ---- Rename / delete dialogs (native capability preserved) ----------
		function openRenameDialog(workspaceId) {
			patch({ kind: 'rename', workspaceId: workspaceId, purpose: null, workspaceTitle: workspaceTitleById(workspaceId) });
		}

		function openDeleteDialog(workspaceId) {
			patch({ kind: 'delete', workspaceId: workspaceId, purpose: null, workspaceTitle: workspaceTitleById(workspaceId) });
		}

		function performRenameWorkspace(title) {
			var workspaceId = store.workspaceId;
			var trimmed = typeof title === 'string' ? title.trim() : '';
			if (workspaceId === null || workspaceId === undefined || workspaceId === '') return Promise.reject(new Error(translate('error.unknownWorkspace')));
			if (trimmed === '') return Promise.reject(new Error(translate('error.renameRequired')));
			var workspaces = getService('workspaces');
			if (workspaces === undefined || workspaces === null || typeof workspaces.rename !== 'function') return Promise.reject(new Error(translate('error.serviceUnavailable')));
			return Promise.resolve().then(function () { return workspaces.rename(workspaceId, trimmed); }).then(function (result) {
				closeDialog();
				refreshAll();
				return result;
			});
		}

		function performDeleteWorkspace() {
			var workspaceId = store.workspaceId;
			if (workspaceId === null || workspaceId === undefined || workspaceId === '') return Promise.reject(new Error(translate('error.unknownWorkspace')));
			var workspaces = getService('workspaces');
			if (workspaces === undefined || workspaces === null || typeof workspaces.delete !== 'function') return Promise.reject(new Error(translate('error.serviceUnavailable')));
			return Promise.resolve().then(function () { return workspaces.delete(workspaceId); }).then(function (result) {
				closeDialog();
				refreshAll();
				return result;
			});
		}

		// ---- Pin order re-apply (host route with body.reapply) ---------------
		function pinnedPrefixMatches(snapshot) {
			var pinned = state.pinnedIds;
			if (!Array.isArray(pinned) || pinned.length === 0) return true;
			var items = snapshot !== null && snapshot !== undefined && Array.isArray(snapshot.items) ? snapshot.items : null;
			if (items === null) return true;
			var ids = [];
			for (var index = 0; index < items.length; index += 1) {
				var item = items[index];
				if (item !== null && typeof item === 'object' && typeof item.workspaceId === 'string') ids.push(item.workspaceId);
			}
			for (var pinnedIndex = 0; pinnedIndex < pinned.length; pinnedIndex += 1) {
				if (ids[pinnedIndex] !== pinned[pinnedIndex]) return false;
			}
			return true;
		}

		var lastReapplyAt = 0;
		var reapplyInFlight = false;

		/**
		 * Host registry order can lag `pinnedWorkspaceIds` after a restart. Ask the
		 * host to re-apply the stored order once (throttled), never loop pin calls.
		 */
		function maybeReapplyPinnedOrder() {
			if (reapplyInFlight) return false;
			// Never race an explicit pin/unpin click: the user's action owns the
			// membership, and a reapply fired behind it can put the old pin back.
			if (pinActionInFlight > 0) return false;
			if (Date.now() - lastPinActionAt < REAPPLY_PIN_COOLDOWN_MS) return false;
			if (!Array.isArray(state.pinnedIds) || state.pinnedIds.length === 0) return false;
			var now = Date.now();
			if (now - lastReapplyAt < REAPPLY_THROTTLE_MS) return false;
			var snapshot = workspacesSnapshot();
			if (pinnedPrefixMatches(snapshot)) return false;
			lastReapplyAt = now;
			reapplyInFlight = true;
			var revision = pinRevision;
			var finish = function () { reapplyInFlight = false; };
			requestJson(PIN_WORKSPACE_PATH, 'POST', { reapply: true }).then(function (payload) {
				// A pin action happened while this request was in flight: its response
				// is authoritative, so drop the stale reapply projection.
				if (revision === pinRevision) applyPinnedResult(payload);
				refreshAll();
				finish();
			}).catch(function (reason) {
				try { console.warn('dsh-workspace-vault: reapply pins failed', reason); } catch (error) { /* no console */ }
				finish();
			});
			return true;
		}

		// ---- Capture-phase guards -------------------------------------------
		function interceptEvent(event) {
			if (event === null || event === undefined) return;
			if (typeof event.preventDefault === 'function') event.preventDefault();
			if (typeof event.stopPropagation === 'function') event.stopPropagation();
			if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
		}

		/**
		 * One document-capture handler for workspace rows:
		 *  - the native "…" button opens our own menu (rename/delete never lost);
		 *  - clicks on our injected buttons pass through (pin still works when locked);
		 *  - a locked workspace row opens the unlock dialog instead of expanding.
		 */
		function handleRowClickCapture(event) {
			if (event === null || event === undefined) return;
			try {
				var row = closestRowElement(event.target);
				if (row === null) return;
				var parsed = parseRowKey(typeof row.getAttribute === 'function' ? row.getAttribute('data-row-key') : null);
				if (parsed === null || parsed.kind !== 'workspace' || parsed.id === '') return;
				var workspaceId = parsed.id;
				var menuButton = findNativeRowMenuButton(row);
				if (menuButton !== null && isWithin(event.target, menuButton)) {
					interceptEvent(event);
					openWorkspaceMenu(workspaceId, menuPositionForRow(row));
					return;
				}
				if (isInsideOurInjection(event.target, row)) return;
				if (!isEncrypted(workspaceId) || isUnlocked(workspaceId)) return;
				interceptEvent(event);
				openUnlockDialog({ purpose: 'workspace', workspaceId: workspaceId, workspaceTitle: workspaceTitleById(workspaceId) });
			} catch (error) {
				try { console.warn('dsh-workspace-vault: row guard failed', error); } catch (inner) { /* no console */ }
			}
		}

		function installRowClickGuard() {
			var doc = domDocument();
			if (doc === null || typeof doc.addEventListener !== 'function') return function () {};
			doc.addEventListener('click', handleRowClickCapture, true);
			return function () {
				if (typeof doc.removeEventListener === 'function') doc.removeEventListener('click', handleRowClickCapture, true);
			};
		}

		/**
		 * In hidden mode the native "＋" must open OUR hidden-workspace dialog, not
		 * the normal create flow. Listen on `window` capture so the earlier
		 * workspace-plus document listener cannot claim the click first.
		 */
		function installHiddenModeAddGuard() {
			var host = null;
			try {
				if (typeof window !== 'undefined' && window !== null && typeof window.addEventListener === 'function') host = window;
			} catch (error) { host = null; }
			if (host === null) {
				var doc = domDocument();
				if (doc !== null && typeof doc.addEventListener === 'function') host = doc;
			}
			if (host === null) return function () {};
			var locale = null;
			try { locale = pluginCtx !== null && typeof pluginCtx.get === 'function' ? pluginCtx.get('locale') : undefined; } catch (error) { locale = null; }
			var labels = addWorkspaceLabels(locale);
			var onCapture = function (event) {
				try {
					if (event === null || event === undefined) return;
					if (state.hiddenMode !== true) return;
					var trigger = findAddWorkspaceTrigger(event.target, labels);
					if (trigger === null) return;
					interceptEvent(event);
					openCreateHiddenDialog();
				} catch (error) {
					try { console.warn('dsh-workspace-vault: hidden add guard failed', error); } catch (inner) { /* no console */ }
				}
			};
			host.addEventListener('click', onCapture, true);
			return function () {
				if (typeof host.removeEventListener === 'function') host.removeEventListener('click', onCapture, true);
			};
		}

		// ==== React components ===============================================
		function stopPropagation(event) {
			if (event !== null && event !== undefined && typeof event.stopPropagation === 'function') event.stopPropagation();
		}

		function onBackdropClick(event) {
			if (event !== null && event !== undefined && event.target === event.currentTarget) closeDialog();
		}

		function dialogShell(t, title, children) {
			var footers = [];
			for (var index = 3; index < arguments.length; index += 1) {
				var candidate = arguments[index];
				if (Array.isArray(candidate)) {
					for (var cursor = 0; cursor < candidate.length; cursor += 1) footers.push(candidate[cursor]);
				} else if (candidate !== null && candidate !== undefined) {
					footers.push(candidate);
				}
			}
			return React.createElement('div', { className: 'dsh-workspace-vault__backdrop', onClick: onBackdropClick },
				React.createElement('div', {
					className: 'dsh-workspace-vault__card',
					role: 'dialog',
					'aria-modal': 'true',
					'aria-label': title,
					onClick: stopPropagation,
				},
				React.createElement('span', { className: 'dsh-workspace-vault__bar', 'aria-hidden': 'true' }),
				React.createElement('h2', { className: 'dsh-workspace-vault__title' }, title),
				children,
				React.createElement('div', { className: 'dsh-workspace-vault__footer' }, footers)));
		}

		function dialogIntro(text) {
			return React.createElement('p', { className: 'dsh-workspace-vault__intro' }, text);
		}

		function dialogLabel(t, text, htmlFor) {
			return React.createElement('label', { className: 'dsh-workspace-vault__label', htmlFor: htmlFor }, text);
		}

		function dialogInput(options) {
			return React.createElement('input', {
				id: options.id,
				className: 'dsh-workspace-vault__input',
				type: options.type || 'text',
				value: options.value,
				placeholder: options.placeholder,
				autoFocus: options.autoFocus === true,
				disabled: options.disabled === true,
				onChange: options.onChange,
				onKeyDown: options.onKeyDown,
			});
		}

		function dialogHint(text) {
			return React.createElement('p', { className: 'dsh-workspace-vault__hint' }, text);
		}

		function dialogError(message) {
			if (message === null || message === undefined || message === '') return null;
			return React.createElement('p', { className: 'dsh-workspace-vault__error', role: 'alert' }, message);
		}

		function primaryButton(label, disabled, onClick) {
			return React.createElement('button', { type: 'button', className: 'dsh-workspace-vault__btn dsh-workspace-vault__btn--primary', disabled: disabled === true, onClick: onClick }, label);
		}

		function secondaryButton(label, disabled, onClick) {
			return React.createElement('button', { type: 'button', className: 'dsh-workspace-vault__btn', disabled: disabled === true, onClick: onClick }, label);
		}

		function dangerButton(label, disabled, onClick) {
			return React.createElement('button', { type: 'button', className: 'dsh-workspace-vault__btn dsh-workspace-vault__btn--danger', disabled: disabled === true, onClick: onClick }, label);
		}

		function linkButton(label, onClick) {
			return React.createElement('button', { type: 'button', className: 'dsh-workspace-vault__btn dsh-workspace-vault__btn--link', onClick: onClick }, label);
		}

		function validatePasswordPair(password, confirm) {
			if (typeof password !== 'string' || password.length === 0) return translate('error.passwordRequired');
			if (password.length < 4 || password.length > 128) return translate('error.passwordRule');
			if (password !== confirm) return translate('error.passwordMismatch');
			return null;
		}

		function enterKeySubmit(event, submit) {
			if (event !== null && event !== undefined && event.key === 'Enter') {
				if (typeof event.preventDefault === 'function') event.preventDefault();
				submit();
			}
		}

		/** Run one dialog submit: local validation, busy flag, host error copy. */
		function runSubmit(validate, work, setters) {
			if (setters.busy === true) return;
			var message = validate();
			if (message !== null) {
				setters.setError(message);
				return;
			}
			setters.setError(null);
			setters.setBusy(true);
			Promise.resolve().then(function () { return work(); }).then(function () {
				setters.setBusy(false);
			}).catch(function (reason) {
				setters.setBusy(false);
				setters.setError(errorText(reason));
			});
		}

		// ---- Setup password -------------------------------------------------
		function PasswordSetupForm(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var passwordState = React.useState('');
			var confirmState = React.useState('');
			var phoneState = React.useState('');
			var busyState = React.useState(false);
			var errorState = React.useState(null);
			var setBusy = busyState[1];
			var setError = errorState[1];
			var setters = { busy: busyState[0], setBusy: setBusy, setError: setError };
			var submit = function () {
				runSubmit(function () {
					var passwordMessage = validatePasswordPair(passwordState[0], confirmState[0]);
					if (passwordMessage !== null) return passwordMessage;
					var digits = normalizePhone(phoneState[0]);
					if (digits !== '' && (digits.length < 6 || digits.length > 20)) return t('error.phoneFormat');
					return null;
				}, function () {
					return performSetupPassword(passwordState[0], phoneState[0]);
				}, setters);
			};
			var onKeyDown = function (event) { enterKeySubmit(event, submit); };
			return dialogShell(t, t('setup.title'),
				React.createElement('div', null,
					dialogIntro(t('setup.intro')),
					dialogLabel(t, t('setup.password'), 'dsh-workspace-vault-setup-password'),
					dialogInput({
						id: 'dsh-workspace-vault-setup-password',
						type: 'password',
						value: passwordState[0],
						placeholder: t('setup.passwordPlaceholder'),
						autoFocus: true,
						disabled: busyState[0],
						onChange: function (event) { passwordState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogLabel(t, t('setup.confirm'), 'dsh-workspace-vault-setup-confirm'),
					dialogInput({
						id: 'dsh-workspace-vault-setup-confirm',
						type: 'password',
						value: confirmState[0],
						disabled: busyState[0],
						onChange: function (event) { confirmState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogLabel(t, t('setup.phone'), 'dsh-workspace-vault-setup-phone'),
					dialogInput({
						id: 'dsh-workspace-vault-setup-phone',
						type: 'tel',
						value: phoneState[0],
						placeholder: t('setup.phonePlaceholder'),
						disabled: busyState[0],
						onChange: function (event) { phoneState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogHint(t('setup.phoneHint')),
					dialogError(errorState[0])),
				React.createElement('span', { className: 'dsh-workspace-vault__footerLeft' }, secondaryButton(t('unlock.cancel'), busyState[0], function () { closeDialog(); })),
				primaryButton(t('setup.submit'), busyState[0], submit));
		}

		// ---- Unlock ---------------------------------------------------------
		function UnlockForm(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var passwordState = React.useState('');
			var busyState = React.useState(false);
			var errorState = React.useState(null);
			var setters = { busy: busyState[0], setBusy: busyState[1], setError: errorState[1] };
			var submit = function () {
				runSubmit(function () {
					if (typeof passwordState[0] !== 'string' || passwordState[0].length === 0) return t('error.passwordRequired');
					return null;
				}, function () {
					return performUnlockPassword(passwordState[0], currentDialogOptions());
				}, setters);
			};
			var onKeyDown = function (event) { enterKeySubmit(event, submit); };
			return dialogShell(t, t('unlock.title'),
				React.createElement('div', null,
					dialogIntro(t('unlock.intro')),
					dialogLabel(t, t('unlock.password'), 'dsh-workspace-vault-unlock-password'),
					dialogInput({
						id: 'dsh-workspace-vault-unlock-password',
						type: 'password',
						value: passwordState[0],
						autoFocus: true,
						disabled: busyState[0],
						onChange: function (event) { passwordState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogError(errorState[0])),
				React.createElement('span', { className: 'dsh-workspace-vault__footerLeft' },
					linkButton(t('unlock.forgot'), function () { openRecoverDialog(); }),
					secondaryButton(t('unlock.cancel'), busyState[0], function () { closeDialog(); })),
				primaryButton(t('unlock.submit'), busyState[0], submit));
		}

		// ---- Recover --------------------------------------------------------
		function RecoverForm(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var phoneState = React.useState('');
			var passwordState = React.useState('');
			var confirmState = React.useState('');
			var busyState = React.useState(false);
			var errorState = React.useState(null);
			var setters = { busy: busyState[0], setBusy: busyState[1], setError: errorState[1] };
			var submit = function () {
				runSubmit(function () {
					var digits = normalizePhone(phoneState[0]);
					if (digits === '') return t('error.phoneRequired');
					if (digits.length < 6 || digits.length > 20) return t('error.phoneFormat');
					return validatePasswordPair(passwordState[0], confirmState[0]);
				}, function () {
					return performRecoverPassword(phoneState[0], passwordState[0]);
				}, setters);
			};
			var onKeyDown = function (event) { enterKeySubmit(event, submit); };
			return dialogShell(t, t('recover.title'),
				React.createElement('div', null,
					dialogIntro(t('recover.intro')),
					dialogLabel(t, t('recover.phone'), 'dsh-workspace-vault-recover-phone'),
					dialogInput({
						id: 'dsh-workspace-vault-recover-phone',
						type: 'tel',
						value: phoneState[0],
						autoFocus: true,
						disabled: busyState[0],
						onChange: function (event) { phoneState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogLabel(t, t('recover.password'), 'dsh-workspace-vault-recover-password'),
					dialogInput({
						id: 'dsh-workspace-vault-recover-password',
						type: 'password',
						value: passwordState[0],
						disabled: busyState[0],
						onChange: function (event) { passwordState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogLabel(t, t('recover.confirm'), 'dsh-workspace-vault-recover-confirm'),
					dialogInput({
						id: 'dsh-workspace-vault-recover-confirm',
						type: 'password',
						value: confirmState[0],
						disabled: busyState[0],
						onChange: function (event) { confirmState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogError(errorState[0])),
				React.createElement('span', { className: 'dsh-workspace-vault__footerLeft' },
					linkButton(t('recover.back'), function () { openUnlockDialog({ purpose: store.purpose, workspaceId: store.workspaceId, workspaceTitle: store.workspaceTitle }); }),
					secondaryButton(t('unlock.cancel'), busyState[0], function () { closeDialog(); })),
				primaryButton(t('recover.submit'), busyState[0], submit));
		}

		// ---- Create hidden workspace ---------------------------------------
		function CreateHiddenForm(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var nameState = React.useState('');
			var busyState = React.useState(false);
			var errorState = React.useState(null);
			var setters = { busy: busyState[0], setBusy: busyState[1], setError: errorState[1] };
			var submit = function () {
				runSubmit(function () {
					if (typeof nameState[0] !== 'string' || nameState[0].trim() === '') return t('error.nameRequired');
					return null;
				}, function () {
					return performCreateHidden(nameState[0].trim());
				}, setters);
			};
			var onKeyDown = function (event) { enterKeySubmit(event, submit); };
			return dialogShell(t, t('create.title'),
				React.createElement('div', null,
					dialogIntro(t('create.intro')),
					dialogLabel(t, t('create.name'), 'dsh-workspace-vault-create-name'),
					dialogInput({
						id: 'dsh-workspace-vault-create-name',
						type: 'text',
						value: nameState[0],
						placeholder: t('create.namePlaceholder'),
						autoFocus: true,
						disabled: busyState[0],
						onChange: function (event) { nameState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogError(errorState[0])),
				React.createElement('span', { className: 'dsh-workspace-vault__footerLeft' }, secondaryButton(t('unlock.cancel'), busyState[0], function () { closeDialog(); })),
				primaryButton(busyState[0] ? t('create.creating') : t('create.submit'), busyState[0], submit));
		}

		// ---- Encrypt workspace ---------------------------------------------
		function EncryptForm(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var passwordState = React.useState('');
			var busyState = React.useState(false);
			var errorState = React.useState(null);
			var setters = { busy: busyState[0], setBusy: busyState[1], setError: errorState[1] };
			var submit = function () {
				runSubmit(function () {
					if (typeof passwordState[0] !== 'string' || passwordState[0].length === 0) return t('error.passwordRequired');
					return null;
				}, function () {
					return performEncryptWorkspace(passwordState[0]);
				}, setters);
			};
			var onKeyDown = function (event) { enterKeySubmit(event, submit); };
			var target = store.workspaceTitle !== null && store.workspaceTitle !== undefined ? React.createElement('p', { className: 'dsh-workspace-vault__target' }, t('encrypt.target', { title: store.workspaceTitle })) : null;
			return dialogShell(t, t('encrypt.title'),
				React.createElement('div', null,
					target,
					dialogIntro(t('encrypt.intro')),
					dialogLabel(t, t('encrypt.password'), 'dsh-workspace-vault-encrypt-password'),
					dialogInput({
						id: 'dsh-workspace-vault-encrypt-password',
						type: 'password',
						value: passwordState[0],
						autoFocus: true,
						disabled: busyState[0],
						onChange: function (event) { passwordState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogError(errorState[0])),
				React.createElement('span', { className: 'dsh-workspace-vault__footerLeft' }, secondaryButton(t('unlock.cancel'), busyState[0], function () { closeDialog(); })),
				primaryButton(t('encrypt.submit'), busyState[0], submit));
		}

		// ---- Rename workspace (native capability) --------------------------
		function RenameWorkspaceForm(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var titleState = React.useState(store.workspaceTitle !== null && store.workspaceTitle !== undefined ? store.workspaceTitle : '');
			var busyState = React.useState(false);
			var errorState = React.useState(null);
			var setters = { busy: busyState[0], setBusy: busyState[1], setError: errorState[1] };
			var submit = function () {
				runSubmit(function () {
					if (typeof titleState[0] !== 'string' || titleState[0].trim() === '') return t('error.renameRequired');
					return null;
				}, function () {
					return performRenameWorkspace(titleState[0]);
				}, setters);
			};
			var onKeyDown = function (event) { enterKeySubmit(event, submit); };
			var current = store.workspaceTitle !== null && store.workspaceTitle !== undefined ? React.createElement('p', { className: 'dsh-workspace-vault__target' }, store.workspaceTitle) : null;
			return dialogShell(t, t('rename.title'),
				React.createElement('div', null,
					current,
					dialogLabel(t, t('rename.label'), 'dsh-workspace-vault-rename-title'),
					dialogInput({
						id: 'dsh-workspace-vault-rename-title',
						type: 'text',
						value: titleState[0],
						autoFocus: true,
						disabled: busyState[0],
						onChange: function (event) { titleState[1](event !== null && event !== undefined && event.target ? event.target.value : ''); },
						onKeyDown: onKeyDown,
					}),
					dialogError(errorState[0])),
				React.createElement('span', { className: 'dsh-workspace-vault__footerLeft' }, secondaryButton(t('unlock.cancel'), busyState[0], function () { closeDialog(); })),
				primaryButton(busyState[0] ? t('rename.saving') : t('rename.submit'), busyState[0], submit));
		}

		// ---- Delete workspace (native capability; keeps folder/sessions) ---
		function DeleteWorkspaceForm(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var busyState = React.useState(false);
			var errorState = React.useState(null);
			var setters = { busy: busyState[0], setBusy: busyState[1], setError: errorState[1] };
			var submit = function () {
				runSubmit(function () { return null; }, function () {
					return performDeleteWorkspace();
				}, setters);
			};
			return dialogShell(t, t('delete.title'),
				React.createElement('div', null,
					dialogIntro(t('delete.intro', { title: store.workspaceTitle !== null && store.workspaceTitle !== undefined ? store.workspaceTitle : '' })),
					dialogError(errorState[0])),
				React.createElement('span', { className: 'dsh-workspace-vault__footerLeft' }, secondaryButton(t('unlock.cancel'), busyState[0], function () { closeDialog(); })),
				dangerButton(busyState[0] ? t('delete.deleting') : t('delete.submit'), busyState[0], submit));
		}

		// ---- Workspace "…" menu overlay ------------------------------------
		function WorkspaceMenuOverlay(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var versionState = React.useState(0);
			var setVersion = versionState[1];
			var menuRef = React.useRef(null);
			React.useEffect(function () {
				return subscribe(function () { setVersion(function (value) { return value + 1; }); });
			}, []);
			React.useEffect(function () {
				if (store.menu === null) return undefined;
				if (typeof document === 'undefined' || document === null || typeof document.addEventListener !== 'function') return undefined;
				var onKeyDown = function (event) {
					if (event === null || event === undefined) return;
					if (event.key !== 'Escape' && event.key !== 'Esc') return;
					if (typeof event.preventDefault === 'function') event.preventDefault();
					closeWorkspaceMenu();
				};
				var onPointerDown = function (event) {
					var menu = menuRef.current;
					if (menu !== null && menu !== undefined && typeof menu.contains === 'function' && event !== null && event !== undefined && menu.contains(event.target)) return;
					closeWorkspaceMenu();
				};
				document.addEventListener('keydown', onKeyDown, true);
				document.addEventListener('mousedown', onPointerDown, true);
				return function () {
					document.removeEventListener('keydown', onKeyDown, true);
					document.removeEventListener('mousedown', onPointerDown, true);
				};
			}, [store.menu]);
			if (store.menu === null) return null;
			var menu = store.menu;
			var items = workspaceMenuItems(menu.workspaceId);
			var children = [];
			for (var index = 0; index < items.length; index += 1) {
				var item = items[index];
				if (item.separator === true) {
					children.push(React.createElement('div', { key: 'sep-' + index, className: 'dsh-workspace-vault__menuSep', role: 'separator' }));
					continue;
				}
				children.push(React.createElement('button', {
					key: item.id,
					type: 'button',
					className: 'dsh-workspace-vault__menuItem' + (item.danger === true ? ' is-danger' : ''),
					role: 'menuitem',
					'aria-label': item.label,
					title: item.label,
					onClick: item.run,
				},
				React.createElement('span', { className: 'dsh-workspace-vault__menuGlyph', 'aria-hidden': 'true', dangerouslySetInnerHTML: item.icon !== undefined ? { __html: item.icon } : undefined }, item.icon !== undefined ? undefined : item.glyph),
				React.createElement('span', null, item.label)));
			}
			return React.createElement('div', {
				ref: menuRef,
				className: 'dsh-workspace-vault__menu',
				role: 'menu',
				'aria-label': t('menu.aria'),
				style: { left: menu.x, top: menu.y },
				onClick: stopPropagation,
			}, children);
		}

		// ---- Umbrella overlay ----------------------------------------------
		function VaultOverlay(props) {
			var versionState = React.useState(0);
			var setVersion = versionState[1];
			React.useEffect(function () {
				return subscribe(function () { setVersion(function (value) { return value + 1; }); });
			}, []);
			React.useEffect(function () {
				if (store.kind === null) return undefined;
				if (typeof document === 'undefined' || document === null || typeof document.addEventListener !== 'function') return undefined;
				var onKeyDown = function (event) {
					if (event === null || event === undefined) return;
					if (event.key !== 'Escape' && event.key !== 'Esc') return;
					if (typeof event.preventDefault === 'function') event.preventDefault();
					closeDialog();
				};
				document.addEventListener('keydown', onKeyDown, true);
				return function () { document.removeEventListener('keydown', onKeyDown, true); };
			}, [store.kind]);
			if (store.kind === null) return null;
			if (store.kind === 'setup') return React.createElement(PasswordSetupForm, { t: props !== null && props !== undefined ? props.t : undefined });
			if (store.kind === 'unlock') return React.createElement(UnlockForm, { t: props !== null && props !== undefined ? props.t : undefined });
			if (store.kind === 'recover') return React.createElement(RecoverForm, { t: props !== null && props !== undefined ? props.t : undefined });
			if (store.kind === 'create-hidden') return React.createElement(CreateHiddenForm, { t: props !== null && props !== undefined ? props.t : undefined });
			if (store.kind === 'encrypt') return React.createElement(EncryptForm, { t: props !== null && props !== undefined ? props.t : undefined });
			if (store.kind === 'rename') return React.createElement(RenameWorkspaceForm, { t: props !== null && props !== undefined ? props.t : undefined });
			if (store.kind === 'delete') return React.createElement(DeleteWorkspaceForm, { t: props !== null && props !== undefined ? props.t : undefined });
			return null;
		}

		// ---- Main-content guard --------------------------------------------
		function MainGuardOverlay(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var versionState = React.useState(0);
			var setVersion = versionState[1];
			var bump = function () { setVersion(function (value) { return value + 1; }); };
			React.useEffect(function () {
				var disposers = [subscribe(bump)];
				var names = ['workspaces', 'sessions'];
				for (var index = 0; index < names.length; index += 1) {
					var service = getService(names[index]);
					try {
						if (service !== undefined && service !== null && service.list && typeof service.list.subscribe === 'function') {
							var dispose = service.list.subscribe(bump);
							if (typeof dispose === 'function') disposers.push(dispose);
						}
					} catch (error) { /* snapshot store without subscribe */ }
				}
				return function () {
					for (var cursor = 0; cursor < disposers.length; cursor += 1) {
						try { if (typeof disposers[cursor] === 'function') disposers[cursor](); } catch (error) { /* already gone */ }
					}
				};
			}, []);
			var decision = mainGuardDecision();
			if (decision === null) return null;
			var title = decision.kind === 'hidden' ? t('guard.hidden.title') : t('guard.encrypted.title');
			var body = decision.kind === 'hidden' ? t('guard.hidden.body') : t('guard.encrypted.body');
			var unlock = function () {
				if (decision.kind === 'hidden') openUnlockDialog({ purpose: 'hidden' });
				else openUnlockDialog({ purpose: 'workspace', workspaceId: decision.workspaceId, workspaceTitle: workspaceTitleById(decision.workspaceId) });
			};
			var leave = function () {
				var uiWorkspace = getService('uiWorkspace');
				try {
					if (decision.kind === 'hidden' && uiWorkspace !== undefined && uiWorkspace !== null && typeof uiWorkspace.openWorkspace === 'function') {
						var target = firstNonHiddenWorkspaceId();
						if (target !== null) {
							Promise.resolve(uiWorkspace.openWorkspace(target)).catch(function (reason) {
								try { console.warn('dsh-workspace-vault: leave hidden content failed', reason); } catch (error) { /* no console */ }
							});
							return;
						}
					}
					if (uiWorkspace !== undefined && uiWorkspace !== null && typeof uiWorkspace.clearMain === 'function') uiWorkspace.clearMain();
				} catch (error) {
					try { console.warn('dsh-workspace-vault: leave guarded content failed', error); } catch (inner) { /* no console */ }
				}
			};
			return React.createElement('div', { className: 'dsh-workspace-vault__guard', role: 'alertdialog', 'aria-label': title },
				React.createElement('div', { className: 'dsh-workspace-vault__guardCard' },
					React.createElement('span', { className: 'dsh-workspace-vault__guardGlyph', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: SVG_VAULT } }),
					React.createElement('h2', { className: 'dsh-workspace-vault__guardTitle' }, title),
					React.createElement('p', { className: 'dsh-workspace-vault__guardBody' }, body),
					React.createElement('div', { className: 'dsh-workspace-vault__footer' },
						secondaryButton(t('guard.leave'), false, leave),
						primaryButton(t('guard.unlock'), false, unlock)),
					React.createElement('p', { className: 'dsh-workspace-vault__guardNote' }, t('guard.note'))));
		}

		// ---- Pin-session header button -------------------------------------
		/**
		 * Standard slots provide `useWorkspaces`; older hosts may not, so fall back
		 * to a snapshot subscription. The branch is stable for one mounted widget.
		 */
		function usePinnedSessionIds(useWorkspacesSeat) {
			if (typeof useWorkspacesSeat === 'function') {
				return useWorkspacesSeat(function (snapshot) { return snapshot !== null && snapshot !== undefined ? snapshot.pinnedSessionIds : null; });
			}
			var pinnedState = React.useState(null);
			var pinned = pinnedState[0];
			var setPinned = pinnedState[1];
			React.useEffect(function () {
				var read = function () {
					var snapshot = workspacesSnapshot();
					setPinned(snapshot !== null && snapshot !== undefined ? snapshot.pinnedSessionIds : null);
				};
				read();
				var workspaces = getService('workspaces');
				try {
					if (workspaces !== undefined && workspaces !== null && workspaces.list && typeof workspaces.list.subscribe === 'function') {
						var dispose = workspaces.list.subscribe(read);
						if (typeof dispose === 'function') return dispose;
					}
				} catch (error) { /* no subscription */ }
				return undefined;
			}, []);
			return pinned;
		}

		function PinSessionButton(props) {
			var t = seatTranslate(props !== null && props !== undefined ? props.t : undefined);
			var seat = props !== null && props !== undefined && typeof props.useWorkspaces === 'function' ? props.useWorkspaces : null;
			// Hooks stay unconditional: the slot may mount before a session id exists.
			var pinnedIds = usePinnedSessionIds(seat);
			var sessionId = props !== null && props !== undefined && typeof props.sessionId === 'string' ? props.sessionId : '';
			if (sessionId === '') return null;
			var pinned = Array.isArray(pinnedIds) && pinnedIds.indexOf(sessionId) !== -1;
			var label = pinned ? t('task.unpin') : t('task.pin');
			var onClick = function (event) {
				if (event !== null && event !== undefined) {
					if (typeof event.preventDefault === 'function') event.preventDefault();
					if (typeof event.stopPropagation === 'function') event.stopPropagation();
				}
				var pending = pinned ? unpinSessionFor(sessionId) : pinSessionFor(sessionId);
				if (pending !== null && pending !== undefined && typeof pending.catch === 'function') {
					pending.catch(function (reason) {
						try { console.warn('dsh-workspace-vault: task pin failed', reason); } catch (error) { /* no console */ }
					});
				}
			};
			return React.createElement('button', {
				type: 'button',
				className: 'dsh-workspace-vault__headerBtn' + (pinned ? ' is-pinned' : ''),
				'aria-label': label,
				'aria-pressed': pinned,
				title: label,
				onClick: onClick,
			},
			React.createElement('span', { className: 'dsh-workspace-vault__headerBtnGlyph', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: pinned ? SVG_PIN_ON : SVG_PIN } }),
			React.createElement('span', null, label));
		}

		// ==== apply ===========================================================
		function addEffect(ctx, factory, label) {
			try {
				if (typeof ctx.effect === 'function') {
					ctx.effect(factory, label);
					return;
				}
				factory();
			} catch (error) {
				try { console.warn('dsh-workspace-vault: effect failed ' + label, error); } catch (inner) { /* no console */ }
			}
		}

		function addSlot(ctx, slotName, options, component) {
			try {
				if (!ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') return;
				ctx.slots.inject(slotName, function () {
					return ctx.slots.register(options, component);
				});
			} catch (error) {
				try { console.warn('dsh-workspace-vault: slot registration failed ' + slotName, error); } catch (inner) { /* no console */ }
			}
		}

		function apply(ctx) {
			try {
				pluginCtx = ctx;
				resetPageSecrets();
				closeWorkspaceMenu();
				var locale = null;
				try { locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined; } catch (error) { locale = null; }
				if (locale !== null && locale !== undefined && typeof locale.register === 'function') {
					var register = function () { return locale.register(NS, DICTS); };
					addEffect(ctx, register, PLUGIN_ID + ': dictionaries');
				}
				if (locale !== null && locale !== undefined && typeof locale.bind === 'function') {
					try { boundT = locale.bind(NS); } catch (error) { boundT = null; }
				}
				addEffect(ctx, function () { return ensureStyles(); }, PLUGIN_ID + ': styles');
				addEffect(ctx, function () { return startDecorating(); }, PLUGIN_ID + ': sidebar decoration');
				addEffect(ctx, function () { return installRowClickGuard(); }, PLUGIN_ID + ': workspace row guard');
				addEffect(ctx, function () { return installHiddenModeAddGuard(); }, PLUGIN_ID + ': hidden-mode add guard');

				addSlot(ctx, OVERLAY_SLOT, { name: OVERLAY_SLOT, id: PLUGIN_ID + '.dialog', order: DIALOG_ORDER, locale: NS }, VaultOverlay);
				addSlot(ctx, OVERLAY_SLOT, { name: OVERLAY_SLOT, id: PLUGIN_ID + '.main-guard', order: GUARD_ORDER, locale: NS }, MainGuardOverlay);
				addSlot(ctx, OVERLAY_SLOT, { name: OVERLAY_SLOT, id: PLUGIN_ID + '.workspace-menu', order: MENU_OVERLAY_ORDER, locale: NS }, WorkspaceMenuOverlay);
				addSlot(ctx, HEADER_ACTIONS_SLOT, { name: HEADER_ACTIONS_SLOT, id: PLUGIN_ID + '.pin-session', order: PIN_ACTIONS_ORDER, locale: NS }, PinSessionButton);

				loadState();
			} catch (error) {
				try { console.warn('dsh-workspace-vault: client apply failed', error); } catch (inner) { /* no console */ }
			}
		}

		exports.name = PLUGIN_ID;
		exports.inject = ['slots', 'locale'];
		exports.apply = apply;

		// Test seam (no runtime consumer; cordis ignores extra exports).
		exports.__internal = {
			PLUGIN_ID: PLUGIN_ID,
			NS: NS,
			CLIENT_VERSION: CLIENT_VERSION,
			STATE_PATH: STATE_PATH,
			PASSWORD_PATH: PASSWORD_PATH,
			UNLOCK_PATH: UNLOCK_PATH,
			CHECK_TOKEN_PATH: CHECK_TOKEN_PATH,
			PIN_WORKSPACE_PATH: PIN_WORKSPACE_PATH,
			HIDDEN_PATH: HIDDEN_PATH,
			ENCRYPT_PATH: ENCRYPT_PATH,
			CREATE_HIDDEN_PATH: CREATE_HIDDEN_PATH,
			OVERLAY_SLOT: OVERLAY_SLOT,
			HEADER_ACTIONS_SLOT: HEADER_ACTIONS_SLOT,
			ATTR: ATTR,
			HIDDEN_CLASS: HIDDEN_CLASS,
			DICTS: DICTS,
			CSS: CSS,
			state: state,
			store: store,
			parseStatePayload: parseStatePayload,
			applyStatePayload: applyStatePayload,
			normalizeIdList: normalizeIdList,
			normalizePhone: normalizePhone,
			applyHiddenResult: applyHiddenResult,
			applyEncryptedResult: applyEncryptedResult,
			applyPinnedResult: applyPinnedResult,
			applyUnlockResult: applyUnlockResult,
			isTokenValid: isTokenValid,
			resetPageSecrets: resetPageSecrets,
			parseRowKey: parseRowKey,
			sessionWorkspaceMap: sessionWorkspaceMap,
			mainSessionIdOf: mainSessionIdOf,
			workspaceRowVisible: workspaceRowVisible,
			workspaceLocked: workspaceLocked,
			visibilityOfRow: visibilityOfRow,
			mainGuardDecision: mainGuardDecision,
			workspaceTitleOf: workspaceTitleOf,
			firstNonHiddenWorkspaceId: firstNonHiddenWorkspaceId,
			requestJson: requestJson,
			resolveUrl: resolveUrl,
			translate: translate,
			seatTranslate: seatTranslate,
			errorText: errorText,
			subscribe: subscribe,
			patch: patch,
			refreshAll: refreshAll,
			loadState: loadState,
			openSetupDialog: openSetupDialog,
			openUnlockDialog: openUnlockDialog,
			openRecoverDialog: openRecoverDialog,
			openCreateHiddenDialog: openCreateHiddenDialog,
			openEncryptDialog: openEncryptDialog,
			closeDialog: closeDialog,
			openHiddenToggle: openHiddenToggle,
			enterHiddenMode: enterHiddenMode,
			exitHiddenMode: exitHiddenMode,
			leaveHiddenMode: leaveHiddenMode,
			performPinWorkspace: performPinWorkspace,
			toggleWorkspacePin: toggleWorkspacePin,
			performSetupPassword: performSetupPassword,
			performUnlockPassword: performUnlockPassword,
			performRecoverPassword: performRecoverPassword,
			performCreateHidden: performCreateHidden,
			performEncryptWorkspace: performEncryptWorkspace,
			decryptWorkspace: decryptWorkspace,
			toggleWorkspaceLock: toggleWorkspaceLock,
			setWorkspaceHidden: setWorkspaceHidden,
			ensureStyles: ensureStyles,
			ensureNow: ensureNow,
			safeEnsure: safeEnsure,
			startDecorating: startDecorating,
			installRowClickGuard: installRowClickGuard,
			installHiddenModeAddGuard: installHiddenModeAddGuard,
			ensureToggle: ensureToggle,
			ensureWorkspaceRow: ensureWorkspaceRow,
			findNativeRowMenuButton: findNativeRowMenuButton,
			handleRowClickCapture: handleRowClickCapture,
			findAddWorkspaceTrigger: findAddWorkspaceTrigger,
			addWorkspaceLabels: addWorkspaceLabels,
			menuPositionForRow: menuPositionForRow,
			openWorkspaceMenu: openWorkspaceMenu,
			closeWorkspaceMenu: closeWorkspaceMenu,
			workspaceMenuItems: workspaceMenuItems,
			openRenameDialog: openRenameDialog,
			openDeleteDialog: openDeleteDialog,
			performRenameWorkspace: performRenameWorkspace,
			performDeleteWorkspace: performDeleteWorkspace,
			pinnedPrefixMatches: pinnedPrefixMatches,
			maybeReapplyPinnedOrder: maybeReapplyPinnedOrder,
			PINNED_ATTR: PINNED_ATTR,
			PasswordSetupForm: PasswordSetupForm,
			UnlockForm: UnlockForm,
			RecoverForm: RecoverForm,
			CreateHiddenForm: CreateHiddenForm,
			EncryptForm: EncryptForm,
			RenameWorkspaceForm: RenameWorkspaceForm,
			DeleteWorkspaceForm: DeleteWorkspaceForm,
			WorkspaceMenuOverlay: WorkspaceMenuOverlay,
			VaultOverlay: VaultOverlay,
			MainGuardOverlay: MainGuardOverlay,
			PinSessionButton: PinSessionButton,
		};

		return module.exports;
	},
});
