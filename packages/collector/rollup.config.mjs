import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { builtinModules } from "module";

export default {
    input: "src/index.ts",
    output: {
        file: "dist/collector.js",
        format: "cjs",
        sourcemap: true,
        exports: "auto",
    },
    // Externalize all Node.js built-ins; bundle all npm dependencies
    external: builtinModules.flatMap((m) => [m, `node:${m}`]),
    plugins: [
        json(),
        nodeResolve({ preferBuiltins: true }),
        commonjs(),
        typescript({ tsconfig: "./tsconfig.rollup.json" }),
    ],
};
