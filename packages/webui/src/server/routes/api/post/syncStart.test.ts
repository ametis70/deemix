import { appSendPost } from "@/tests/utils.js";
import { describe, test, expect } from "vitest";

describe("syncStart requests", () => {
	test("should respond 401 when not logged in", async () => {
		const response = await appSendPost("/api/syncStart");
		expect(response.status).toBe(401);
		expect(response.body.error).toBe("Not logged in");
	});
});
