const test = require('node:test');
const assert = require('node:assert/strict');
const createPlugin = require('../plugin/index.js');

test('plugin constructor returns a valid Signal K plugin object', () => {
  const mockApp = {
    debug: () => {},
    error: () => {},
    setPluginError: () => {},
    setPluginStatus: () => {},
    getDataDirPath: () => '/tmp'
  };

  const plugin = createPlugin(mockApp);

  assert.equal(typeof plugin, 'object');
  assert.equal(plugin.id, 'signalk-noon-log');
  assert.equal(typeof plugin.name, 'string');
  assert.equal(typeof plugin.schema, 'object');
  assert.equal(typeof plugin.start, 'function');
  assert.equal(typeof plugin.stop, 'function');
  assert.equal(typeof plugin.registerWithRouter, 'function');
});
