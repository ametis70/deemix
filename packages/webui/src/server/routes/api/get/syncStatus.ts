import { sessionDZ } from "@/deemixApp.js";
import type { SyncService } from "@/sync/SyncService.js";
import type { ApiHandler } from "@/types.js";
import type { RequestHandler } from "express";

const path: ApiHandler["path"] = "/syncStatus";

const handler: RequestHandler = async (req, res) => {
	const dz = sessionDZ[req.session.id];
	if (!dz || !dz.currentUser) {
		return res.status(401).json({ error: "Not logged in" });
	}

	const userId = String(dz.currentUser.id);
	const syncService: SyncService = req.app.get("syncService");

	try {
		const status = await syncService.getStatus(userId);
		const stateManager = syncService["stateManager"];
		const trackedItems = await stateManager.loadTrackedItems(userId);

		// Compute summary statistics
		const allItems = [
			...Object.values(trackedItems.tracks),
			...Object.values(trackedItems.albums),
			...Object.values(trackedItems.playlists),
		];

		const summary = {
			new: allItems.filter((item) => item.status === "new").length,
			downloading: allItems.filter((item) => item.status === "downloading")
				.length,
			success: allItems.filter((item) => item.status === "success").length,
			failed: allItems.filter((item) => item.status === "failed").length,
		};

		res.status(200).json({ status, trackedItemsSummary: summary });
	} catch (error) {
		res
			.status(500)
			.json({ error: error instanceof Error ? error.message : String(error) });
	}
};

const apiHandler: ApiHandler = { path, handler };
export default apiHandler;
