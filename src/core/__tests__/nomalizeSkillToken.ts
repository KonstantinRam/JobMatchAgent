import { test } from "node:test";
import assert from "node:assert/strict";
import {normalizeSkillToken} from "../skillNormalization.js";
test("canonicalizeSkill: 'TypeScript' → 'typescript'", () => {
    assert.equal(normalizeSkillToken("TypeScript"), "typescript");
});

test("canonicalizeSkill: 'React.js' → 'react'", () => {
    assert.equal(normalizeSkillToken("React.js"), "react");
});

test("canonicalizeSkill: 'Node.js' → 'node' (collides with bare 'node' — accepted)", () => {
    assert.equal(normalizeSkillToken("Node.js"), "node");
});

test("canonicalizeSkill: 'JS' → 'javascript' via ALIAS_MAP", () => {
    assert.equal(normalizeSkillToken("JS"), "javascript");
});

test("canonicalizeSkill: 'Postgres' → 'postgresql' via ALIAS_MAP", () => {
    assert.equal(normalizeSkillToken("Postgres"), "postgresql");
});

test("normalizeSkill: 'Data Engineering' → 'data-engineering'", () => {
    assert.equal(normalizeSkillToken("Data Engineering"), "data-engineering");
});

test("normalizeSkill trims surrounding whitespace", () => {
    assert.equal(normalizeSkillToken("  Python  "), "python");
});

test("normalizeSkill: 'K8s' → 'kubernetes' via ALIAS_MAP", () => {
    assert.equal(normalizeSkillToken("K8s"), "kubernetes");
});

test("normalizeSkill is idempotent: f(f(x)) === f(x)", () => {
    const inputs = [
        "TypeScript",
        "React.js",
        "Node.js",
        "JS",
        "Postgres",
        "Data Engineering",
        "  Python  ",
        "K8s",
        "kebab-case-thing",
        "PostgreSQL",
    ];
    for (const x of inputs) {
        const once = normalizeSkillToken(x);
        const twice = normalizeSkillToken(once);
        assert.equal(twice, once, `not idempotent for input: ${JSON.stringify(x)}`);
    }
});