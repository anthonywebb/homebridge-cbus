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

test(`setup tests`, function (assert) {
	assert.plan(2);

	const rawXML = fs.readFileSync(`test/resources/EMPTY_APPLICATION.xml`);

	xml2js.parseString(rawXML, {
		normalizeTags: true,
		explicitArray: false
	}, (err, networkTree) => {
		assert.equals(err, null, `parsing XML`);

		const database = {
			installation: {
				project: {
					address: `FOO`,
					network: networkTree
				}
			}
		};

		const result = _processDatabase(database, new CBusNetId(`FOO`));
		assert.equals(Object.keys(result.applications).length, 8, `application count`);
		assert.end();
	});
});
