import { logger } from "@/helpers/logger.js";
import type { Deezer } from "deezer-sdk";
import type { SyncScope } from "deemix";

export interface FavoriteTrack {
	id: string;
	type: "track";
	title: string;
	artist: string;
}

export interface FavoriteAlbum {
	id: string;
	type: "album";
	title: string;
	artist: string;
}

export interface FavoritePlaylist {
	id: string;
	type: "playlist";
	title: string;
}

export interface FavoriteArtist {
	id: string;
	type: "artist";
	title: string;
}

export type FavoriteItem =
	| FavoriteTrack
	| FavoriteAlbum
	| FavoritePlaylist
	| FavoriteArtist;

export interface FavoriteItems {
	tracks: FavoriteTrack[];
	albums: FavoriteAlbum[];
	playlists: FavoritePlaylist[];
	artists: FavoriteArtist[];
}

export class FavoritesPoller {
	constructor(
		private dz: Deezer,
		private scope: SyncScope
	) {}

	async fetchAllFavorites(): Promise<FavoriteItems> {
		if (!this.dz.loggedIn || !this.dz.currentUser) {
			throw new Error("Not logged in to Deezer");
		}

		const result: FavoriteItems = {
			tracks: [],
			albums: [],
			playlists: [],
			artists: [],
		};

		const userId = this.dz.currentUser.id;

		const promises: Promise<void>[] = [];

		if (this.scope.tracks) {
			promises.push(
				this.fetchFavoriteTracks().then((tracks) => {
					result.tracks = tracks;
				})
			);
		}

		if (this.scope.albums) {
			promises.push(
				this.fetchFavoriteAlbums(String(userId)).then((albums) => {
					result.albums = albums;
				})
			);
		}

		if (this.scope.playlists) {
			promises.push(
				this.fetchFavoritePlaylists(String(userId)).then((playlists) => {
					result.playlists = playlists;
				})
			);
		}

		if (this.scope.artists) {
			promises.push(
				this.fetchFavoriteArtists(String(userId)).then((artists) => {
					result.artists = artists;
				})
			);
		}

		await Promise.all(promises);

		return result;
	}

	private async fetchFavoriteTracks(): Promise<FavoriteTrack[]> {
		const tracks: FavoriteTrack[] = [];
		let start = 0;
		const batchSize = 1000;

		logger.info("[Sync:Poller] Fetching favorite tracks...");

		while (true) {
			const batch = await this.dz.gw.get_my_favorite_tracks({
				limit: batchSize,
				start,
			});

			if (!batch || batch.length === 0) {
				break;
			}

			logger.info(
				`[Sync:Poller] Fetched tracks batch: ${batch.length} items (offset: ${start})`
			);

			for (const track of batch) {
				if (track && track.SNG_ID) {
					tracks.push({
						id: String(track.SNG_ID),
						type: "track",
						title: track.SNG_TITLE || "Unknown",
						artist: track.ART_NAME || "Unknown",
					});
				}
			}

			if (batch.length < batchSize) {
				break;
			}

			start += batchSize;
		}

		const seen = new Set<string>();
		const unique = tracks.filter((track) => {
			if (seen.has(track.id)) {
				return false;
			}
			seen.add(track.id);
			return true;
		});

		logger.info(
			`[Sync:Poller] Favorite tracks: ${unique.length} unique (${tracks.length - unique.length} duplicates removed)`
		);
		return unique;
	}

	private async fetchFavoriteAlbums(userId: string): Promise<FavoriteAlbum[]> {
		logger.info("[Sync:Poller] Fetching favorite albums...");
		const albums = await this.dz.gw.get_user_albums(userId, { limit: -1 });
		logger.info(`[Sync:Poller] Raw albums response: ${albums.length} items`);

		const result: FavoriteAlbum[] = [];

		for (const album of albums) {
			if (album && album.id) {
				result.push({
					id: String(album.id),
					type: "album",
					title: album.title || "Unknown",
					artist: album.artist?.name || "Unknown",
				});
			}
		}

		const seen = new Set<string>();
		const unique = result.filter((album) => {
			if (seen.has(album.id)) {
				return false;
			}
			seen.add(album.id);
			return true;
		});

		logger.info(
			`[Sync:Poller] Favorite albums: ${unique.length} unique (${result.length - unique.length} duplicates removed)`
		);
		return unique;
	}

	private async fetchFavoritePlaylists(
		userId: string
	): Promise<FavoritePlaylist[]> {
		logger.info("[Sync:Poller] Fetching favorite playlists...");
		const playlists = await this.dz.gw.get_user_playlists(userId, {
			limit: -1,
		});
		logger.info(
			`[Sync:Poller] Raw playlists response: ${playlists.length} items`
		);

		const result: FavoritePlaylist[] = [];

		for (const playlist of playlists) {
			if (playlist && playlist.id) {
				result.push({
					id: String(playlist.id),
					type: "playlist",
					title: playlist.title || "Unknown",
				});
			}
		}

		const seen = new Set<string>();
		const unique = result.filter((playlist) => {
			if (seen.has(playlist.id)) {
				return false;
			}
			seen.add(playlist.id);
			return true;
		});

		logger.info(
			`[Sync:Poller] Favorite playlists: ${unique.length} unique (${result.length - unique.length} duplicates removed)`
		);
		return unique;
	}

	private async fetchFavoriteArtists(
		userId: string
	): Promise<FavoriteArtist[]> {
		logger.info("[Sync:Poller] Fetching favorite artists...");
		const artists = await this.dz.gw.get_user_artists(userId, { limit: -1 });
		logger.info(`[Sync:Poller] Raw artists response: ${artists.length} items`);

		const result: FavoriteArtist[] = [];

		for (const artist of artists) {
			if (artist && artist.id) {
				result.push({
					id: String(artist.id),
					type: "artist",
					title: artist.name || "Unknown",
				});
			}
		}

		const seen = new Set<string>();
		const unique = result.filter((artist) => {
			if (seen.has(artist.id)) {
				return false;
			}
			seen.add(artist.id);
			return true;
		});

		logger.info(
			`[Sync:Poller] Favorite artists: ${unique.length} unique (${result.length - unique.length} duplicates removed)`
		);
		return unique;
	}
}
