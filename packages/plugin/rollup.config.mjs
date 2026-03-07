import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { builtinModules } from "module";

export default {
    input: "src/plugin.ts",
    output: {
        file: "dist/plugin.js",
        format: "cjs",
        sourcemap: true,
        exports: "auto",
    },
    // Externalize all Node.js built-ins; bundle all npm dependencies
    external: builtinModules.flatMap((m) => [m, `node:${m}`]),
    plugins: [
        nodeResolve({ preferBuiltins: true }),
        commonjs(),
        typescript({ tsconfig: "./tsconfig.json" }),
    ],
};
