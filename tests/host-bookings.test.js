const test = require("node:test");
const assert = require("node:assert/strict");

const Home = require("../models/home");

test("home model exposes a host reference for host booking visibility", () => {
  assert.ok(Home.schema.paths.host, "Host field should exist on Home model");
});
