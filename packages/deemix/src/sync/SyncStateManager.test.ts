import { promises as fsPromises } from "fs";
import os from "os";
import path from "path";
import { SyncStateManager } from "./SyncStateManager.js";

let tmpDir: string;
let manager: SyncStateManager;

beforeEach(async () => {
	tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sync-test-"));
	manager = new SyncStateManager(tmpDir);
});

afterEach(async () => {
	await fsPromises.rm(tmpDir, { recursive: true, force: true });
});

describe("SyncStateManager", () => {
	describe("loadUserState", () => {
		test("returns default state when no file exists", async () => {
			const state = await manager.loadUserState("user1");
			expect(state.userId).toBe("user1");
			expect(state.enabled).toBe(false);
			expect(state.status).toBe("idle");
			expect(state.lastSyncAt).toBeNull();
			expect(state.settings.interval).toBe(900000);
			expect(state.settings.batchSize).toBe(10);
			expect(state.settings.scope.tracks).toBe(true);
			expect(state.settings.scope.albums).toBe(true);
			expect(state.settings.scope.playlists).toBe(false);
			expect(state.settings.retry.maxAttempts).toBe(5);
			expect(state.settings.retry.baseDelay).toBe(60000);
			expect(state.statistics.totalSynced).toBe(0);
			expect(state.statistics.totalFailed).toBe(0);
		});

		test("returns saved state after save", async () => {
			const state = await manager.loadUserState("user1");
			state.enabled = true;
			state.status = "running";
			state.settings.interval = 600000;
			state.statistics.totalSynced = 42;

			await manager.saveUserState("user1", state);

			const loaded = await manager.loadUserState("user1");
			expect(loaded.enabled).toBe(true);
			expect(loaded.status).toBe("running");
			expect(loaded.settings.interval).toBe(600000);
			expect(loaded.statistics.totalSynced).toBe(42);
		});
	});

	describe("loadTrackedItems", () => {
		test("returns empty collections when no file exists", async () => {
			const items = await manager.loadTrackedItems("user1");
			expect(items.tracks).toEqual({});
			expect(items.albums).toEqual({});
			expect(items.playlists).toEqual({});
		});

		test("persists tracked items", async () => {
			const items = await manager.loadTrackedItems("user1");
			items.tracks["123"] = {
				id: "123",
				type: "track",
				title: "Test Track",
				artist: "Test Artist",
				status: "success",
				addedAt: "2024-01-01T00:00:00.000Z",
				syncedAt: "2024-01-01T00:01:00.000Z",
				retryCount: 0,
				lastError: null,
				lastAttemptAt: "2024-01-01T00:01:00.000Z",
			};

			await manager.saveTrackedItems("user1", items);

			const loaded = await manager.loadTrackedItems("user1");
			expect(loaded.tracks["123"]).toBeDefined();
			expect(loaded.tracks["123"].title).toBe("Test Track");
			expect(loaded.tracks["123"].status).toBe("success");
		});
	});

	describe("events", () => {
		test("returns empty events when no file exists", async () => {
			const events = await manager.getEvents("user1");
			expect(events).toEqual([]);
		});

		test("appends events in reverse chronological order", async () => {
			await manager.appendEvent("user1", {
				type: "sync_started",
				severity: "info",
				message: "First event",
			});

			await manager.appendEvent("user1", {
				type: "sync_completed",
				severity: "info",
				message: "Second event",
			});

			const events = await manager.getEvents("user1");
			expect(events).toHaveLength(2);
			expect(events[0].message).toBe("Second event");
			expect(events[1].message).toBe("First event");
		});

		test("assigns unique ids and timestamps", async () => {
			await manager.appendEvent("user1", {
				type: "sync_started",
				severity: "info",
				message: "Test",
			});

			const events = await manager.getEvents("user1");
			expect(events[0].id).toBeDefined();
			expect(events[0].timestamp).toBeDefined();
		});

		test("respects limit parameter", async () => {
			for (let i = 0; i < 5; i++) {
				await manager.appendEvent("user1", {
					type: "sync_started",
					severity: "info",
					message: `Event ${i}`,
				});
			}

			const events = await manager.getEvents("user1", 3);
			expect(events).toHaveLength(3);
		});

		test("truncates events at 1000", async () => {
			const filePath = path.join(tmpDir, "sync-events-user1.json");
			const existingEvents = Array.from({ length: 1000 }, (_, i) => ({
				id: `evt-${i}`,
				timestamp: new Date().toISOString(),
				type: "sync_started" as const,
				severity: "info" as const,
				message: `Event ${i}`,
			}));
			await fsPromises.writeFile(
				filePath,
				JSON.stringify({ events: existingEvents }),
				"utf-8"
			);

			await manager.appendEvent("user1", {
				type: "sync_completed",
				severity: "info",
				message: "New event",
			});

			const events = await manager.getEvents("user1");
			expect(events).toHaveLength(1000);
			expect(events[0].message).toBe("New event");
		});
	});

	describe("broken albums", () => {
		test("returns empty array when no file exists", async () => {
			const albums = await manager.loadBrokenAlbums("user1");
			expect(albums).toEqual([]);
		});

		test("persists broken albums", async () => {
			const albums = [
				{
					originalId: "100",
					detectedId: "200",
					title: "Broken Album",
					detectedAt: "2024-01-01T00:00:00.000Z",
					status: "unresolved" as const,
				},
			];

			await manager.saveBrokenAlbums("user1", albums);

			const loaded = await manager.loadBrokenAlbums("user1");
			expect(loaded).toHaveLength(1);
			expect(loaded[0].originalId).toBe("100");
			expect(loaded[0].detectedId).toBe("200");
			expect(loaded[0].title).toBe("Broken Album");
		});
	});

	describe("getAllUserIds", () => {
		test("returns empty array when no state files exist", async () => {
			const userIds = await manager.getAllUserIds();
			expect(userIds).toEqual([]);
		});

		test("discovers user ids from state files", async () => {
			await manager.saveUserState(
				"user1",
				await manager.loadUserState("user1")
			);
			await manager.saveUserState(
				"user2",
				await manager.loadUserState("user2")
			);

			const userIds = await manager.getAllUserIds();
			expect(userIds).toHaveLength(2);
			expect(userIds).toContain("user1");
			expect(userIds).toContain("user2");
		});

		test("returns empty array when config folder does not exist", async () => {
			const nonExistent = new SyncStateManager(
				"/tmp/nonexistent-sync-test-dir"
			);
			const userIds = await nonExistent.getAllUserIds();
			expect(userIds).toEqual([]);
		});
	});

	describe("user isolation", () => {
		test("state is isolated per user", async () => {
			const state1 = await manager.loadUserState("user1");
			state1.enabled = true;
			state1.settings.interval = 600000;
			await manager.saveUserState("user1", state1);

			const state2 = await manager.loadUserState("user2");
			expect(state2.enabled).toBe(false);
			expect(state2.settings.interval).toBe(900000);
		});

		test("events are isolated per user", async () => {
			await manager.appendEvent("user1", {
				type: "sync_started",
				severity: "info",
				message: "User 1 event",
			});

			const events2 = await manager.getEvents("user2");
			expect(events2).toEqual([]);
		});
	});

	describe("config folder creation", () => {
		test("creates config folder if it does not exist", async () => {
			const nestedDir = path.join(tmpDir, "nested", "config");
			const nestedManager = new SyncStateManager(nestedDir);

			await nestedManager.saveUserState(
				"user1",
				await nestedManager.loadUserState("user1")
			);

			const stat = await fsPromises.stat(nestedDir);
			expect(stat.isDirectory()).toBe(true);
		});
	});
});
