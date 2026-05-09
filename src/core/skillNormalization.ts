/**
 * Lowercases, kebab-cases, and applies aliases.
 */
export function normalizeSkillToken(raw: string): string {

    //basics
    let s = raw.trim().toLowerCase();
    if (s.endsWith(".js")) {
        s = s.slice(0, -3);
    }
    s = s.replace(/\s+/g, "-");
    s = s.replace(/-+/g, "-");

    s = s.replace(/-?\d+(\.\d+)*$/, ""); // Should strip versions.

    if (Object.prototype.hasOwnProperty.call(ALIAS_MAP, s)) {
        s = ALIAS_MAP[s];
    }
    return s;
}

/**
 * TODO: move to a config file.
 */
export const ALIAS_MAP: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    k8s: "kubernetes",
    postgres: "postgresql",
    py: "python",
    node: "node",
    nodejs: "node",
    "node-js": "node",
    "react-js": "react",
};