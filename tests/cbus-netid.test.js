'use strict';

const util = require('util');

const test = require('tape').test;

const CBusNetId = require('../cbus-netid.js');

test('constructor numerical', function (assert) {
	assert.plan(4);
	
	const netId = new CBusNetId(`EXAMPLE`, 254, 57, 22);
	assert.equal(netId.project, 'EXAMPLE');
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
	
	assert.equal(util.inspect(new CBusNetId(`EXAMPLE`, '254', '57', '22')), '//EXAMPLE/254/57/22');
	assert.equal(util.inspect(new CBusNetId(`EXAMPLE`, '254', '57')), '//EXAMPLE/254/57');
	assert.equal(util.inspect(new CBusNetId(`EXAMPLE`, '254')), '//EXAMPLE/254');
	
	assert.end();
});

	
test('constructor alpha', function (assert) {
	assert.plan(4);
	
	const netId = new CBusNetId(`EXAMPLE`, '254', '57', '22');
	assert.equal(netId.project, 'EXAMPLE');
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
	
	const netId = CBusNetId.parse(`//SHAC1/254`);
	assert.equal(netId.project, 'SHAC1');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, undefined);
	assert.equal(netId.group, undefined);
	
	assert.end();
});

test('construct group address netId', function (assert) {
	assert.plan(4);
	
	const netId = CBusNetId.parse(`//SHAC1/254/57/123`);
	assert.equal(netId.project, 'SHAC1');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, 123);
	
	assert.end();
});

test('construct application netId', function (assert) {
	assert.plan(4);
	
	const netId = CBusNetId.parse(`//S31415/254/57`);
	assert.equal(netId.project, 'S31415');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, undefined);
	
	assert.end();
});

test('construct illegal group address', function (assert) {
	assert.plan(1);
	
	assert.throws(function () {
		CBusNetId.parse(`//SHAC/254/57/`);
	});
	
	assert.end();
});

test('construct illegal application address', function (assert) {
	assert.plan(3);
	
	assert.throws(function () {
		// non numerical group
		CBusNetId.parse(`//SHAC/254/57/abc`);
	});
	
	assert.throws(function () {
		// non numerical group
		CBusNetId.parse(`//SHAC/254/57/3.124`);
	});
	
	assert.throws(function () {
		// non numerical group
		CBusNetId.parse(`//SHAC/254a/57/3.124`);
	});
	
	assert.end();
});

test('construct malformed address', function (assert) {
	assert.plan(1);
	
	assert.throws(function () {
		// template mismatch
		CBusNetId.parse(`whoopty doo`);
	});
	
	assert.end();
});

test('construct illegal whitespace', function (assert) {
	assert.plan(2);
	
	assert.throws(function () {
		// trailing space
		CBusNetId.parse(`//SHAC/254/57/ `);
	});
	
	assert.throws(function () {
		// leading space
		CBusNetId.parse(` //SHAC/254/57/`);
	});
	
	assert.end();
});

test('construct illegal project name', function (assert) {
	assert.plan(4);
	
	assert.throws(function () {
		// non numerical group
		CBusNetId.parse(`//S,3AC/254/56`);
	});
	
	assert.throws(function () {
		// first char not alpha
		CBusNetId.parse(`//1SHAC/254/56`);
	});
	
	assert.throws(function () {
		// name too long
		CBusNetId.parse(`//S12345678/254/56`);
	});
	
	assert.throws(function () {
		// name empty
		CBusNetId.parse(`///254/56/191`);
	});
	
	assert.end();
});

test('getModuleId', function (assert) {
	assert.plan(4);
	
	assert.equal(CBusNetId.parse(`//S31415/254`).getModuleId(), `fe0000`);
	assert.equal(CBusNetId.parse(`//S31415/254/208`).getModuleId(), `fed000`);
	assert.equal(CBusNetId.parse(`//S31415/254/208/128`).getModuleId(), `fed080`);
	assert.equal(CBusNetId.parse(`//S31415/254/p/128`).getModuleId(), `1fe0080`);
	
	assert.end();
});

test('CBusNetId equals', function (assert) {
	assert.plan(2);
	
	const netId1 = CBusNetId.parse(`//S31415/254/208/128`);
	const netId2 = CBusNetId.parse(`//S31415/254/208/128`);
	assert.deepEquals(netId1, netId2);
	
	const netId3 = new CBusNetId(`S31415`, 254, 208, 128);
	assert.deepEquals(netId2, netId3);
	
	assert.end();
});

test('CBusNetId not equals', function (assert) {
	assert.plan(2);
	
	const netId1 = CBusNetId.parse(`//BAR/254/208/128`);
	const netId2 = CBusNetId.parse(`//BAR/254/208/1`);
	assert.notDeepEqual(netId1, netId2);
	
	const netId3 = new CBusNetId(`BAR`, 254, 208, 126);
	assert.notDeepEqual(netId2, netId3);
	
	assert.end();
});

test('CBusNetId isNetworkId', function (assert) {
	assert.plan(4);
	
	assert.true(CBusNetId.parse(`//BAR/1`).isNetworkId());
	assert.false(CBusNetId.parse(`//BAR/1/2`).isNetworkId());
	assert.false(CBusNetId.parse(`//BAR/1/2/3`).isNetworkId());
	assert.false(CBusNetId.parse(`//BAR/1/p/3`).isNetworkId());
	
	assert.end();
});

test('CBusNetId isApplicationId', function (assert) {
	assert.plan(4);
	
	assert.false(CBusNetId.parse(`//BAR/1`).isApplicationId());
	assert.true(CBusNetId.parse(`//BAR/1/2`).isApplicationId());
	assert.false(CBusNetId.parse(`//BAR/1/2/3`).isApplicationId());
	assert.false(CBusNetId.parse(`//BAR/1/p/3`).isApplicationId());
	
	assert.end();
});

test('CBusNetId isGroupId', function (assert) {
	assert.plan(4);
	
	assert.false(CBusNetId.parse(`//BAR/1`).isGroupId());
	assert.false(CBusNetId.parse(`//BAR/1/2`).isGroupId());
	assert.true(CBusNetId.parse(`//BAR/1/2/3`).isGroupId());
	assert.false(CBusNetId.parse(`//BAR/1/p/3`).isGroupId());
	
	assert.end();
});


test('CBusNetId isUnitId', function (assert) {
	assert.plan(4);
	
	assert.false(CBusNetId.parse(`//BAR/1`).isUnitId());
	assert.false(CBusNetId.parse(`//BAR/1/2`).isUnitId());
	assert.false(CBusNetId.parse(`//BAR/1/2/3`).isUnitId());
	assert.true(CBusNetId.parse(`//BAR/1/p/3`).isUnitId());
	
	assert.end();
});

test('unit constructor', function (assert) {
	assert.plan(5);
	
	const netId = new CBusNetId(`EXAMPLE`, '254', 'p', '22');
	assert.equal(netId.project, 'EXAMPLE');
	assert.equal(netId.network, 254);
	assert.equal(netId.unitAddress, 22);
	assert.equal(netId.application, undefined);
	assert.equal(netId.group, undefined);
	
	assert.end();
});


test('constructor undefineds', function (assert) {
	assert.plan(4);
	
	assert.throws(function () {
		new CBusNetId(undefined, 254, 57, 22);
	}, `expected exception`, `no project`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, undefined, 57, 22);
	}, `expected exception`, `no network`);
	
	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, 254, undefined, 22);
	}, `expected exception`, `no app/p`);
	
	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, 254, `p`, undefined);
	}, `expected exception`, `no unit`);
	
	assert.end();
});
