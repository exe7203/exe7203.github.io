import assert from "node:assert/strict";
import test from "node:test";
import {
  ADDRESS_HISTORY_LIMIT,
  addAddressHistoryEntry,
  readAddressHistory,
  removeAddressHistoryEntry,
  serializeAddressHistory,
} from "../app/lib/address-history.ts";

test("address history survives malformed or incompatible local data", () => {
  assert.deepEqual(readAddressHistory(null), []);
  assert.deepEqual(readAddressHistory("not-json"), []);
  assert.deepEqual(readAddressHistory('{"version":2,"items":[]}'), []);
});

test("each paste is kept as a separate cleaned-address entry", () => {
  const first = addAddressHistoryEntry([], " 台中市北區興進路205號 ", 1000, "a");
  const second = addAddressHistoryEntry(
    first,
    "台中市北區興進路205號",
    2000,
    "b",
  );

  assert.equal(second.length, 2);
  assert.deepEqual(second.map((item) => item.id), ["b", "a"]);
  assert.deepEqual(second.map((item) => item.address), [
    "台中市北區興進路205號",
    "台中市北區興進路205號",
  ]);
  assert.equal("raw" in second[0], false);
});

test("address history is versioned, validated, capped, and removable", () => {
  let history = [];
  for (let index = 0; index < ADDRESS_HISTORY_LIMIT + 7; index += 1) {
    history = addAddressHistoryEntry(
      history,
      `台中市測試路${index}號`,
      index + 1,
      `entry-${index}`,
    );
  }

  assert.equal(history.length, ADDRESS_HISTORY_LIMIT);
  const restored = readAddressHistory(serializeAddressHistory(history));
  assert.deepEqual(restored, history);

  const removed = removeAddressHistoryEntry(restored, restored[0].id);
  assert.equal(removed.length, ADDRESS_HISTORY_LIMIT - 1);
  assert.equal(removed.some((item) => item.id === restored[0].id), false);
});

test("invalid stored entries are ignored without exposing extra fields", () => {
  const restored = readAddressHistory(
    JSON.stringify({
      version: 1,
      items: [
        {
          id: "valid",
          address: " 台中市西區公益路1號 ",
          savedAt: 1234,
          raw: "乘客姓名與完整派單不應保留",
        },
        { id: "bad", address: "", savedAt: 1234 },
      ],
    }),
  );

  assert.deepEqual(restored, [
    { id: "valid", address: "台中市西區公益路1號", savedAt: 1234 },
  ]);
  assert.equal("raw" in restored[0], false);
});
