"use strict"

// https://github.com/mochajs/mocha/blob/master/example/config/.mocharc.js
module.exports = {
  "exit": true,
  "recursive": true,
  "slow": 500,
  "timeout": 2000,
  "ui": "bdd",
  "require": [
    "test/utils/runners/mocha/init.js",
  ],
  "spec": [
    "test/**/*.spec.ts",
  ],
  "file": [
    "test/setup.ts",
  ],
};
