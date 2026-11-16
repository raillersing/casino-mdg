import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateStagingUrl,
  validateStagingIdentity,
} from "./staging-live-acceptance.mjs";

test("staging target is limited to an explicit local SSH tunnel", () => {
  assert.equal(
    validateStagingUrl("http://127.0.0.1:18081/").port,
    "18081",
  );
  assert.equal(
    validateStagingUrl("http://localhost:19000/").hostname,
    "localhost",
  );
  for (const value of [
    "https://casino-mdg.example/",
    "https://127.0.0.1/",
    "http://127.0.0.1:80/",
    "http://127.0.0.1:18081/admin/",
    "http://127.0.0.1:18081/?target=prod",
    "http://127.0.0.1:18081/#other",
    "http://someone@127.0.0.1:18081/",
    "http://10.0.0.1:18081/",
  ]) {
    assert.throws(() => validateStagingUrl(value), undefined, value);
  }
});

test("acceptance requires a positive explicit staging-only marker", () => {
  assert.equal(
    validateStagingIdentity({
      environment: "staging",
      application: "casino-mdg",
    }),
    true,
  );
  for (const value of [
    null,
    {},
    { environment: "production", application: "casino-mdg" },
    { environment: "staging", application: "not-casino-mdg" },
  ]) {
    assert.throws(() => validateStagingIdentity(value));
  }
});
