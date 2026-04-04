#!/usr/bin/env node
const assert = require("node:assert/strict");

function clean(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function validateCoursePayloadShape(course) {
  if (!course || typeof course !== "object") return false;
  if (!Array.isArray(course.modules)) return false;
  for (const moduleRow of course.modules) {
    if (!moduleRow || typeof moduleRow !== "object") return false;
    if (!Array.isArray(moduleRow.lessons)) return false;
  }
  return true;
}

function sortModulesAndLessons(modules) {
  return (Array.isArray(modules) ? modules : [])
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || 0) - Number(b.id || 0))
    .map((moduleRow) => ({
      ...moduleRow,
      lessons: (Array.isArray(moduleRow.lessons) ? moduleRow.lessons : [])
        .slice()
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || Number(a.id || 0) - Number(b.id || 0)),
    }));
}

function hasDuplicateModuleRenderKeys(courseSlug, modules) {
  const seen = new Set();
  for (const moduleRow of modules || []) {
    const key = [normalizeText(courseSlug), normalizeText(moduleRow.title) || normalizeText(moduleRow.slug)].join("::");
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function run() {
  const payload = {
    course_slug: "prompt-to-profit",
    modules: [
      {
        id: 11,
        slug: "second-module",
        title: "Second Module",
        sort_order: 2,
        lessons: [
          { id: 112, title: "L2", order: 2 },
          { id: 111, title: "L1", order: 1 },
        ],
      },
      {
        id: 10,
        slug: "first-module",
        title: "First Module",
        sort_order: 1,
        lessons: [{ id: 101, title: "L1", order: 1 }],
      },
    ],
  };

  assert.equal(validateCoursePayloadShape(payload), true, "course payload shape should be valid");

  const ordered = sortModulesAndLessons(payload.modules);
  assert.equal(Number(ordered[0].id), 10, "module ordering should be stable");
  assert.equal(Number(ordered[1].lessons[0].id), 111, "lesson ordering should be stable");

  assert.equal(
    hasDuplicateModuleRenderKeys("prompt-to-profit", [
      { title: "Module A", slug: "a" },
      { title: "Module A", slug: "a-dup" },
    ]),
    true,
    "duplicate module render keys should be detected"
  );

  assert.equal(
    hasDuplicateModuleRenderKeys("prompt-to-profit", [
      { title: "Module A", slug: "a" },
      { title: "Module B", slug: "b" },
    ]),
    false,
    "unique module render keys should pass"
  );

  console.log("learning-safety-checks: ok");
}

run();
