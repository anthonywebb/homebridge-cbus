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

test('construct project address', function (assert) {
	assert.plan(5);

	const netId = CBusNetId.parse(`//GOO`);
	assert.equal(netId.project, 'GOO');
	assert.equal(netId.network, undefined);
	assert.equal(netId.application, undefined);
	assert.equal(netId.group, undefined);
	assert.equal(netId.toString(), `//GOO`);

	assert.end();
});

test('construct network address', function (assert) {
	assert.plan(6);

	const netId = CBusNetId.parse(`//SHAC1/254`);
	assert.equal(netId.project, 'SHAC1');
	assert.equal(netId.network, 254);
	assert.equal(netId.application, undefined);
	assert.equal(netId.group, undefined);
	assert.equal(netId.toString(), `//SHAC1/254`);
	assert.getHash(netId, 0xff0000)

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

test('construct legal project name', function (assert) {
  assert.plan(1);

  const addresses = [
    '//HELLO/254/56/3',
    '//3PROJECT/128/56/5',
    '//_PROJECT/254/56/6',
    '//MY_CBUS/254/56/1',
    '//7_LIGHT/254/54/56'
  ];

  var netIDs = addresses.map(function (s){
    const netId = CBusNetId.parse(s);
    return(netId.project);
  });

  var result = [
    'HELLO',
		'3PROJECT',
		'_PROJECT',
		'MY_CBUS',
    '7_LIGHT'
	]

	assert.deepEqual(netIDs, result);

  assert.end();
});

test('construct illegal project name', function (assert) {
	assert.plan(12);

	assert.throws(function () {
		// non numerical group
		CBusNetId.parse(`//S,3AC/254/56`);
	});

	assert.throws(function () {
		// name too long
		CBusNetId.parse(`//S12345678/254/56`);
	});

  assert.throws(function () {
    // cannot contain lowercase
    CBusNetId.parse(`//project/254/56`);
  });

  assert.throws(function () {
    // cannot contain dash
    CBusNetId.parse(`//MY-CBUS/254/56`);
  });

	assert.throws(function () {
		// name empty
		CBusNetId.parse(`///254/56/191`);
	});

	assert.throws(function () {
		// reserved name
		CBusNetId.parse(`//P/254/56/34`);
	});

	assert.throws(function () {
		// reserved name
		CBusNetId.parse(`//CBUS/254/56/34`);
	});
	
	assert.throws(function () {
		// reserved name
		CBusNetId.parse(`//VM/254/56/34`);
	});

	assert.throws(function () {
		// reserved name
		CBusNetId.parse(`//CMDINT/254/56/34`);
	});

	assert.throws(function () {
		// reserved name
		CBusNetId.parse(`//CGATE/254/56/34`);
	});
	
	assert.throws(function () {
		// reserved name
		CBusNetId.parse(`//TAG/254/56/34`);
	});

	assert.throws(function () {
		// reserved name
		CBusNetId.parse(`//CMD` + (Math.floor((Math.random() * 100) + 1)) + `/254/56/34`);
	});

	assert.end();
});

test('getHash', function (assert) {
	assert.plan(5);

	assert.equal(CBusNetId.parse(`//S31415`).getHash(), `S31415`);
	assert.equal(CBusNetId.parse(`//S31415/254`).getHash(), `1fe0000`);
	assert.equal(CBusNetId.parse(`//S31415/254/208`).getHash(), `1fed000`);
	assert.equal(CBusNetId.parse(`//S31415/254/208/128`).getHash(), `1fed080`);
	assert.equal(CBusNetId.parse(`//S31415/254/p/128`).getHash(), `2fe0080`);

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

test('CBusNetId isProjectId', function (assert) {
	assert.plan(5);

	assert.true(CBusNetId.parse(`//BAR`).isProjectId());
	assert.false(CBusNetId.parse(`//BAR/1`).isProjectId());
	assert.false(CBusNetId.parse(`//BAR/1/2`).isProjectId());
	assert.false(CBusNetId.parse(`//BAR/1/2/3`).isProjectId());
	assert.false(CBusNetId.parse(`//BAR/1/p/3`).isProjectId());


	assert.end();
});

test('CBusNetId isNetworkId', function (assert) {
	assert.plan(4);

	assert.false(CBusNetId.parse(`//BAR`).isNetworkId());
	assert.true(CBusNetId.parse(`//BAR/1`).isNetworkId());
	assert.false(CBusNetId.parse(`//BAR/1/2`).isNetworkId());
	assert.false(CBusNetId.parse(`//BAR/1/2/3`).isNetworkId());
	assert.false(CBusNetId.parse(`//BAR/1/p/3`).isNetworkId());

	assert.end();
});

test('CBusNetId isApplicationId', function (assert) {
	assert.plan(4);

	assert.false(CBusNetId.parse(`//BAR`).isApplicationId());
	assert.false(CBusNetId.parse(`//BAR/1`).isApplicationId());
	assert.true(CBusNetId.parse(`//BAR/1/2`).isApplicationId());
	assert.false(CBusNetId.parse(`//BAR/1/2/3`).isApplicationId());
	assert.false(CBusNetId.parse(`//BAR/1/p/3`).isApplicationId());

	assert.end();
});

test('CBusNetId isGroupId', function (assert) {
	assert.plan(4);

	assert.false(CBusNetId.parse(`//BAR`).isGroupId());
	assert.false(CBusNetId.parse(`//BAR/1`).isGroupId());
	assert.false(CBusNetId.parse(`//BAR/1/2`).isGroupId());
	assert.true(CBusNetId.parse(`//BAR/1/2/3`).isGroupId());
	assert.false(CBusNetId.parse(`//BAR/1/p/3`).isGroupId());

	assert.end();
});

test('CBusNetId isUnitId', function (assert) {
	assert.plan(4);

	assert.false(CBusNetId.parse(`//BAR`).isUnitId());
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
	assert.plan(6);

	assert.throws(function () {
		new CBusNetId(undefined, 254, 57, 22);
	}, /netIds must have a project/, `no project`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, undefined, 57);
	}, /netIds with group must have a network/, `application no network`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, undefined, 57, 22);
	}, /netIds with group must have a network/, `group no network`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, undefined, `p`, 22);
	}, /netIds with group must have a network/, `unit no network`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, 254, undefined, 22);
	}, /group netIds must have an application/, `no app/p`);

	assert.throws(function () {
		new CBusNetId(`EXAMPLE`, 254, `p`, undefined);
	}, /unit netIds must have a unitAddress/, `no unit`);

	assert.end();
});


test('custom comparison function', function (assert) {
	assert.plan(2);

	const obj1 = {
		'//PROJECT/254/56/3': 15,
		'//PROJECT/128/56/5': 14,
		'//PROJECT/254/56/6': 13,
		'//PROJECT/254/56/1': 12,
		'//PROJECT/254/56/4': 11,
		'//PROJECT/254/56/2': 10,
		'//PROJECT/254/p/7': 9,
		'//PROJECT/254/p/5': 8,
		'//PROJECT/254/p/22': 7,
		'//PROJECT/17/p/21': 6,
		'//PROJECT/254/56': 5,
		'//ZZZ/254/54/56': 4,
		'//AAA/254/99': 3,
		'//AAA/254/56': 2,
		'//MMM/254/54/56': 1
	};

	const obj2 = {
		'fire truck': 6,
		'carrot': 3,
		'durian': 4,
		'apple': 1,
		'banana': 2,
		'eggplant': 5
	};

	let compare = function (a, b) {
		if (a.key.startsWith(`//`) && b.key.startsWith(`//`)) {
			const aId = CBusNetId.parse(a.key);
			const bId = CBusNetId.parse(b.key);

			return CBusNetId.compare(aId, bId);
		}

		return a.key < b.key ? -1 : 1;
	};

	let stringified = stringify(obj1, { cmp: compare, space: ` ` });
	assert.equal(stringified, `` +
		`{\n` +
		` "//AAA/254/56": 2,\n` +
		` "//AAA/254/99": 3,\n` +
		` "//MMM/254/54/56": 1,\n` +
		` "//PROJECT/128/56/5": 14,\n` +
		` "//PROJECT/254/56": 5,\n` +
		` "//PROJECT/254/56/1": 12,\n` +
		` "//PROJECT/254/56/2": 10,\n` +
		` "//PROJECT/254/56/3": 15,\n` +
		` "//PROJECT/254/56/4": 11,\n` +
		` "//PROJECT/254/56/6": 13,\n` +
		` "//PROJECT/17/p/21": 6,\n` +
		` "//PROJECT/254/p/5": 8,\n` +
		` "//PROJECT/254/p/7": 9,\n` +
		` "//PROJECT/254/p/22": 7,\n` +
		` "//ZZZ/254/54/56": 4\n` +
		`}`);

	stringified = stringify(obj2, { cmp: compare, space: ` ` });
	assert.equal(stringified, `` +
		`{\n` +
		` "apple": 1,\n` +
		` "banana": 2,\n` +
		` "carrot": 3,\n` +
		` "durian": 4,\n` +
		` "eggplant": 5,\n` +
		` "fire truck": 6\n` +
		`}`);

	assert.end();
});