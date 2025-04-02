import globals from "globals";
import js from "@eslint/js";
import tsEslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default tsEslint.config(
  {
    ignores: [
      "node_modules",
      "!.*",
      "**/dist",
      "**/build",
    ],
  },
  {
    extends: [js.configs.recommended, ...tsEslint.configs.recommended],
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: { globals: globals.node },
  },
  eslintPluginPrettierRecommended,
);
