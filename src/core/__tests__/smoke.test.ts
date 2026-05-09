import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PROFILE } from "../types.js";
import type { BackgroundProfile } from "../types.js";

test("contract is reachable: EMPTY_PROFILE conforms to BackgroundProfile", () => {
  const profile: BackgroundProfile = EMPTY_PROFILE;
  assert.equal(profile.name, "");
  assert.deepEqual(profile.experience, []);
});
