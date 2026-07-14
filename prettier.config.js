/** @type {import('prettier').Config} */
export default {
    tabWidth: 4,
    useTabs: false,
    semi: true,
    singleQuote: false,
    trailingComma: "es5",
    printWidth: 100,
    endOfLine: "lf",
    arrowParens: "always",
    bracketSpacing: true,
    overrides: [
        {
            files: ["**/*.{yml,yaml,json}"],
            options: {
                tabWidth: 2,
            },
        },
    ],
};
