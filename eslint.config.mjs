import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Worktrees de trabalho paralelo vivem em .claude/worktrees/ e contêm
      // uma CÓPIA do src. Sem este ignore, `eslint .` linta o mesmo arquivo
      // duas vezes e um merge em curso na cópia — com marcador de conflito
      // ainda no arquivo — reprova o lint do repositório principal, que não
      // tem defeito nenhum.
      ".claude/**",
    ],
  },
];

export default eslintConfig;
