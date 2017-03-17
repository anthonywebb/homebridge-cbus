'use strict';

const fs = require('fs');

const xml2js = require('xml2js');

const test = require('tape').test;
const rewire = require('rewire');

require('../hot-debug.js');
const log = require('debug')('test-output');

const CGateDatabase = rewire(`../lib/cgate-database.js`);
const CBusNetId = require('../lib/cbus-netid.js');

const _parseXML = CGateDatabase.__get__('_parseXML');

test(`setup tests`, function (assert) {
	assert.plan(2);

	const dbxml = fs.readFileSync(`test/resources/EMPTY_APPLICATION.xml`);

	xml2js.parseString(dbxml, {
		normalizeTags: true,
		explicitArray: false
	}, (err, databaseXML) => {
		assert.equals(err, null, `parsing XML`);
		const result = _parseXML(databaseXML, new CBusNetId(`FOO`, 254));
		assert.equals(Object.keys(result.applications).length, 8, `application count`);
		assert.end();
	});
});
