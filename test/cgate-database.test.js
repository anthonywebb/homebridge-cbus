'use strict';

const fs = require('fs');

const xml2js = require('xml2js');

const test = require('tape').test;
const rewire = require('rewire');

require('../hot-debug.js');
const log = require('debug')('test-output');

const CGateDatabase = rewire(`../lib/cgate-database.js`);
const CBusNetId = require('../lib/cbus-netid.js');

const _processDatabase = CGateDatabase.__get__('_processDatabase');

function _getTree(fileName, callback) {
	const rawXML = fs.readFileSync(fileName);

	xml2js.parseString(rawXML, {
		normalizeTags: true,
		explicitArray: false
	}, (err, tree) => {
		console.assert(!err);
		callback(tree);
	});
}

// project with 2 networks
test(`project 2NET`, function (assert) {
	assert.plan(5);

	_getTree(`test/resources/2NET.xml`, tree => {
		assert.equals(tree.installation.project.address, `2NET`);

		const result = _processDatabase(tree, new CBusNetId(`1NET`), `project name`);

		assert.equals(result.groups[`//2NET/254/56/1`].tag, `group-a1`, `group-a1`);
		assert.equals(result.groups[`//2NET/254/56/2`].tag, `group-a2`, `group-a2`);
		assert.equals(result.groups[`//2NET/253/56/1`].tag, `group-b1`, `group-b1`);
		assert.equals(result.groups[`//2NET/253/56/2`].tag, `group-b2`, `group-b2`);

		assert.end();
	});
});

// project with 1 network
test(`project 1NET`, function (assert) {
	assert.plan(6);

	_getTree(`test/resources/1NET.xml`, tree => {
		assert.equals(tree.installation.project.address, `1NET`);

		const result = _processDatabase(tree, new CBusNetId(`1NET`), `project name`);

		assert.equals(result.groups[`//1NET/254/56/1`].tag, `group-1a`, `group-1a`);
		assert.equals(result.groups[`//1NET/254/56/2`].tag, `group-1b`, `group-1b`);
		assert.equals(result.groups[`//1NET/254/57/1`].tag, `group-2a`, `group-2a`);
		assert.equals(result.groups[`//1NET/254/57/2`].tag, `group-2b`, `group-2b`);
		assert.equals(result.groups[`//1NET/254/57/10`].tag, `group-2h`, `group-2h`);

		assert.end();
	});
});

// project with an empty application section
// see https://github.com/anthonywebb/homebridge-cbus/issues/35
test(`project with empty application`, function (assert) {
	assert.plan(2);

	_getTree(`test/resources/EMPTY_APPLICATION.xml`, fragment => {
		const tree = {
			installation: {
				project: {
					address: `FOO`,
					network: fragment.network
				}
			}
		};
		assert.equals(tree.installation.project.address, `FOO`);

		const result = _processDatabase(tree, new CBusNetId(`FOO`));
		assert.equals(Object.keys(result.applications).length, 8, `application count`);
		assert.end();
	});
});


