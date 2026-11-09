import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["node_modules/**"],
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
