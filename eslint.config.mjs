import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scratch directory. It is gitignored (.gitignore:83), so nothing here is
    // in the repository, reviewed, or shipped — but overriding the default
    // ignores above meant eslint walked it anyway. It contributed 31 of the 46
    // errors in the CI lint run, which is most of the reason the lint step had
    // been left non-blocking: the signal was buried in files that do not exist
    // for anyone else. Excluding it takes the real count to 15.
    "tmp/**",
  ]),
]);

export default eslintConfig;
