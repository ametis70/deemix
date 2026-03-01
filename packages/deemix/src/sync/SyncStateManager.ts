import { promises as fsPromises } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type {
	UserSyncState,
	TrackedItems,
	SyncEvent,
	BrokenAlbum,
} from "./types.js";

export class SyncStateManager {
	constructor(private configFolder: string) {}

	private getStateFilePath(userId: string): string {
		return path.join(this.configFolder, `sync-state-${userId}.json`);
	}

	private getTrackedItemsFilePath(userId: string): string {
		return path.join(this.configFolder, `sync-tracked-${userId}.json`);
	}

	private getEventsFilePath(userId: string): string {
		return path.join(this.configFolder, `sync-events-${userId}.json`);
	}

	private getBrokenAlbumsFilePath(userId: string): string {
		return path.join(this.configFolder, `sync-broken-albums-${userId}.json`);
	}

	private async ensureConfigFolder(): Promise<void> {
		try {
			await fsPromises.access(this.configFolder);
		} catch {
			await fsPromises.mkdir(this.configFolder, { recursive: true });
		}
	}

	private async readJSON<T>(filePath: string, defaultValue: T): Promise<T> {
		try {
			const data = await fsPromises.readFile(filePath, "utf-8");
			return JSON.parse(data) as T;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return defaultValue;
			}
			throw error;
		}
	}

	private async writeJSON<T>(filePath: string, data: T): Promise<void> {
		await this.ensureConfigFolder();
		await fsPromises.writeFile(
			filePath,
			JSON.stringify(data, null, 2),
			"utf-8"
		);
	}

	async loadUserState(userId: string): Promise<UserSyncState> {
		const filePath = this.getStateFilePath(userId);
		const defaultState: UserSyncState = {
			userId,
			enabled: false,
			lastSyncAt: null,
			lastSuccessfulSyncAt: null,
			status: "idle",
			currentRunStartedAt: null,
			settings: {
				interval: 900000,
				batchSize: 10,
				scope: {
					tracks: true,
					albums: true,
					playlists: false,
				},
				retry: {
					maxAttempts: 5,
					baseDelay: 60000,
				},
			},
			statistics: {
				totalSynced: 0,
				totalFailed: 0,
				lastRunDuration: 0,
			},
		};
		return this.readJSON(filePath, defaultState);
	}

	async saveUserState(userId: string, state: UserSyncState): Promise<void> {
		const filePath = this.getStateFilePath(userId);
		await this.writeJSON(filePath, state);
	}

	async loadTrackedItems(userId: string): Promise<TrackedItems> {
		const filePath = this.getTrackedItemsFilePath(userId);
		const defaultItems: TrackedItems = {
			tracks: {},
			albums: {},
			playlists: {},
		};
		return this.readJSON(filePath, defaultItems);
	}

	async saveTrackedItems(userId: string, items: TrackedItems): Promise<void> {
		const filePath = this.getTrackedItemsFilePath(userId);
		await this.writeJSON(filePath, items);
	}

	async appendEvent(
		userId: string,
		event: Omit<SyncEvent, "id" | "timestamp">
	): Promise<void> {
		const filePath = this.getEventsFilePath(userId);
		const events = await this.getEvents(userId, 1000);

		const newEvent: SyncEvent = {
			...event,
			id: uuidv4(),
			timestamp: new Date().toISOString(),
		};

		events.unshift(newEvent);

		// Keep only last 1000 events
		const trimmedEvents = events.slice(0, 1000);

		await this.writeJSON(filePath, { events: trimmedEvents });
	}

	async getEvents(userId: string, limit?: number): Promise<SyncEvent[]> {
		const filePath = this.getEventsFilePath(userId);
		const data = await this.readJSON<{ events: SyncEvent[] }>(filePath, {
			events: [],
		});

		const events = data.events || [];

		if (limit !== undefined) {
			return events.slice(0, limit);
		}

		return events;
	}

	async loadBrokenAlbums(userId: string): Promise<BrokenAlbum[]> {
		const filePath = this.getBrokenAlbumsFilePath(userId);
		const data = await this.readJSON<{ brokenAlbums: BrokenAlbum[] }>(
			filePath,
			{ brokenAlbums: [] }
		);
		return data.brokenAlbums || [];
	}

	async saveBrokenAlbums(userId: string, albums: BrokenAlbum[]): Promise<void> {
		const filePath = this.getBrokenAlbumsFilePath(userId);
		await this.writeJSON(filePath, { brokenAlbums: albums });
	}

	async getAllUserIds(): Promise<string[]> {
		try {
			const files = await fsPromises.readdir(this.configFolder);
			const userIds: string[] = [];

			for (const file of files) {
				const match = file.match(/^sync-state-(.+)\.json$/);
				if (match) {
					userIds.push(match[1]);
				}
			}

			return userIds;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return [];
			}
			throw error;
		}
	}
}
