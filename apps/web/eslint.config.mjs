import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "react-hooks/incompatible-library": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // The copy keeps the design prototype's DEFAULT_RULE and PROPOSED_RULE for its parity test, with the circulated
    // rule as the default. The screen opens on the revised paper's main rule, so it reads the pair from rule-pair.ts.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/screening/copy/**", "tests/screening/copy/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/screening/copy", "**/copy", "**/copy/rules"],
              importNames: ["DEFAULT_RULE", "PROPOSED_RULE"],
              message: "Use PRIMARY_RULE, SENSITIVITY_RULE or RULE_PAIR from lib/screening/rule-pair.ts.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", ".audit-work-build/**", "node_modules/**", "next-env.d.ts"]),
]);
