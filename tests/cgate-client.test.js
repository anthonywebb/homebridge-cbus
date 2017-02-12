'use strict';

const util = require('util');
const net = require('net');

const carrier = require('carrier');
const test = require('tape').test;
const rewire = require("rewire");
const Console = require('console').Console;

const CGateClient = rewire('../cgate-client.js');
const CBusNetId = require('../cbus-netid.js');

const _parseLine = CGateClient.__get__('_parseLine');
const _rawToPercent = CGateClient.__get__('_rawToPercent');
const _rawToZoneState = CGateClient.__get__('_rawToZoneState');

const CONSOLE_ENABLED = false;

const log = require('debug')('test-output');
log.info = log;


//==========================================================================================
//  Events
//==========================================================================================

//forward declaration
var gClient;

const TEST_DESCRIPTORS = [
	{
		name: `[100] turnOnLight`,
		clientAction: function () {
			gClient.turnOnLight(CBusNetId.parse(`//SHAC/254/56/3`));
		},
		fromClient: `[100] on //SHAC/254/56/3`,
		fromServer: `[100] 200 OK: //SHAC/254/56/3`,
		expected: {
			type: `response`,
			commandId: 100,
			code: 200,
			matched: true,
			processed: true
		}
	},
	{
		name: `[101] turnOffLight`,
		clientAction: function () {
			gClient.turnOffLight(CBusNetId.parse(`//SHAC/254/56/3`));
		},
		fromClient: `[101] off //SHAC/254/56/3`,
		fromServer: `[101] 200 OK: //SHAC/254/56/3`,
		expected: {
			type: `response`,
			commandId: 101,
			code: 200,
			matched: true,
			processed: true
		}
	},
	{
		name: `[102] setLightBrightness`,
		clientAction: function () {
			gClient.setLightBrightness(CBusNetId.parse(`//SHAC/254/56/3`), 50, () => {}, 10);
		},
		fromClient: `[102] ramp //SHAC/254/56/3 50% 10`,
		fromServer: `[102] 200 OK: //SHAC/254/56/3`,
		expected: {
			type: `response`,
			commandId: 102,
			code: 200,
			matched: true,
			processed: true
		}
	},
	{
		name: `[103] receiveLightStatus`,
		clientAction: function () {
			gClient.receiveLightStatus(CBusNetId.parse(`//SHAC/254/56/3`));
		},
		fromClient: `[103] get //SHAC/254/56/3 level`,
		fromServer: `[103] 300 //SHAC/254/56/3: level=128`,
		expected: {
			type: `response`,
			commandId: 103,
			code: 300,
			matched: true,
			processed: true,
			netId: CBusNetId.parse(`//SHAC/254/56/3`),
			level: 50
		}
	},
	{
		name: `parse response: 201`,
		fromServer: `[789] 201 some string we don't expect`,
		expected: {
			type: `response`,
			commandId: 789,
			code: 201,
			matched: false,
			processed: false
		}
	},
	{
		name: `[104] receiveLightStatus`,
		clientAction: function () {
			gClient.receiveLightStatus(CBusNetId.parse(`//SHAC/254/56/3`));
		},
		fromClient: `[104] get //SHAC/254/56/3 level`,
		fromServer: `[104] 300 //SHAC/254/56/3: level=255`,
		expected: {
			type: `response`,
			commandId: 104,
			code: 300,
			matched: true,
			processed: true,
			netId: CBusNetId.parse(`//SHAC/254/56/3`),
			level: 100
		}
	},
	{
		name: `[105] receiveSecurityStatus`,
		clientAction: function () {
			gClient.receiveSecurityStatus(CBusNetId.parse(`//SHAC/254/208/15`), () => { console.log(`received zone status`); } );
		},
		fromClient: `[105] get //SHAC/254/208/15 zonestate`,
		fromServer: `[105] 300 //SHAC/254/208/15: zonestate=1`,
		expected: {
			type: `response`,
			commandId: 105,
			code: 300,
			matched: true,
			processed: true,
			netId: CBusNetId.parse(`//SHAC/254/208/15`),
			zonestate: `unsealed`
		}
	},
	{
		name: `nonsensical message`,
		fromServer: `rooly ill-formed input`,
		expected: `exception`,
		exception: /unrecognised structure/
	},
	{
		name: `event 702 system_arm`,
		fromServer: `#e# 20170204-130934.821 702 //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213`,
		expected: {
			type: `event`,
			time: `20170204-130934.821`,
			code: 702,
			netId: CBusNetId.parse(`//SHAC/254/208`),
			application: `security`,
			remainder: [`system_arm`, '1'],
			sourceUnit: 213,
			processed: true
		}
	},
	{
		name: `badly formed event message`,
		fromServer: `#e# the quick brown fox`,
		expected: `exception`,
		exception: /not in 'timestamp code message' format/
	},
	{
		name: `unexpected status message`,
		fromServer: `#s# 200 status message`,
		expected: `exception`,
		exception: /unrecognised structure/
	},
	{
		name: `unexpected status message 2`,
		fromServer: `lighting on //SHAC/254/56/190  #sourceunit=81 OID=3dfd77e0-c4aa-1034-9f54-fbb6c098d608`,
		expected: `exception`,
		exception: /unrecognised structure/
	},
	{
		name: `event 756`,
		fromServer: `#e# 20170204-160655.767 756 //SHAC/254 3dfc3f60-c4aa-1034-9e98-fbb6c098d608 SyncState=syncing`,
		expected: {
			type: `event`,
			code: 756,
			processed: false
		}
	},
	{
	 	name: `event 730 new level`,
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
	{
	name: `event 702 arm_not_ready`,
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
	{
	 	name: `event 702 zone_unsealed`,
		fromServer: `#e# 20170204-130934.821 702 //BVC13/254/208/3 - [security] zone_unsealed sourceUnit=8`,
		expected: {
			type: `event`,
			netId: CBusNetId.parse(`//BVC13/254/208/3`),
			application: `security`,
			zonestate: `unsealed`,
			sourceUnit: 8,
			processed: true
		}
	},
	{
		name: `event 702 zone_sealed`,
		fromServer: `#e# 20170204-130934.821 702 //BVC13/254/208/3 - [security] zone_sealed sourceUnit=8`,
		expected: {
			type: `event`,
			netId: CBusNetId.parse(`//BVC13/254/208/3`),
			application: `security`,
			zonestate: `sealed`,
			sourceUnit: 8,
			processed: true
		}
	},
	{
		name: `event 702 system_arm`,
		fromServer: `#e# 20170204-130934.821 702 //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213`,
		expected: {
			type: `event`,
			time: `20170204-130934.821`,
			code: 702,
			netId: CBusNetId.parse(`//SHAC/254/208`),
			application: `security`,
			remainder: [`system_arm`, '1'],
			sourceUnit: 213,
			processed: true
		}
	},
	{
		name: `event 700 heartbeat`,
		fromServer: `#e# 20170206-134427.023 700 cgate - Heartbeat.`,
		expected: {
			type: `event`,
			time: `20170206-134427.023`,
			code: 700,
			message: `cgate - Heartbeat.`,
			processed: false
		}
	},
	{
		name: `event 700 no millis`,
		fromServer: `#e# 20170206-134427 700 cgate - Heartbeat.`,
		expected: {
			type: `event`,
			time: `20170206-134427`,
			code: 700,
			message: `cgate - Heartbeat.`,
			processed: false
		}
	},
	{
		name: `event 730 float`,
		fromServer: `#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new foo=6.5020`,
		expected: {
			type: `event`,
			foo: 6.502,
			processed: true
		}
	},
	{
		name: `event 702 missing remainder`,
		fromServer: `#e# 20170204-130934.821 702 //SHAC/254/208/24 - [security]`,
		expected: `exception`,
		exception: /not in 'netid objectId \[applicationName\] remainder' format/
	},
	{
		name: `event 730 bad level`,
		fromServer: `#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new level=abc sourceunit=74 ramptime=10`,
		expected: `exception`,
		exception: /illegal raw type: string/
	},
	{
		name: `event 730 missing new`,
		fromServer: `#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 level=43 sourceunit=74 ramptime=10`,
		expected: `exception`,
		exception: /not in 'new remainder' format/
	},
	{
		name: `event 730 missing sourceunit`,
		fromServer: `#e# 20170204-160545.608 730 //SHAC/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new level=43 sourceunit= ramptime=10`,
		expected: `exception`,
		exception: /bad key=value: 'sourceunit'/
	},
	{
		name: `parse response: 200`,
		fromServer: `[123] 200 OK: //SHAC/254/56/3`,
		expected: {
			type: `response`,
			commandId: 123,
			code: 200,
			matched: false,
			processed: true
		}
	},
	{
	name: `parse response: 300`,
	fromServer: `[456] 300 //SHAC/254/56/3: level=129`,
		expected: {
			type: `response`,
			commandId: 456,
			code: 300,
			netId: CBusNetId.parse(`//SHAC/254/56/3`),
			level: 51,	// 129 raw = 51%
			matched: false,
			processed: true
		}
	},
	{
		name: `parse response: bad level 1`,
		fromServer: `[456] 300 //SHAC/254/56/3: level=abc`,
		expected: `exception`,
		exception: /not in '\(level|zonestate\)=xxx' format/
	},
	{
		name: `parse response: bad level 2`,
		fromServer: `[456] 300 //SHAC/254/56/3: level=-1`,
		expected: `exception`,
		exception: /not in '\(level|zonestate\)=xxx' format/
	},
	{
		name: `parse response: bad level 3`,
		fromServer: `[456] 300 //SHAC/254/56/3: level=1000`,
		expected: `exception`,
		exception: /not in '\(level|zonestate\)=xxx' format/
	},
	{
		name: `parse response: bad level 4`,
		fromServer: `[456] 300 //SHAC/254/56/3: level=300`,
		expected: `exception`,
		exception: /illegal raw level: 300/
	},
	{
		name: `parse response: 201`,
		fromServer: `[789] 201 some string we don't expect`,
		expected: {
			type: `response`,
			commandId: 789,
			code: 201,
			matched: false,
			processed: false
		}
	}
];

function _validateMessageAgainstExpected(message, expected, name) {
	console.assert(typeof expected == `object`);
	
	log.info(`====> scheduling test for '${name}'`);
	test(name, assert => {
		assert.plan(expected.length);
		Object.keys(expected).forEach(key => {
			const actualProperty = message[key];
			const expectedProperty = expected[key];
			assert.deepEquals(actualProperty, expectedProperty, `validate message key '${key}'`);
		});
		assert.end();
	});
}

/*
function _testCalleeThrowsAsExpected(callee, line, exception, name) {
	console.assert(typeof callee == `function`);
	console.assert(typeof line == `string`);
	console.assert(exception instanceof RegExp);
	console.assert(typeof name == `string`);
	
	log.info(`====> scheduling test for '${name}'`);
	
	test(name, assert => {
		assert.plan(1);
		assert.throws(function () {
				callee(line);
			},
			exception,
			name);
		assert.end();
	});
}*/

/*
function _testDescriptor(descriptor, callee) {
	console.assert(typeof descriptor == `object`);
	console.assert(typeof callee == `function`);
	
	if (descriptor.expected == `exception`) {
		_testCalleeThrowsAsExpected(
			callee,
			descriptor.fromServer,
			descriptor.exception,
			descriptor.name);
	} else {
		const message = callee(descriptor.fromServer);
		_validateMessageAgainstExpected(
			message,
			descriptor.expected,
			descriptor.name);
	}
}

function _executeTests() {
	TEST_DESCRIPTORS.forEach(descriptor => {
		// skip the entries that are marked as matched
		if (!descriptor.expected.matched === true) {
			_testDescriptor(descriptor, _parseLine);
		}
	});
}

// run all of the above tests
// _executeTests();
*/

//==========================================================================================
//  spin up a mock cgate server and have a chat
//==========================================================================================

test('server premature disconnect', function (assert) {
	assert.plan(1);
	
	// create a server object
	const port = 4001;
	const NETID = CBusNetId.parse(`//SHAC/254/56/3`);

	// let's not use the global gClient here
	const client = new CGateClient(`127.0.0.1`, port, `SHAC`, NETID.network, NETID.application, log, true);
	
	// try to close it before it's even been opened
	assert.throws(function () {
		client.disconnect();
	});
	
	assert.end();
});
	
test('server responses', function (assert) {
	// three possible paths described by a descriptor
	// - clientAction -> fromClient -> fromServer -> expected
	// - fromClient -> fromServer -> expected
	// - fromServer -> expected
	
	const port = 4001;
	let descriptorIndex = 0;
	
	const NETID = CBusNetId.parse(`//SHAC/254/56/3`);
	
	gClient = new CGateClient(`127.0.0.1`, port, `SHAC`, 254, 56, log, true);
	
	const EVENTS_REQUEST = `[99] events e7s0c0`;
	const EVENTS_RESPONSE = `[99] 200 OK.`;
	
	// const TEST_DESCRIPTORS = [
	//
	// ];
	
	// this harness will directly run a test for every instance of the following test properties:
	// - forClient (ensuring that forClient matched expected)
	// - exception (ensuring that junk recevied by client was caught and matches the regex)
	let testCount = 0;
	TEST_DESCRIPTORS.forEach(descriptor => {
		if (descriptor.fromClient) {
			testCount++;
		}
		
		if (descriptor.exception) {
			testCount++;
		}
	});
	assert.plan(testCount);
	
	var serverConnection;
	
	// spin up a fake g-gate server
	const server = net.createServer(function(connection) {
		serverConnection = connection;
		log.info('server connect');
		connection.write(`201 Service ready: Clipsal C-Gate Version: v4.5.6 (build 789) #cmd-syntax=2.2\r\n`);
		
		carrier.carry(connection, (req) => {
			if (req == EVENTS_REQUEST) {
				log.info(`settings up CGate events`);
				connection.write(`${EVENTS_RESPONSE}\n`);
			} else {
				const testDescriptor = TEST_DESCRIPTORS[descriptorIndex];
				const exp = testDescriptor.fromClient;
				const res = testDescriptor.fromServer;
				console.assert(res, `every fromClient must be matched with a fromServer`);
				
				if (testDescriptor.fromClient == testDescriptor.fromClient) {
					log.info(`server rx: '${req}', tx: '${res}'`);
				} else {
					log.info(`req: '${req}'`);
					log.info(`exp: '${exp}'`);
				}
				
				// check request is what we expected
				assert.equal(req, exp, `ensuring fromClient meets expectation`);
				
				// send response
				connection.write(`${res}\n`);
			}
		});
	});
	server.listen(port);
	
	const next = function() {
		if (descriptorIndex < TEST_DESCRIPTORS.length) {
			const descriptor = TEST_DESCRIPTORS[descriptorIndex];
			const action = descriptor.clientAction;
			log.info(`\n\n`);
			log.info(`step ${descriptorIndex}: testing '${descriptor.name}'`);
			
			// execute an action if there is one
			if (action) {
				log.info(`client sending action`);
				action();
			} else {
				// if no action, then must be unsolicited
				log.info(`server sending unsolicited '${descriptor.fromServer}'`);
				serverConnection.write(`${descriptor.fromServer}\n`);
			}
		} else {
			log.info(`end; disconnecting client`);
			gClient.disconnect();
			assert.end();
		}
	};
	
	function validate(message) {
		const descriptor = TEST_DESCRIPTORS[descriptorIndex];
		const testName = `response for '${descriptor.name}'`;
		_validateMessageAgainstExpected(message, descriptor.expected, testName);
	}
	
	// listen for data from the client -- not yet used
	gClient.on('event', message => {
		log.info(`received 'event' (index ${descriptorIndex})`);
		validate(message);
		descriptorIndex++;
		next();
	});
	
	gClient.on(`response`, message => {
		log.info(`received 'response' (index ${descriptorIndex})`);
		validate(message);
		descriptorIndex++;
		next();
	});
	
	gClient.on('junk', (ex, line) => {
		log.info(`junk received '${line}', ex '${ex}' (index ${descriptorIndex})`);
		const descriptor = TEST_DESCRIPTORS[descriptorIndex];
		const exceptionRegex = descriptor.exception;
		console.assert(exceptionRegex instanceof RegExp);
		assert.throws(function () {
				throw ex;
			},
			exceptionRegex,
			`junk generated when testing '${descriptor.name}' must match expected exception regex`);
		descriptorIndex++;
		next();
	});
	
	gClient.connect(function() {
		next();
	});

	assert.on("end", function() {
		log.info(`end; closing server`);
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
		_rawToPercent(`129`);
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

// valid values for zonestate:
// 0 = sealed
// 1 = unsealed
// 2 = open
// 3 = short
// -1 = unknown
test('_rawToZoneState', function (assert) {
	// values from help document 'C-Bus to percent level lookup table'
	assert.plan(7);
	
	assert.equal(_rawToZoneState(0), `sealed`);
	assert.equal(_rawToZoneState(1), `unsealed`);
	assert.equal(_rawToZoneState(2), `open`);
	assert.equal(_rawToZoneState(3), `short`);
	assert.equal(_rawToZoneState(-1), `unknown`);
	
	assert.throws(function () {
		_rawToZoneState(200);
	});
	
	assert.throws(function () {
		_rawToZoneState(`abc`);
	});
	
	assert.end();
});
