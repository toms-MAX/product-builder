import globals from "globals";
import js from "@eslint/js";

export default [
    {
        languageOptions: {
            globals: {
                ...globals.browser,
            }
        },
        rules: js.configs.recommended.rules,
    }
];