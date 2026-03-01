import { sessionDZ } from "@/deemixApp.js";
import type { SyncService } from "@/sync/SyncService.js";
import type { ApiHandler } from "@/types.js";
import type { SyncSettings } from "deemix";
import type { RequestHandler } from "express";

const path: ApiHandler["path"] = "/syncConfigure";

const handler: RequestHandler = async (req, res) => {
	const dz = sessionDZ[req.session.id];
	if (!dz || !dz.currentUser) {
		return res.status(401).json({ error: "Not logged in" });
	}

	const userId = String(dz.currentUser.id);
	const syncService: SyncService = req.app.get("syncService");

	const config = req.body as Partial<SyncSettings>;

	if (config.interval !== undefined) {
		const minInterval = 300000;
		if (typeof config.interval !== "number" || config.interval < minInterval) {
			return res.status(400).json({
				error: `Interval must be at least ${minInterval}ms (5 minutes)`,
			});
		}
	}

	if (config.batchSize !== undefined) {
		if (
			typeof config.batchSize !== "number" ||
			config.batchSize < 1 ||
			config.batchSize > 100
		) {
			return res.status(400).json({
				error: "Batch size must be between 1 and 100",
			});
		}
	}

	try {
		await syncService.updateConfig(userId, config);
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
