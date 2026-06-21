/** Jest config for an ESM (type: module) project. Run via:
 *   node --experimental-vm-modules node_modules/jest/bin/jest.js
 * (wired into `npm test`). No Babel transform — Node runs ESM natively. */
module.exports = {
  testEnvironment: "node",
  transform: {},
  testMatch: ["**/tests/**/*.test.js"],
  testTimeout: 60000,
  maxWorkers: 1,
  forceExit: true
};
