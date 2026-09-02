const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ["dist/**", ".expo/**"],
    settings: {
      "import/resolver": [
        {
          alias: {
            map: [["@", "./src"]],
            extensions: [".js", ".jsx", ".ts", ".tsx"],
          },
        },
        {
          node: {
            extensions: [".js", ".jsx", ".ts", ".tsx"],
          },
        },
      ],
    },
  },
]);
