import type { DeemixApp } from "@/deemixApp.js";
import { sessionDZ } from "@/deemixApp.js";
import { logger } from "@/helpers/logger.js";
import { getLoginCredentials } from "@/helpers/loginStorage.js";
import { SyncStateManager, type SyncSettings } from "deemix";
import { Deezer } from "deezer-sdk";
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
	private arlMap: Map<string, string> = new Map();

	constructor(
		private deemixApp: DeemixApp,
		private stateManager: SyncStateManager,
		private configFolder: string
	) {}

	async initializeForUser(userId: string, sessionId: string): Promise<void> {
		this.sessionMap.set(userId, sessionId);
		this.captureArl(userId, sessionId);
		const state = await this.stateManager.loadUserState(userId);

		if (state.enabled) {
			await this.startSync(userId, sessionId);
		}
	}

	async initializeAllUsers(): Promise<void> {
		const userIds = await this.stateManager.getAllUserIds();
		logger.info(`[Sync] Initializing sync for ${userIds.length} user(s)`);

		for (const userId of userIds) {
			const state = await this.stateManager.loadUserState(userId);

			if (!state.enabled) {
				logger.info(`[Sync] User ${userId}: sync disabled, skipping`);
				continue;
			}

			const sessionId = this.findSessionForUser(userId);

			if (sessionId) {
				logger.info(
					`[Sync] User ${userId}: found existing session ${sessionId}`
				);
				this.sessionMap.set(userId, sessionId);
				this.captureArl(userId, sessionId);
				await this.startSync(userId, sessionId);
				continue;
			}

			const arl = this.resolveArl(userId);
			if (!arl) {
				logger.warn(
					`[Sync] User ${userId}: sync enabled but no session or ARL available, deferring until login`
				);
				continue;
			}

			logger.info(
				`[Sync] User ${userId}: no active session, creating one from stored ARL`
			);
			const syntheticSessionId = await this.createSessionFromArl(userId, arl);
			if (syntheticSessionId) {
				await this.startSync(userId, syntheticSessionId);
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

	private captureArl(userId: string, sessionId: string): void {
		const dz = sessionDZ[sessionId];
		if (dz?.loggedIn) {
			const credentials = getLoginCredentials();
			if (credentials.arl) {
				this.arlMap.set(userId, credentials.arl);
				logger.info(`[Sync] User ${userId}: ARL captured from login storage`);
			}
		}
	}

	private resolveArl(userId: string): string | null {
		const storedArl = this.arlMap.get(userId);
		if (storedArl) return storedArl;

		const credentials = getLoginCredentials();
		if (credentials.arl) {
			this.arlMap.set(userId, credentials.arl);
			return credentials.arl;
		}

		return null;
	}

	private async createSessionFromArl(
		userId: string,
		arl: string
	): Promise<string | null> {
		const syntheticId = `sync-${userId}-${Date.now()}`;
		const dz = new Deezer();

		logger.info(`[Sync] User ${userId}: logging in with ARL...`);
		const result = await dz.loginViaArl(arl);

		if (!result || !dz.loggedIn || !dz.currentUser) {
			logger.error(
				`[Sync] User ${userId}: ARL login failed, sync cannot start`
			);
			return null;
		}

		logger.info(
			`[Sync] User ${userId}: ARL login successful as ${dz.currentUser.name} (id: ${dz.currentUser.id})`
		);
		sessionDZ[syntheticId] = dz;
		this.sessionMap.set(userId, syntheticId);
		this.arlMap.set(userId, arl);
		return syntheticId;
	}

	private async ensureValidSession(
		userId: string,
		sessionId: string
	): Promise<{ dz: Deezer; sessionId: string }> {
		const dz = sessionDZ[sessionId];
		if (dz?.loggedIn && dz.currentUser) {
			return { dz, sessionId };
		}

		logger.warn(
			`[Sync] User ${userId}: session ${sessionId} invalid (missing=${!dz}, loggedIn=${dz?.loggedIn}, hasUser=${!!dz?.currentUser})`
		);

		const existingSessionId = this.findSessionForUser(userId);
		if (existingSessionId) {
			const existingDz = sessionDZ[existingSessionId];
			if (existingDz?.loggedIn && existingDz.currentUser) {
				logger.info(
					`[Sync] User ${userId}: recovered via existing session ${existingSessionId}`
				);
				this.sessionMap.set(userId, existingSessionId);
				this.captureArl(userId, existingSessionId);
				return { dz: existingDz, sessionId: existingSessionId };
			}
		}

		const arl = this.resolveArl(userId);
		if (!arl) {
			throw new Error(
				"Not logged in to Deezer and no ARL available for re-authentication"
			);
		}

		logger.info(`[Sync] User ${userId}: re-authenticating with stored ARL...`);
		const newSessionId = await this.createSessionFromArl(userId, arl);
		if (!newSessionId) {
			throw new Error("Failed to re-authenticate with stored ARL");
		}

		return { dz: sessionDZ[newSessionId], sessionId: newSessionId };
	}

	async startSync(userId: string, sessionId: string): Promise<void> {
		this.sessionMap.set(userId, sessionId);
		this.captureArl(userId, sessionId);
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

		logger.info(
			`[Sync] User ${userId}: starting sync (interval: ${state.settings.interval}ms, batch: ${state.settings.batchSize})`
		);

		this.runSyncCycle(userId, sessionId).catch((error) => {
			logger.error(
				`[Sync] User ${userId}: initial sync cycle failed: ${error instanceof Error ? error.message : String(error)}`
			);
		});

		const interval = setInterval(() => {
			this.runSyncCycle(userId, sessionId).catch((error) => {
				logger.error(
					`[Sync] User ${userId}: scheduled sync cycle failed: ${error instanceof Error ? error.message : String(error)}`
				);
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

		logger.info(`[Sync] User ${userId}: sync stopped`);

		await this.stateManager.appendEvent(userId, {
			type: "sync_completed",
			severity: "info",
			message: "Sync stopped by user",
		});
	}

	async triggerSyncNow(userId: string, sessionId: string): Promise<void> {
		this.sessionMap.set(userId, sessionId);
		this.captureArl(userId, sessionId);

		logger.info(`[Sync] User ${userId}: manual sync triggered`);
		await this.runSyncCycle(userId, sessionId);
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
		itemType: "track" | "album" | "playlist" | "artist"
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
			logger.warn(`[Sync] User ${userId}: sync already running, skipping`);
			return;
		}

		this.runningLocks.set(userId, true);
		const startTime = Date.now();
		const state = await this.stateManager.loadUserState(userId);

		logger.info(`[Sync] User ${userId}: sync cycle starting`);

		try {
			state.status = "running";
			state.currentRunStartedAt = new Date().toISOString();
			await this.stateManager.saveUserState(userId, state);

			const { dz, sessionId: activeSessionId } = await this.ensureValidSession(
				userId,
				sessionId
			);

			logger.info(
				`[Sync] User ${userId}: authenticated as ${dz.currentUser?.name} (id: ${dz.currentUser?.id}), session: ${activeSessionId}`
			);

			logger.info(
				`[Sync] User ${userId}: fetching favorites (scope: ${JSON.stringify(state.settings.scope)})`
			);
			const poller = new FavoritesPoller(dz, state.settings.scope);
			const favorites = await poller.fetchAllFavorites();
			logger.info(
				`[Sync] User ${userId}: fetched favorites — tracks: ${favorites.tracks.length}, albums: ${favorites.albums.length}, playlists: ${favorites.playlists.length}, artists: ${favorites.artists.length}`
			);

			const trackedItems = await this.stateManager.loadTrackedItems(userId);
			const trackedCounts = {
				tracks: Object.keys(trackedItems.tracks).length,
				albums: Object.keys(trackedItems.albums).length,
				playlists: Object.keys(trackedItems.playlists).length,
				artists: Object.keys(trackedItems.artists).length,
			};
			logger.info(
				`[Sync] User ${userId}: tracked items — tracks: ${trackedCounts.tracks}, albums: ${trackedCounts.albums}, playlists: ${trackedCounts.playlists}, artists: ${trackedCounts.artists}`
			);

			const newItems = [
				...favorites.tracks.filter((t) => !trackedItems.tracks[t.id]),
				...favorites.albums.filter((a) => !trackedItems.albums[a.id]),
				...favorites.playlists.filter((p) => !trackedItems.playlists[p.id]),
				...favorites.artists.filter((a) => !trackedItems.artists[a.id]),
			];

			const failedTrackedItems = [
				...Object.values(trackedItems.tracks),
				...Object.values(trackedItems.albums),
				...Object.values(trackedItems.playlists),
				...Object.values(trackedItems.artists),
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

			logger.info(
				`[Sync] User ${userId}: ${newItems.length} new item(s), ${failedItems.length} failed item(s) to retry`
			);

			const itemsToDownload = [...newItems, ...failedItems];

			if (itemsToDownload.length > 0) {
				logger.info(
					`[Sync] User ${userId}: enqueuing ${itemsToDownload.length} item(s) in batches of ${state.settings.batchSize}`
				);
				const orchestrator = new DownloadOrchestrator(
					this.deemixApp,
					this.stateManager
				);

				const result = await orchestrator.enqueueItems(
					userId,
					activeSessionId,
					itemsToDownload,
					state.settings.batchSize
				);

				logger.info(
					`[Sync] User ${userId}: enqueue result — enqueued: ${result.enqueued}, skipped: ${result.skipped}, failed: ${result.failed}`
				);

				state.statistics.totalSynced += result.enqueued;
				state.statistics.totalFailed += result.failed;
			} else {
				logger.info(
					`[Sync] User ${userId}: nothing to download, all favorites are tracked`
				);
			}

			const detector = new BrokenAlbumDetector();
			const trackedAlbums = Object.values(trackedItems.albums);
			const brokenAlbums = await detector.detectChanges(
				trackedAlbums,
				favorites.albums
			);

			if (brokenAlbums.length > 0) {
				logger.warn(
					`[Sync] User ${userId}: ${brokenAlbums.length} broken album(s) detected`
				);
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

			logger.info(
				`[Sync] User ${userId}: sync cycle completed in ${state.statistics.lastRunDuration}ms`
			);

			await this.stateManager.appendEvent(userId, {
				type: "sync_completed",
				severity: "info",
				message: `Sync completed successfully`,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(`[Sync] User ${userId}: sync cycle failed: ${errorMessage}`);

			state.status = "error";
			state.currentRunStartedAt = null;
			state.lastSyncAt = new Date().toISOString();
			state.statistics.lastRunDuration = Date.now() - startTime;

			await this.stateManager.saveUserState(userId, state);

			await this.stateManager.appendEvent(userId, {
				type: "sync_failed",
				severity: "error",
				message: `Sync failed: ${errorMessage}`,
				details: {
					error: errorMessage,
				},
			});

			throw error;
		} finally {
			this.runningLocks.set(userId, false);
		}
	}

	async shutdown(): Promise<void> {
		logger.info("[Sync] Shutting down sync service...");
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
		this.arlMap.clear();
		logger.info("[Sync] Sync service shut down");
	}
}
