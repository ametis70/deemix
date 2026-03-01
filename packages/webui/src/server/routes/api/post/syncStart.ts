import { sessionDZ } from "@/deemixApp.js";
import type { SyncService } from "@/sync/SyncService.js";
import type { ApiHandler } from "@/types.js";
import type { RequestHandler } from "express";

const path: ApiHandler["path"] = "/syncStart";

const handler: RequestHandler = async (req, res) => {
	const dz = sessionDZ[req.session.id];
	if (!dz || !dz.currentUser) {
		return res.status(401).json({ error: "Not logged in" });
	}

	const userId = String(dz.currentUser.id);
	const syncService: SyncService = req.app.get("syncService");

	try {
		await syncService.startSync(userId, req.session.id);
		const status = await syncService.getStatus(userId);
		res.status(200).json({ success: true, status });
	} catch (error) {
		res
			.status(500)
			.json({ error: error instanceof Error ? error.message : String(error) });
	}
};

const apiHandler: ApiHandler = { path, handler };
export default apiHandler;
