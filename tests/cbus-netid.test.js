'use strict';

const test = require('tape').test;
const util = require('util');

const CBusNetId = require('../cbus-netid.js');

test('constructor numerical', function (assert) {
	assert.plan(4);
	
	const netId = new CBusNetId(`SHAC1234`, 254, 57, 22);
	assert.equal(netId.project, 'SHAC1234');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, 22);
	
	assert.end();
});

test('constructor illegal decimal', function (assert) {
	assert.plan(4);
	
	assert.throws(function () {
		new CBusNetId(`SHAC`, 3.14, 1, 1);
	});
	
	assert.throws(function () {
		new CBusNetId(`SHAC`, 1, 2.718, 1);
	});
	
	assert.throws(function () {
		new CBusNetId(`SHAC`, 1, 1, 1.618);
	});
	
	assert.throws(function () {
		new CBusNetId(`SHAC`, 1, 1, `1.618`);
	});
	
	assert.end();
});

test('inspect', function (assert) {
	assert.plan(3);
	
	assert.equal(util.inspect(new CBusNetId(`SHAC1234`, '254', '57', '22')), '//SHAC1234/254/57/22');
	assert.equal(util.inspect(new CBusNetId(`SHAC1234`, '254', '57')), '//SHAC1234/254/57');
	assert.equal(util.inspect(new CBusNetId(`SHAC1234`, '254')), '//SHAC1234/254');
	
	assert.end();
});

	
test('constructor alpha', function (assert) {
	assert.plan(4);
	
	const netId = new CBusNetId(`SHAC1234`, '254', '57', '22');
	assert.equal(netId.project, 'SHAC1234');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, 22);
	
	assert.end();
});

test('constructor bad alpha', function (assert) {
	assert.plan(1);
	
	assert.throws(function () {
		new CBusNetId(`SH@#$%^&*IT`, '254', '57', '22');
	});
	
	assert.end();
});

test('construct network address netId', function (assert) {
	assert.plan(4);
	
	const netId = CBusNetId.parseNetId(`//SHAC1/254`);
	assert.equal(netId.project, 'SHAC1');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, undefined);
	assert.equal(netId.group, undefined);
	
	assert.end();
});

test('construct group address netId', function (assert) {
	assert.plan(4);
	
	const netId = CBusNetId.parseNetId(`//SHAC1/254/57/123`);
	assert.equal(netId.project, 'SHAC1');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, 123);
	
	assert.end();
});

test('construct application netId', function (assert) {
	assert.plan(4);
	
	const netId = CBusNetId.parseNetId(`//S31415/254/57`);
	assert.equal(netId.project, 'S31415');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, undefined);
	
	assert.end();
});

test('construct illegal group address', function (assert) {
	assert.plan(1);
	
	assert.throws(function () {
		CBusNetId.parseNetId(`//SHAC/254/57/`);
	});
	
	assert.end();
});

test('construct illegal application address', function (assert) {
	assert.plan(3);
	
	assert.throws(function () {
		// non numerical group
		CBusNetId.parseNetId(`//SHAC/254/57/abc`);
	});
	
	assert.throws(function () {
		// non numerical group
		CBusNetId.parseNetId(`//SHAC/254/57/3.124`);
	});
	
	assert.throws(function () {
		// non numerical group
		CBusNetId.parseNetId(`//SHAC/254a/57/3.124`);
	});
	
	assert.end();
});

test('construct malformed address', function (assert) {
	assert.plan(1);
	
	assert.throws(function () {
		// template mismatch
		CBusNetId.parseNetId(`whoopty doo`);
	});
	
	assert.end();
});

test('construct illegal whitespace', function (assert) {
	assert.plan(2);
	
	assert.throws(function () {
		// trailing space
		CBusNetId.parseNetId(`//SHAC/254/57/ `);
	});
	
	assert.throws(function () {
		// leading space
		CBusNetId.parseNetId(` //SHAC/254/57/`);
	});
	
	assert.end();
});

test('construct illegal project name', function (assert) {
	assert.plan(4);
	
	assert.throws(function () {
		// non numerical group
		CBusNetId.parseNetId(`//S,3AC/254/56`);
	});
	
	assert.throws(function () {
		// first char not alpha
		CBusNetId.parseNetId(`//1SHAC/254/56`);
	});
	
	assert.throws(function () {
		// name too long
		CBusNetId.parseNetId(`//S12345678/254/56`);
	});
	
	assert.throws(function () {
		// name empty
		CBusNetId.parseNetId(`///254/56/191`);
	});
	
	assert.end();
});

test('getModuleId', function (assert) {
	assert.plan(1);
	
	const netId = CBusNetId.parseNetId(`//S31415/254/208/128`);
	assert.equal(netId.getModuleId(), `fed080`);
	
	assert.end();
});

test('CBusNetId equals', function (assert) {
	assert.plan(2);
	
	const netId1 = CBusNetId.parseNetId(`//S31415/254/208/128`);
	const netId2 = CBusNetId.parseNetId(`//S31415/254/208/128`);
	assert.deepEquals(netId1, netId2);
	
	const netId3 = new CBusNetId(`S31415`, 254, 208, 128);
	assert.deepEquals(netId2, netId3);
	
	assert.end();
});
