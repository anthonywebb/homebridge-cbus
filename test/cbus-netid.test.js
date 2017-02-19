'use strict';

const util = require('util');

const test = require('tape').test;
const stringify = require('json-stable-stringify');

const CBusNetId = require('../lib/cbus-netid.js');

test('constructor numerical', function (assert) {
	assert.plan(4);

	const netId = new CBusNetId(`EXAMPLE`, 254, 57, 22);
	assert.equal(netId.project, 'EXAMPLE');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, 22);

	assert.end();
});


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

test('construct network address', function (assert) {
	assert.plan(5);

	const netId = CBusNetId.parse(`//SHAC1/254`);
	assert.equal(netId.project, 'SHAC1');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, undefined);
	assert.equal(netId.group, undefined);
	assert.equal(netId.toString(), `//SHAC1/254`)

	assert.end();
});

test('construct application netId', function (assert) {
	assert.plan(5);

	const netId = CBusNetId.parse(`//S31415/254/57`);
	assert.equal(netId.project, 'S31415');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, undefined);
	assert.equal(netId.toString(), `//S31415/254/57`);

	assert.end();
});

test('construct group address', function (assert) {
	assert.plan(5);

	const netId = CBusNetId.parse(`//SHAC1/254/57/123`);
	assert.equal(netId.project, 'SHAC1');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, 57);
	assert.equal(netId.group, 123);
	assert.equal(netId.toString(), `//SHAC1/254/57/123`);

	assert.end();
});

test('construct unit address', function (assert) {
	assert.plan(6);

	const netId = CBusNetId.parse(`//SHAC1/254/p/34`);
	assert.equal(netId.project, 'SHAC1');
	assert.equal(netId.network, 254);
	assert.equal(netId.unitAddress, 34);
	assert.equal(netId.application, undefined);
	assert.equal(netId.group, undefined);
	assert.equal(netId.toString(), `//SHAC1/254/p/34`);

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

	assert.equal(CBusNetId.parse(`//S31415/254`).getHash(), `fe0000`);
	assert.equal(CBusNetId.parse(`//S31415/254/208`).getHash(), `fed000`);
	assert.equal(CBusNetId.parse(`//S31415/254/208/128`).getHash(), `fed080`);
	assert.equal(CBusNetId.parse(`//S31415/254/p/128`).getHash(), `1fe0080`);

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
	}, /netIds must have a project/, `no project`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, undefined, 57, 22);
	}, /netIds must have a network/, `no network`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, 254, undefined, 22);
	}, /group netIds must have an application/, `no app/p`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, 254, `p`, undefined);
	}, /unit netIds must have a unitAddress/, `no unit`);

	assert.end();
});

test('custom comparison function', function (assert) {
	assert.plan(1);

	const obj = {
		"//PROJECT/254/56/3": 6,
		"//PROJECT/128/56/5": 5,
		"//PROJECT/254/56/6": 4,
		"//PROJECT/254/56/1": 3,
		"//PROJECT/254/56/4": 2,
		"//PROJECT/254/56/2": 1,
		"//PROJECT/254/p/7": 1,
		"//PROJECT/254/p/5": 1,
		"//PROJECT/254/p/22": 1,
		"//PROJECT/17/p/21": 1,
		"//PROJECT/254/56": 1,
		"//ZZZ/254/54/56": 1,
		"//AAA/254/56": 1,
		"//MMM/254/54/56": 1};

	let compare = function (a, b) {
		if (a.key.startsWith(`//`) && b.key.startsWith(`//`)) {
			const aId = CBusNetId.parse(a.key);
			const bId = CBusNetId.parse(b.key);

			if (aId.project !== bId.project) {
				return aId.project < bId.project ? -1 : 1;
			}

			if (aId.network !== bId.network) {
				return aId.network < bId.network ? -1 : 1;
			}

			let aApp = (typeof aId.application === `undefined`) ? 256 : aId.application;
			let bApp = (typeof bId.application === `undefined`) ? 256 : bId.application;

			if (aApp !== bApp) {
				return aApp < bApp ? -1 : 1;
			}


			let aGroup = (typeof aId.group === `undefined`) ? aId.unitAddress : aId.group;
			let bGroup = (typeof bId.group === `undefined`) ? bId.unitAddress : bId.group;

			if (aGroup !== bGroup) {
				return aGroup < bGroup ? -1 : 1;
			}
		}

		return a.key < b.key ? -1 : 1;
	};

	const s = stringify(obj, { cmp: compare, space: ` ` });
	console.log(s);
	assert.equal(s, '{"c":8,"b":[{"z":6,"y":5,"x":4},7],"a":3}');
});