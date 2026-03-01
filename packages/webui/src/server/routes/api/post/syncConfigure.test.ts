import { appSendPost } from "@/tests/utils.js";
import { describe, test, expect } from "vitest";

describe("syncConfigure requests", () => {
	test("should respond 401 when not logged in", async () => {
		const response = await appSendPost("/api/syncConfigure").send({
			interval: 900000,
			batchSize: 10,
		});
		expect(response.status).toBe(401);
		expect(response.body.error).toBe("Not logged in");
	});
});
