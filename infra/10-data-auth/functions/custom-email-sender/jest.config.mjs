// Jest root for this package (T-2, design.md DD-1b). There is no root-level
// package.json or jest config anywhere under infra/ — backend/ and
// frontend/ were the only two jest roots in this repository before this
// task. Run from this directory: see package.json's "test" script.
//
// Plain-ESM, no-babel setup: `transform: {}` means Jest applies no
// transform at all (there is nothing to transpile — this package is already
// valid ESM, per design.md DD-1b), and the package.json "test" script passes
// `--experimental-vm-modules` to Node so Jest can execute `.mjs` test and
// source files directly.
export default {
  testEnvironment: 'node',
  testMatch: ['**/*.spec.mjs'],
  moduleFileExtensions: ['mjs', 'js', 'json'],
  transform: {},
};
