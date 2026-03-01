import { appSendGet } from "@/tests/utils.js";
import { describe, test, expect } from "vitest";

describe("syncStatus requests", () => {
	test("should respond 401 when not logged in", async () => {
		const response = await appSendGet("/api/syncStatus");
		expect(response.status).toBe(401);
		expect(response.body.error).toBe("Not logged in");
	});
});
