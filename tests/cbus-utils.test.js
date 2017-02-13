'use strict';

const test = require('tape').test;

const cbusUtils = require('../cbus-utils.js');


test('extractIdentifierFromFileName', function (assert) {
	assert.plan(1);
	
	const fileId = cbusUtils.extractIdentifierFromFileName(__filename);
	assert.equal(fileId, 'cbus-utils.test');
	
	assert.end();
});

test('integerise', function (assert) {
	assert.plan(7);
	
	assert.equal(cbusUtils.integerise(4), 4);
	assert.equal(cbusUtils.integerise(-4), -4);
	assert.equal(cbusUtils.integerise(`22`), 22);
	
	assert.equal(typeof cbusUtils.integerise(undefined), `undefined`);
	
	assert.throws(function () {
		cbusUtils.integerise(`3.14159`);
	});
	
	assert.throws(function () {
		cbusUtils.integerise(`abc`);
	});
	
	assert.throws(function () {
		cbusUtils.integerise(/regex/);
	});
	
	assert.end();
});
