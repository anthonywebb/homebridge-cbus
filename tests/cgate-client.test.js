'use strict';

const util = require('util');
const net = require('net');

const carrier = require('carrier');
const test = require('tape').test;
const rewire = require("rewire");

const CGateClient = rewire('../cgate-client.js');
const CBusNetId = require('../cbus-netid.js');

const _parseLine = CGateClient.__get__('_parseLine');
const _rawToPercent = CGateClient.__get__('_rawToPercent');

//==========================================================================================
//  Illegal Lines
//==========================================================================================

test('_parseLine: bad fromClient', function (assert) {
	assert.plan(4);
	
	assert.throws(function () {
		_parseLine(`rooly ill-formed input`);
	});
	
	assert.throws(function () {
		_parseLine(`#e# the quick brown fox`);
	});
	
	assert.throws(function () {
		_parseLine(`#s# 200 status message`);
	});
	
	assert.throws(function () {
		_parseLine(`lighting on //SHAC/254/56/190  #sourceunit=81 OID=3dfd77e0-c4aa-1034-9f54-fbb6c098d608`);
	});
	
	assert.end();
});


//==========================================================================================
//  Events
//==========================================================================================

const TEST_EVENTS = {
	event756: {
		fromServer: `#e# 20170204-160655.767 756 //SHAC/254 3dfc3f60-c4aa-1034-9e98-fbb6c098d608 SyncState=syncing`,
		expected: {
			type: `event`,
			code: 756,
			processed: false
		}
	},
	
	event730newLevel: {
		fromServer: `#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new level=43 sourceunit=74 ramptime=10`,
		expected: {
			type: `event`,
			code: 730,
			netId: CBusNetId.parse(`//SHAC/254/56/116`),
			level: 17,
			sourceunit: 74,
			ramptime: 10,
			processed: true
		}
	},
	
	event702arm_not_ready: {
		fromServer: `#e# 20170204-130934.821 702 //SHAC/254/208/24 - [security] arm_not_ready sourceUnit=213`,
		expected: {
			type: `event`,
			time: `20170204-130934.821`,
			code: 702,
			netId: CBusNetId.parse(`//SHAC/254/208/24`),
			application: `security`,
			remainder: [`arm_not_ready`],
			sourceUnit: 213,
			processed: true
		}
	},
	
	event702zone_unsealed: {
		fromServer: `#e# 20170204-130934.821 702 //BVC13/254/208/3 - [security] zone_unsealed sourceUnit=8`,
		expected: {
			type: `event`,
			netId: CBusNetId.parse(`//BVC13/254/208/3`),
			application: `security`,
			level: 100,		// speacial meaning for unsealed
			sourceUnit: 8,
			processed: true
		}
	},
	
	event702zone_sealed: {
		fromServer: `#e# 20170204-130934.821 702 //BVC13/254/208/3 - [security] zone_sealed sourceUnit=8`,
		expected: {
			type: `event`,
			netId: CBusNetId.parse(`//BVC13/254/208/3`),
			application: `security`,
			level: 0,		// speacial meaning for sealed
			sourceUnit: 8,
			processed: true
		}
	},
	
	event702system_arm: {
		fromServer: `#e# 20170204-130934.821 702 //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213`,
		expected: {
			time: `20170204-130934.821`,
			code: 702,
			netId: CBusNetId.parse(`//SHAC/254/208`),
			application: `security`,
			remainder: [`system_arm`, '1'],
			sourceUnit: 213,
			processed: true
		}
	},
	
	event700heartbeat: {
		fromServer: `#e# 20170206-134427.023 700 cgate - Heartbeat.`,
		expected: {
			time: `20170206-134427.023`,
			code: 700,
			message: `cgate - Heartbeat.`,
			processed: false
		}
	},
	
	event700nomillis: {
		fromServer: `#e# 20170206-134427 700 cgate - Heartbeat.`,
		expected: {
			time: `20170206-134427`,
			code: 700,
			message: `cgate - Heartbeat.`,
			processed: false
		}
	},
	
	event730float: {
		fromServer: `#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new foo=6.5020`,
		expected: {
			type: `event`,
			foo: 6.502,
			processed: true
		}
	}
};

function _testMessagesContains(assert, message, expected) {
	Object.keys(expected).forEach(function(key) {
		const actualProperty = message[key];
		const expectedProperty = expected[key];
		console.log(`testing '${actualProperty}' vs '${expectedProperty}'`);
		assert.deepEquals(actualProperty, expectedProperty);
	});
}

function _testEvent(assert, label) {
	const testEvent = TEST_EVENTS[label];
	console.assert(typeof testEvent != `undefined`);
	
	assert.plan(testEvent.expected.length);
	let event = _parseLine(testEvent.fromServer);
	_testMessagesContains(assert, event, testEvent.expected);
	
	assert.end();
}

test('parse event: network message', assert => {
	_testEvent(assert, 'event756');
});

test('parse event: new level', assert => {
	_testEvent(assert, 'event730newLevel');
});

test('parse event: security group arm_not_ready', assert => {
	_testEvent(assert, 'event702arm_not_ready');
});

test('parse event: security zone_unsealed', assert => {
	_testEvent(assert, 'event702zone_unsealed');
});

test('parse event: security zone_sealed special handing', assert => {
	_testEvent(assert, 'event702zone_sealed');
});

test('parse event: security application system_arm', assert => {
	_testEvent(assert, 'event702system_arm');
});

test('parse event: heartbeat, not processed', assert => {
	_testEvent(assert, 'event700heartbeat');
});

test('parse event: no milliseconds', assert => {
	_testEvent(assert, 'event700nomillis');
});

test('parse response: value is float', assert => {
	_testEvent(assert, 'event730float');
});

test('parse event: bad new level', function (assert) {
	assert.plan(3);
	
	assert.throws(function () {
		_parseLine(`#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new level=abc sourceunit=74 ramptime=10`);
	});
	
	assert.throws(function () {
		_parseLine(`#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 level=43 sourceunit=74 ramptime=10`);
	});
	
	assert.throws(function () {
		_parseLine(`#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new level=43 sourceunit= ramptime=10`);
	});
	
	assert.end();
});

test('parse event: application message missing remainder', function (assert) {
	assert.plan(1);
	
	assert.throws(function () {
		_parseLine(`#e# 20170204-130934.821 702 //SHAC/254/208/24 - [security]`);
	});
	
	assert.end();
});


//==========================================================================================
//  Response
//==========================================================================================

test('parse response: 200', function (assert) {
	assert.plan(4);

	let response = _parseLine(`[123] 200 OK: //SHAC/254/56/3`);
	assert.equal(response.type, `response`);
	assert.equal(response.commandId, 123);
	assert.equal(response.code, 200);
	assert.true(response.processed);
	
	assert.end();
});

test('parse response: 300', function (assert) {
	assert.plan(6);
	
	let response = _parseLine(`[456] 300 //SHAC/254/56/3: level=129`);
	assert.equal(response.type, `response`);
	assert.equal(response.commandId, 456);
	assert.equal(response.code, 300);
	assert.equal(response.netId.toString(), `//SHAC/254/56/3`);
	assert.equal(response.level, 51);	// 129 raw = 51%
	assert.true(response.processed);
	
	assert.end();
});

test('parse response: bad level', function (assert) {
	assert.plan(4);
	
	assert.throws(function () {
		_parseLine(`[456] 300 //SHAC/254/56/3: level=abc`);
	});
	
	assert.throws(function () {
		_parseLine(`[456] 300 //SHAC/254/56/3: level=-1`);
	});
	
	assert.throws(function () {
		_parseLine(`[456] 300 //SHAC/254/56/3: level=1000`);
	});
	
	assert.throws(function () {
		_parseLine(`[456] 300 //SHAC/254/56/3: level=300`);
	});
	
	assert.end();
});

test('parse response: 201', function (assert) {
	assert.plan(4);
	
	let response = _parseLine(`[789] 201 some string we don't expect`);
	assert.equal(response.type, `response`);
	assert.equal(response.commandId, 789);
	assert.equal(response.code, 201);
	assert.false(response.processed);
	
	assert.end();
});

//==========================================================================================
//  spin up a server and have a chat
//==========================================================================================

test('server premature disconnect', function (assert) {
	assert.plan(1);
	
	// create a server object
	const port = 4001;
	const NETID = CBusNetId.parse(`//SHAC/254/56/3`);
	const log = {
		info: msg => { /* console.log(msg) */ }
	};
	const client = new CGateClient(`127.0.0.1`, port, `SHAC`, NETID.network, NETID.application, log, true);
	
	// try to close it before it's even been opened
	assert.throws(function () {
		client.disconnect();
	});
	
	assert.end();
});
	
test('server responses', function (assert) {
	const port = 4001;
	let lineCount = 0;
	
	const log = {
		info: msg => console.log(msg)
	};
	const NETID = CBusNetId.parse(`//SHAC/254/56/3`);
	const client = new CGateClient(`127.0.0.1`, port, `SHAC`, NETID.network, NETID.application, log, true);

	let next;
	
	const EXCHANGES = [
		{
			fromClient: `[99] events e7s0c0`,
			fromServer: `[99] 200 OK.`
		},
		{
			action: function () {
				client.turnOnLight(NETID, next);
			},
			fromClient: `[100] on //SHAC/254/56/3`,
			fromServer: `[100] 200 OK: //SHAC/254/56/3`
		},
		{
			action: function () {
				client.turnOffLight(NETID, next);
			},
			fromClient: `[101] off //SHAC/254/56/3`,
			fromServer: `[101] 200 OK: //SHAC/254/56/3`
		},
		{
			action: function () {
				client.setLightBrightness(NETID, 50, next);
			},
			fromClient: `[102] ramp //SHAC/254/56/3 50%`,
			fromServer: `[102] 200 OK: //SHAC/254/56/3`
		},
		{
			action: function () {
				client.receiveLightStatus(NETID, next);
			},
			fromClient: `[103] get //SHAC/254/56/3 level`,
			fromServer: `[103] 300 //SHAC/254/56/3: level=128`
		}
	];
	
	assert.plan(EXCHANGES.length);
	
	// spin up a fake g-gate server
	const server = net.createServer(function(connection) {
		log.info('server connect');
		connection.write(`201 Service ready: Clipsal C-Gate Version: v4.5.6 (build 789) #cmd-syntax=2.2\r\n`);
		
		carrier.carry(connection, (line) => {
			const exchange = EXCHANGES[lineCount++];
			
			// check request
			log.info(`req: '${line}'`);
			log.info(`exp: '${exchange.fromClient}'`);
			assert.equal(line, exchange.fromClient);
			
			// send response
			log.info(`res: '${exchange.fromServer}'`);
			connection.write(`${exchange.fromServer}\n`);
		});
	});
	server.listen(port);
	
	// listen for data from the client -- not yet used
	client.on('remoteData', function(message) {
		// must have a netId
		console.assert(message.netId);
		log.info(util.inspect(message));
	});
	
	client.connect(function() {
		// at this point we have completed the first exchange ('events e7s0c0')

		next = function() {
			// console.log(`step ${lineCount}`);
			
			if (lineCount !== EXCHANGES.length) {
				let action = EXCHANGES[lineCount].action;
				console.assert(action);
				action();
			} else {
				client.disconnect();
			}
		};
		next();
	});

	assert.on("end", function() {
		log.info(`end`);
		server.close();
	});
});


//==========================================================================================
//  utils
//==========================================================================================

test('_rawToPercent bounds', function (assert) {
	assert.plan(2);
	
	assert.throws(function () {
		_rawToPercent(-1);
	});
	
	assert.throws(function () {
		_rawToPercent(256);
	});
	
	assert.end();
});

test('_rawToPercent bad type', function (assert) {
	assert.plan(1);
	
	assert.throws(function () {
		_rawToPercent("129");
	});
	
	assert.end();
});

test('_rawToPercent table', function (assert) {
	// values from help document 'C-Bus to percent level lookup table'
	assert.plan(16);
	
	assert.equal(_rawToPercent(0), 0);
	assert.equal(_rawToPercent(1), 1);
	assert.equal(_rawToPercent(2), 1);
	assert.equal(_rawToPercent(3), 1);
	assert.equal(_rawToPercent(4), 2);
	assert.equal(_rawToPercent(5), 2);
	assert.equal(_rawToPercent(6), 3);
	
	assert.equal(_rawToPercent(43), 17);
	assert.equal(_rawToPercent(44), 18);
	assert.equal(_rawToPercent(128), 50);
	assert.equal(_rawToPercent(129), 51);
	
	assert.equal(_rawToPercent(250), 98);
	assert.equal(_rawToPercent(251), 99);
	assert.equal(_rawToPercent(252), 99);
	assert.equal(_rawToPercent(253), 100);
	assert.equal(_rawToPercent(255), 100);
	
	assert.end();
});
