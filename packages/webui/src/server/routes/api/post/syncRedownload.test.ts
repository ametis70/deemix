import { appSendPost } from "@/tests/utils.js";
import { describe, test, expect } from "vitest";

describe("syncRedownload requests", () => {
	test("should respond 401 when not logged in", async () => {
		const response = await appSendPost("/api/syncRedownload").send({
			itemId: "123456",
			itemType: "track",
		});
		expect(response.status).toBe(401);
		expect(response.body.error).toBe("Not logged in");
	});
});
