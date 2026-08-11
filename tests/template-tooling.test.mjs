import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

function run(command, args) {
  return execFileSync(command, args, { cwd: projectRoot, encoding: "utf8" });
}

test("validates the reusable profile, skills, and privacy boundary", () => {
  assert.match(run(process.execPath, ["scripts/validate-profile.mjs"]), /交換設定有效/);
  assert.match(run(process.execPath, ["scripts/validate-skills.mjs"]), /Skill 檢查通過/);
  assert.match(run(process.execPath, ["scripts/privacy-check.mjs"]), /隱私檢查通過/);
});

test("ships only experience-level packing inspiration URLs", async () => {
  const inspiration = JSON.parse(await readFile(new URL("../config/packing-inspiration.json", import.meta.url), "utf8"));
  assert.equal(inspiration.experienceOnly, true);
  assert.deepEqual(inspiration.sources.map((source) => source.url), [
    "https://youtu.be/3QKMni6Vk28",
    "https://youtu.be/6aabTZsFQRE",
  ]);
});

test("initializes a clone from a complete profile without prompts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exchange-companion-profile-"));
  const source = JSON.parse(await readFile(new URL("../config/exchange-profile.json", import.meta.url), "utf8"));
  source.homeCity = "Taipei";
  source.hostCountry = "Japan";
  source.hostCountryCode = "JP";
  source.hostCity = "Tokyo";
  source.hostSchool = "Example University";
  source.hostTimeZone = "Asia/Tokyo";
  source.primaryCurrency = "JPY";
  source.visual.routeLabel = "Taipei → Tokyo";
  source.visual.heroImage = "/images/exchange-hero-placeholder.svg";
  source.visual.socialImage = "/images/exchange-social-placeholder.svg";
  source.visual.generatedFor = { homeCity: "Taipei", hostCity: "Tokyo" };
  const input = join(directory, "input.json");
  const output = join(directory, "output.json");
  await writeFile(input, `${JSON.stringify(source, null, 2)}\n`, "utf8");

  const result = run(process.execPath, ["scripts/setup-exchange.mjs", "--profile", input, "--output", output]);
  assert.match(result, /Taipei → Tokyo/);
  const configured = JSON.parse(await readFile(output, "utf8"));
  assert.equal(configured.hostCountryCode, "JP");
  assert.equal(configured.primaryCurrency, "JPY");
});

test("rejects invalid time zones, missing artwork, and route-art mismatches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exchange-companion-invalid-profile-"));
  const profile = JSON.parse(await readFile(new URL("../config/exchange-profile.json", import.meta.url), "utf8"));
  profile.hostTimeZone = "Asia/Tokoyo";
  profile.visual.heroImage = "/images/does-not-exist.png";
  profile.visual.generatedFor.hostCity = "Tokyo";
  const path = join(directory, "invalid.json");
  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  assert.throws(() => run(process.execPath, ["scripts/validate-profile.mjs", path]), /Command failed/);
});

test("validates a reviewable concierge import bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exchange-companion-import-"));
  const bundlePath = join(directory, "bundle.json");
  await writeFile(bundlePath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2027-01-15T12:00:00+08:00",
    journeyScope: "exchange:journey-example",
    sources: [
      { id: "source-school-2027-01-15", label: "School exchange office", kind: "school", capturedAt: "2027-01-15" },
      { id: "source-ticket-2027-01-15", label: "User-authorized e-ticket", kind: "file", evidenceType: "ticket", capturedAt: "2027-01-15" }
    ],
    proposals: [{
      id: "proposal-orientation-2027-01-15",
      title: "加入 Orientation",
      summary: "學校已公布日期，等待使用者確認。",
      entity: "study-event",
      action: "add",
      value: { id: "orientation-2027", title: "Orientation", kind: "orientation", startDate: "2027-03-02", mandatory: true, notes: "" },
      confidence: "high",
      privacy: "private",
      evidenceIds: ["source-school-2027-01-15"],
      status: "pending"
    }, {
      id: "proposal-flight-allowance-2027-01-15",
      title: "加入本人機票行李規則",
      summary: "只保存已去識別的票面額度，等待使用者確認。",
      entity: "flight-allowance",
      action: "add",
      value: {
        id: "flight-allowance-outbound",
        label: "Outbound ticket",
        airline: "Example Air",
        segment: "TPE → NRT",
        checkedMode: "piece",
        checkedPieceCount: 1,
        checkedPieceWeightKg: 23,
        checkedTotalWeightKg: 0,
        carryOnMode: "piece",
        carryOnPieceCount: 1,
        carryOnPieceWeightKg: 7,
        personalItemMode: "unknown",
        personalItemPieceCount: 0,
        personalItemPieceWeightKg: 0,
        provenance: "ticket",
        confirmed: false,
        sourceLabel: "User-authorized e-ticket",
        verifiedAt: "2027-01-15",
        notes: "Passenger and booking identifiers removed."
      },
      confidence: "high",
      privacy: "private",
      evidenceIds: ["source-ticket-2027-01-15"],
      status: "pending"
    }, {
      id: "proposal-resource-intake-2027-01-15",
      title: "辨識使用者貼上的網址",
      summary: "網址保持私人，等待使用者確認。",
      entity: "resource-intake",
      action: "add",
      value: {
        id: "resource-intake-example",
        url: "https://example.org/exchange",
        note: "Check the exchange deadline",
        status: "pending",
        createdAt: "2027-01-15T12:00:00+08:00"
      },
      confidence: "high",
      privacy: "private",
      evidenceIds: ["source-school-2027-01-15"],
      status: "pending"
    }]
  }), "utf8");

  const result = run("python3", [".agents/skills/exchange-concierge/scripts/validate_import_bundle.py", bundlePath]);
  assert.match(result, /VALID high=3/);
});

test("validates a budget proposal against the self-describing website handoff", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exchange-companion-budget-import-"));
  const bundlePath = join(directory, "bundle.json");
  const handoffPath = join(directory, "handoff.json");
  const scope = "exchange:journey-example";
  const state = {
    journey: { id: "journey-example", hostSchool: "Example University", hostCity: "Example City", destinations: ["Example Country"], startDate: "2027-03-01", endDate: "2027-07-31" },
    tasks: [], resources: [], resourceIntake: [], packingItems: [], bags: [], flightAllowances: [], studyEvents: [], travelPlans: [],
    budget: [{ id: "rent", name: "Monthly housing", category: "housing", amount: 0, currency: "EUR", cadence: "monthly", basis: "unset", paid: false, notes: "", sourceLabel: "", verifiedAt: "" }],
    aiInbox: { sources: [], proposals: [] },
  };
  await writeFile(handoffPath, JSON.stringify({ schemaVersion: 1, kind: "exchange-companion-handoff", generatedAt: "2027-01-15T12:00:00+08:00", journeyScope: scope, state }), "utf8");
  await writeFile(bundlePath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2027-01-15T12:00:00+08:00",
    journeyScope: scope,
    sources: [{ id: "source-housing-run-1", label: "Authorized housing contract", kind: "file", capturedAt: "2027-01-15" }],
    proposals: [{
      id: "proposal-budget-rent-run-1",
      title: "Update confirmed monthly housing cost",
      summary: "The authorized housing record confirms the monthly amount.",
      entity: "budget-item",
      action: "update",
      targetId: "rent",
      value: { amount: 393, currency: "EUR", basis: "confirmed", sourceLabel: "Authorized housing contract", verifiedAt: "2027-01-15", notes: "Private identifiers removed." },
      confidence: "high",
      privacy: "private",
      evidenceIds: ["source-housing-run-1"],
      status: "pending",
    }],
  }), "utf8");

  const result = run("python3", [".agents/skills/exchange-concierge/scripts/validate_import_bundle.py", bundlePath, handoffPath]);
  assert.match(result, /VALID high=1/);
});

test("initializes a fresh import shell from the exact handoff instead of stale output metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exchange-companion-bound-import-"));
  const handoffPath = join(directory, "handoff.json");
  const outputPath = join(directory, "bundle.json");
  const scope = "exchange:journey-hdm";
  const state = {
    journey: { id: "journey-hdm", hostSchool: "Hochschule der Medien Stuttgart (HdM)", hostCity: "Stuttgart", destinations: ["Germany"], startDate: "2026-10-01", endDate: "2027-08-31" },
  };
  await writeFile(handoffPath, JSON.stringify({
    schemaVersion: 1,
    kind: "exchange-companion-handoff",
    journeyScope: scope,
    state,
    outputTemplate: { schemaVersion: 1, generatedAt: "2026-08-11T12:00:00+08:00", journeyScope: scope, sources: [], proposals: [] },
  }), "utf8");
  await writeFile(outputPath, JSON.stringify({ schemaVersion: 1, generatedAt: "2027-01-01T00:00:00+08:00", journeyScope: "exchange:wrong:Example:City:Country:2027-01-01:2027-12-31", sources: [{ id: "stale" }], proposals: [{ id: "stale" }] }), "utf8");

  const result = run("python3", [".agents/skills/exchange-concierge/scripts/initialize_import_bundle.py", handoffPath, outputPath]);
  assert.match(result, /INITIALIZED/);
  const initialized = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(initialized.journeyScope, scope);
  assert.deepEqual(initialized.sources, []);
  assert.deepEqual(initialized.proposals, []);
});

test("rejects unsafe concierge updates, naive timestamps, and inbox collisions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exchange-companion-invalid-import-"));
  const validator = ".agents/skills/exchange-concierge/scripts/validate_import_bundle.py";
  const base = {
    schemaVersion: 1,
    generatedAt: "2027-01-15T12:00:00+08:00",
    journeyScope: "exchange:journey-example",
    sources: [{ id: "source-school-run-1", label: "School exchange office", kind: "school", capturedAt: "2027-01-15" }],
    proposals: [{
      id: "proposal-task-run-1",
      title: "更新申請狀態",
      summary: "等待使用者確認。",
      entity: "task",
      action: "update",
      targetId: "school-application",
      value: { status: "in-progress" },
      confidence: "high",
      privacy: "private",
      evidenceIds: ["source-school-run-1"],
      status: "pending"
    }]
  };

  const malformedPath = join(directory, "malformed.json");
  await writeFile(malformedPath, JSON.stringify({
    ...base,
    proposals: [{ ...base.proposals[0], value: { status: 3, phase: "unknown" } }]
  }), "utf8");
  assert.throws(() => run("python3", [validator, malformedPath]), /Command failed/);

  const naivePath = join(directory, "naive-time.json");
  await writeFile(naivePath, JSON.stringify({ ...base, generatedAt: "2027-01-15T12:00:00" }), "utf8");
  assert.throws(() => run("python3", [validator, naivePath]), /Command failed/);

  const collisionPath = join(directory, "collision.json");
  const statePath = join(directory, "state.json");
  await writeFile(collisionPath, JSON.stringify(base), "utf8");
  await writeFile(statePath, JSON.stringify({
    journey: { id: "journey-example", hostSchool: "Example University", hostCity: "Example City", destinations: ["Example Country"], startDate: "2027-03-01", endDate: "2027-07-31" },
    tasks: [{ id: "school-application" }],
    resources: [],
    packingItems: [],
    studyEvents: [],
    travelPlans: [],
    bags: [],
    aiInbox: { sources: [{ id: "source-school-run-1" }], proposals: [{ id: "proposal-task-run-1" }] }
  }), "utf8");
  assert.throws(() => run("python3", [validator, collisionPath, statePath]), /Command failed/);

  const hiddenPath = join(directory, "hidden-field.json");
  await writeFile(hiddenPath, JSON.stringify({
    ...base,
    sources: [{ ...base.sources[0], rawEmailBody: "hidden private content" }]
  }), "utf8");
  assert.throws(() => run("python3", [validator, hiddenPath]), /Command failed/);

  const notePath = join(directory, "non-string-note.json");
  await writeFile(notePath, JSON.stringify({
    ...base,
    sources: [{ ...base.sources[0], note: { privateMessageId: "abc" } }]
  }), "utf8");
  assert.throws(() => run("python3", [validator, notePath]), /Command failed/);

  const invalidTicketPath = join(directory, "invalid-ticket-source.json");
  await writeFile(invalidTicketPath, JSON.stringify({
    ...base,
    proposals: [{
      ...base.proposals[0],
      id: "proposal-flight-invalid-source",
      entity: "flight-allowance",
      action: "add",
      targetId: undefined,
      value: {
        id: "flight-allowance-invalid",
        label: "Ticket",
        airline: "Example Air",
        segment: "A → B",
        checkedMode: "piece",
        checkedPieceCount: 1,
        checkedPieceWeightKg: 23,
        checkedTotalWeightKg: 0,
        carryOnMode: "unknown",
        carryOnPieceCount: 0,
        carryOnPieceWeightKg: 0,
        personalItemMode: "unknown",
        personalItemPieceCount: 0,
        personalItemPieceWeightKg: 0,
        provenance: "ticket",
        confirmed: false,
        sourceLabel: "Ticket",
        verifiedAt: "2027-01-15",
        notes: ""
      }
    }]
  }, (_key, value) => value === undefined ? undefined : value), "utf8");
  assert.throws(() => run("python3", [validator, invalidTicketPath]), /Command failed/);
});
