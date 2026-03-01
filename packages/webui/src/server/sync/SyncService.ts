import type { DeemixApp } from "@/deemixApp.js";
import { sessionDZ } from "@/deemixApp.js";
import { SyncStateManager, type SyncSettings } from "deemix";
import { BrokenAlbumDetector } from "./BrokenAlbumDetector.js";
import { DownloadOrchestrator } from "./DownloadOrchestrator.js";
import { FavoritesPoller } from "./FavoritesPoller.js";

export interface SyncStatus {
	enabled: boolean;
	running: boolean;
	lastSyncAt: string | null;
	lastSuccessfulSyncAt: string | null;
	status: "idle" | "running" | "error";
	statistics: {
		totalSynced: number;
		totalFailed: number;
		lastRunDuration: number;
	};
	settings: SyncSettings;
}

export class SyncService {
	private intervals: Map<string, NodeJS.Timeout> = new Map();
	private runningLocks: Map<string, boolean> = new Map();
	private sessionMap: Map<string, string> = new Map();

	constructor(
		private deemixApp: DeemixApp,
		private stateManager: SyncStateManager,
		private configFolder: string
	) {}

	async initializeForUser(userId: string, sessionId: string): Promise<void> {
		this.sessionMap.set(userId, sessionId);
		const state = await this.stateManager.loadUserState(userId);

		if (state.enabled) {
			await this.startSync(userId, sessionId);
		}
	}

	async initializeAllUsers(): Promise<void> {
		const userIds = await this.stateManager.getAllUserIds();

		for (const userId of userIds) {
			const state = await this.stateManager.loadUserState(userId);
			const sessionId = this.findSessionForUser(userId);
			if (!sessionId) continue;

			this.sessionMap.set(userId, sessionId);

			if (state.enabled) {
				await this.startSync(userId, sessionId);
			}
		}
	}

	private findSessionForUser(userId: string): string | null {
		for (const [sessionId, dz] of Object.entries(sessionDZ)) {
			if (dz.currentUser && String(dz.currentUser.id) === userId) {
				return sessionId;
			}
		}
		return null;
	}

	async startSync(userId: string, sessionId: string): Promise<void> {
		this.sessionMap.set(userId, sessionId);
		const state = await this.stateManager.loadUserState(userId);

		const minInterval = 300000;
		if (state.settings.interval < minInterval) {
			throw new Error(
				`Sync interval must be at least ${minInterval}ms (5 minutes)`
			);
		}

		state.enabled = true;
		await this.stateManager.saveUserState(userId, state);

		if (this.intervals.has(userId)) {
			clearInterval(this.intervals.get(userId)!);
		}

		this.runSyncCycle(userId, sessionId).catch((error) => {
			console.error(`Sync cycle failed for user ${userId}:`, error);
		});

		const interval = setInterval(() => {
			this.runSyncCycle(userId, sessionId).catch((error) => {
				console.error(`Sync cycle failed for user ${userId}:`, error);
			});
		}, state.settings.interval);

		this.intervals.set(userId, interval);

await this.stateManager.appendEvent(userId, {
		type: "sync_started",
		severity: "info",
		message: "Sync started",
	});
	}

	async stopSync(userId: string): Promise<void> {
		if (this.intervals.has(userId)) {
			clearInterval(this.intervals.get(userId)!);
			this.intervals.delete(userId);
		}

		const state = await this.stateManager.loadUserState(userId);
		state.enabled = false;
		state.status = "idle";
		await this.stateManager.saveUserState(userId, state);

await this.stateManager.appendEvent(userId, {
		type: "sync_completed",
		severity: "info",
		message: "Sync stopped by user",
	});
	}

	async updateConfig(
		userId: string,
		config: Partial<SyncSettings>
	): Promise<void> {
		const state = await this.stateManager.loadUserState(userId);

		state.settings = {
			...state.settings,
			...config,
		};

		const minInterval = 300000;
		if (state.settings.interval < minInterval) {
			throw new Error(
				`Sync interval must be at least ${minInterval}ms (5 minutes)`
			);
		}

		await this.stateManager.saveUserState(userId, state);

		if (this.intervals.has(userId)) {
			const sessionId = this.sessionMap.get(userId);
			if (sessionId) {
				await this.stopSync(userId);
				await this.startSync(userId, sessionId);
			}
		}
	}

	async getStatus(userId: string): Promise<SyncStatus> {
		const state = await this.stateManager.loadUserState(userId);
		const isRunning = this.runningLocks.get(userId) || false;

		return {
			enabled: state.enabled,
			running: isRunning,
			lastSyncAt: state.lastSyncAt,
			lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
			status: state.status,
			statistics: state.statistics,
			settings: state.settings,
		};
	}

	async redownloadItem(
		userId: string,
		itemId: string,
		itemType: "track" | "album" | "playlist"
	): Promise<void> {
		const trackedItems = await this.stateManager.loadTrackedItems(userId);
		const collectionKey = `${itemType}s` as keyof typeof trackedItems;
		const item = trackedItems[collectionKey][itemId];

		if (!item) {
			throw new Error(`Item ${itemId} not found in tracked items`);
		}

		item.status = "new";
		item.retryCount = 0;
		item.lastError = null;
		item.syncedAt = null;

		await this.stateManager.saveTrackedItems(userId, trackedItems);

await this.stateManager.appendEvent(userId, {
		type: "item_downloaded",
		severity: "info",
		message: `Item ${item.title} marked for redownload`,
		details: {
			itemId: item.id,
			itemType: item.type,
		},
	});
	}

	private async runSyncCycle(userId: string, sessionId: string): Promise<void> {
		if (this.runningLocks.get(userId)) {
			console.warn(`Sync already running for user ${userId}, skipping...`);
			return;
		}

		this.runningLocks.set(userId, true);
		const startTime = Date.now();
		const state = await this.stateManager.loadUserState(userId);

		try {
			state.status = "running";
			state.currentRunStartedAt = new Date().toISOString();
			await this.stateManager.saveUserState(userId, state);

			const dz = sessionDZ[sessionId];
			if (!dz || !dz.loggedIn || !dz.currentUser) {
				throw new Error("Not logged in to Deezer");
			}

			const poller = new FavoritesPoller(dz, state.settings.scope);
			const favorites = await poller.fetchAllFavorites();
			const trackedItems = await this.stateManager.loadTrackedItems(userId);

			const newItems = [
				...favorites.tracks.filter((t) => !trackedItems.tracks[t.id]),
				...favorites.albums.filter((a) => !trackedItems.albums[a.id]),
				...favorites.playlists.filter((p) => !trackedItems.playlists[p.id]),
			];

			const failedTrackedItems = [
			...Object.values(trackedItems.tracks),
			...Object.values(trackedItems.albums),
			...Object.values(trackedItems.playlists),
		].filter(
			(item) =>
				item.status === "failed" &&
				item.retryCount < state.settings.retry.maxAttempts
		);

		const failedItems = failedTrackedItems.map((item) => ({
			id: item.id,
			type: item.type,
			title: item.title,
			artist: item.artist,
		}));

			const itemsToDownload = [...newItems, ...failedItems];

			if (itemsToDownload.length > 0) {
				const orchestrator = new DownloadOrchestrator(
					this.deemixApp,
					this.stateManager
				);

				const result = await orchestrator.enqueueItems(
					userId,
					sessionId,
					itemsToDownload,
					state.settings.batchSize
				);

				state.statistics.totalSynced += result.enqueued;
				state.statistics.totalFailed += result.failed;
			}

			const detector = new BrokenAlbumDetector();
			const trackedAlbums = Object.values(trackedItems.albums);
			const brokenAlbums = await detector.detectChanges(
				trackedAlbums,
				favorites.albums
			);

			if (brokenAlbums.length > 0) {
				const existingBroken = await this.stateManager.loadBrokenAlbums(userId);

				for (const broken of brokenAlbums) {
					if (!existingBroken.find((b) => b.originalId === broken.originalId)) {
						existingBroken.push(broken);

await this.stateManager.appendEvent(userId, {
					type: "broken_album_detected",
					severity: "warning",
					message: `Album "${broken.title}" ID changed`,
					details: {
						itemId: broken.originalId,
						itemType: "album",
					},
				});
					}
				}

				await this.stateManager.saveBrokenAlbums(userId, existingBroken);
			}

			state.status = "idle";
			state.lastSyncAt = new Date().toISOString();
			state.lastSuccessfulSyncAt = new Date().toISOString();
			state.currentRunStartedAt = null;
			state.statistics.lastRunDuration = Date.now() - startTime;

			await this.stateManager.saveUserState(userId, state);

await this.stateManager.appendEvent(userId, {
			type: "sync_completed",
			severity: "info",
			message: `Sync completed successfully`,
		});
		} catch (error) {
			state.status = "error";
			state.currentRunStartedAt = null;
			state.lastSyncAt = new Date().toISOString();
			state.statistics.lastRunDuration = Date.now() - startTime;

			await this.stateManager.saveUserState(userId, state);

await this.stateManager.appendEvent(userId, {
			type: "sync_failed",
			severity: "error",
			message: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
			details: {
				error: error instanceof Error ? error.message : String(error),
			},
		});

			throw error;
		} finally {
			this.runningLocks.set(userId, false);
		}
	}

	async shutdown(): Promise<void> {
		for (const [userId, interval] of this.intervals.entries()) {
			clearInterval(interval);

			const state = await this.stateManager.loadUserState(userId);
			state.enabled = false;
			state.status = "idle";
			state.currentRunStartedAt = null;
			await this.stateManager.saveUserState(userId, state);
		}

		this.intervals.clear();
		this.runningLocks.clear();
		this.sessionMap.clear();
	}
}
