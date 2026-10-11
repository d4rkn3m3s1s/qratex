import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    rules: {
      // React Compiler kuralları — projede Compiler yok; sunucu bileşenleri ve API route’larda yanlış pozitifler üretiyor
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "import/no-anonymous-default-export": "warn",
    },
  },
  {
    // mimari-api korkulukları (B1/B5/B7): API uçlarında kimlik TEK yoldan (`defineRoute` /
    // `requireAuth` / `getOptionalSession`: askı, oturum sürümü, güncel rol, token replay, admin
    // kapısı). Çıplak `getServerSession` bu denetimlerin hepsini atlar. Yapısal denetim ayrıca
    // __tests__/architecture/api-architecture.test.ts içinde (CI'da jest).
    files: ["app/api/**/*.ts"],
    ignores: ["app/api/auth/[[]...nextauth[]]/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next-auth",
              importNames: ["getServerSession"],
              message: "API uçlarında requireAuth/getOptionalSession (lib/api-auth) ya da defineRoute kullanın.",
            },
            {
              name: "next-auth/next",
              importNames: ["getServerSession"],
              message: "API uçlarında requireAuth/getOptionalSession (lib/api-auth) ya da defineRoute kullanın.",
            },
          ],
        },
      ],
    },
  },
];

/** @type {import("eslint").Linter.Config[]} */
export default config;
