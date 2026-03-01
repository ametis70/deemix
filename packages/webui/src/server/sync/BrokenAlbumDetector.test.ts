import { describe, test, expect } from "vitest";
import { BrokenAlbumDetector } from "./BrokenAlbumDetector.js";
import type { TrackedItem } from "deemix";
import type { FavoriteAlbum } from "./FavoritesPoller.js";

describe("BrokenAlbumDetector", () => {
	const detector = new BrokenAlbumDetector();

	function makeTrackedAlbum(
		id: string,
		title: string,
		artist: string
	): TrackedItem {
		return {
			id,
			type: "album",
			title,
			artist,
			status: "success",
			addedAt: "2024-01-01T00:00:00.000Z",
			syncedAt: "2024-01-01T00:00:00.000Z",
			retryCount: 0,
			lastError: null,
			lastAttemptAt: "2024-01-01T00:00:00.000Z",
		};
	}

	function makeFavoriteAlbum(
		id: string,
		title: string,
		artist: string
	): FavoriteAlbum {
		return { id, type: "album", title, artist };
	}

	test("returns empty when all albums still exist", async () => {
		const tracked = [makeTrackedAlbum("100", "Album A", "Artist A")];
		const favorites = [makeFavoriteAlbum("100", "Album A", "Artist A")];

		const result = await detector.detectChanges(tracked, favorites);
		expect(result).toEqual([]);
	});

	test("detects album with changed ID", async () => {
		const tracked = [makeTrackedAlbum("100", "Album A", "Artist A")];
		const favorites = [makeFavoriteAlbum("200", "Album A", "Artist A")];

		const result = await detector.detectChanges(tracked, favorites);
		expect(result).toHaveLength(1);
		expect(result[0].originalId).toBe("100");
		expect(result[0].detectedId).toBe("200");
		expect(result[0].title).toBe("Album A");
		expect(result[0].status).toBe("unresolved");
	});

	test("matches case-insensitively", async () => {
		const tracked = [makeTrackedAlbum("100", "album a", "artist a")];
		const favorites = [makeFavoriteAlbum("200", "Album A", "Artist A")];

		const result = await detector.detectChanges(tracked, favorites);
		expect(result).toHaveLength(1);
		expect(result[0].originalId).toBe("100");
		expect(result[0].detectedId).toBe("200");
	});

	test("does not flag albums that are simply removed", async () => {
		const tracked = [makeTrackedAlbum("100", "Album A", "Artist A")];
		const favorites: FavoriteAlbum[] = [];

		const result = await detector.detectChanges(tracked, favorites);
		expect(result).toEqual([]);
	});

	test("skips non-album tracked items", async () => {
		const tracked: TrackedItem[] = [
			{
				id: "100",
				type: "track",
				title: "Track A",
				artist: "Artist A",
				status: "success",
				addedAt: "2024-01-01T00:00:00.000Z",
				syncedAt: "2024-01-01T00:00:00.000Z",
				retryCount: 0,
				lastError: null,
				lastAttemptAt: "2024-01-01T00:00:00.000Z",
			},
		];
		const favorites = [makeFavoriteAlbum("200", "Track A", "Artist A")];

		const result = await detector.detectChanges(tracked, favorites);
		expect(result).toEqual([]);
	});

	test("handles multiple broken albums", async () => {
		const tracked = [
			makeTrackedAlbum("100", "Album A", "Artist A"),
			makeTrackedAlbum("200", "Album B", "Artist B"),
		];
		const favorites = [
			makeFavoriteAlbum("300", "Album A", "Artist A"),
			makeFavoriteAlbum("400", "Album B", "Artist B"),
		];

		const result = await detector.detectChanges(tracked, favorites);
		expect(result).toHaveLength(2);
	});

	test("does not flag album if same ID still exists", async () => {
		const tracked = [
			makeTrackedAlbum("100", "Album A", "Artist A"),
			makeTrackedAlbum("200", "Album B", "Artist B"),
		];
		const favorites = [
			makeFavoriteAlbum("100", "Album A", "Artist A"),
			makeFavoriteAlbum("400", "Album B", "Artist B"),
		];

		const result = await detector.detectChanges(tracked, favorites);
		expect(result).toHaveLength(1);
		expect(result[0].originalId).toBe("200");
	});
});
