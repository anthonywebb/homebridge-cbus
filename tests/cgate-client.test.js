'use strict';

const util = require('util');
const net = require('net');
const fs = require('fs');

const carrier = require('carrier');
const test = require('tape').test;
const rewire = require("rewire");
const Console = require('console').Console;

const CGateClient = rewire('../cgate-client.js');
const CGateDatabase = require(`../cgate-database.js`);
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

// globals required for patching into TEST_DESCRIPTORS
let gClient, gDatabase;

const SERVER_PORT = 4001;

// three possible paths described by a descriptor
// - clientAction -> fromClient -> fromServer -> expected
// - fromClient -> fromServer -> expected
// - fromServer -> expected

const TEST_DESCRIPTORS = [
	{
		name: `event that had asserted`,
		fromServer: `#e# 20170213-083355.401 730 //EXAMPLE/254/56/72 3df847c0-c4aa-1034-9edf-fbb6c098d608 new level=255 sourceunit=12 ramptime=0 sessionId=cmd987 commandId=106`,
		expected: {
			type: `event`,
			code: 730,
			level: 100,
			sourceunit: 12,
			ramptime: 0,
			sessionId: `cmd987`,
			commandId: 106,
			processed: true
		}
	},
	{
		name: `[100] turnOnLight`,
		clientAction: function () {
			gClient.turnOnLight(CBusNetId.parse(`//EXAMPLE/254/56/3`));
		},
		fromClient: `[100] on //EXAMPLE/254/56/3`,
		fromServer: `[100] 200 OK: //EXAMPLE/254/56/3`,
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
			gClient.turnOffLight(CBusNetId.parse(`//EXAMPLE/254/56/3`));
		},
		fromClient: `[101] off //EXAMPLE/254/56/3`,
		fromServer: `[101] 200 OK: //EXAMPLE/254/56/3`,
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
			gClient.setLightBrightness(CBusNetId.parse(`//EXAMPLE/254/56/3`), 50, () => {}, 10);
		},
		fromClient: `[102] ramp //EXAMPLE/254/56/3 50% 10`,
		fromServer: `[102] 200 OK: //EXAMPLE/254/56/3`,
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
			gClient.receiveLightStatus(CBusNetId.parse(`//EXAMPLE/254/56/3`));
		},
		fromClient: `[103] get //EXAMPLE/254/56/3 level`,
		fromServer: `[103] 300 //EXAMPLE/254/56/3: level=128`,
		expected: {
			type: `response`,
			commandId: 103,
			code: 300,
			matched: true,
			processed: true,
			netId: CBusNetId.parse(`//EXAMPLE/254/56/3`),
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
			gClient.receiveLightStatus(CBusNetId.parse(`//EXAMPLE/254/56/3`));
		},
		fromClient: `[104] get //EXAMPLE/254/56/3 level`,
		fromServer: `[104] 300 //EXAMPLE/254/56/3: level=255`,
		expected: {
			type: `response`,
			commandId: 104,
			code: 300,
			matched: true,
			processed: true,
			netId: CBusNetId.parse(`//EXAMPLE/254/56/3`),
			level: 100
		}
	},
	{
		name: `[105] receiveSecurityStatus`,
		clientAction: function () {
			gClient.receiveSecurityStatus(CBusNetId.parse(`//EXAMPLE/254/208/15`), () => { log.info(`received zone status`); } );
		},
		fromClient: `[105] get //EXAMPLE/254/208/15 zonestate`,
		fromServer: `[105] 300 //EXAMPLE/254/208/15: zonestate=1`,
		expected: {
			type: `response`,
			commandId: 105,
			code: 300,
			matched: true,
			processed: true,
			netId: CBusNetId.parse(`//EXAMPLE/254/208/15`),
			zonestate: `unsealed`
		}
	},
	{
		name: `[106] parse simple XML snippet`,
		clientAction: function () {
			gClient.getDB(CBusNetId.parse(`//EXAMPLE/254`));
		},
		fromClient: `[106] dbgetxml //EXAMPLE/254`,
		fromServer:
			'[106] 343-Begin XML snippet\n' +
			'[106] 347-<?xml version="1.0" encoding="utf-8"?>\n' +
			'[106] 347-<Thingys><Thingy>thing 1</Thingy><Thingy>thing 2</Thingy><Thingy>thing 3</Thingy><Thingy>thing 4</Thingy></Thingys>\n' +
			'[106] 344 End XML snippet',
		expected: {
			type: `response`,
			commandId: 106,
			code: 344,
			snippet: {
				commandId: 106,
				content: '<?xml version="1.0" encoding="utf-8"?><Thingys><Thingy>thing 1</Thingy><Thingy>thing 2</Thingy><Thingy>thing 3</Thingy><Thingy>thing 4</Thingy></Thingys>'
			},
			matched: true,
			processed: true,
		},
		numTestsInValidation: 1,
		validate: function(message, assert) {
			console.assert(message);
			assert.equal(message.snippet.content.length, 153, `[106] checking snippet length`);
		}
	},
	{
		name: `[107] parse xml 344 before 343`,
		clientAction: function () {
			gClient.getDB(CBusNetId.parse(`//EXAMPLE/254`));
		},
		fromClient: `[107] dbgetxml //EXAMPLE/254`,
		fromServer: '[107] 344 End XML snippet',
		expected: `exception`,
		exception: /unexpected snippet end response/
	},
	{
		name: `[108] parse xml 347 before 343`,
		clientAction: function () {
			gClient.getDB(CBusNetId.parse(`//EXAMPLE/254`));
		},
		fromClient: `[108] dbgetxml //EXAMPLE/254`,
		fromServer:	'[108] 347-<?xml version="1.0" encoding="utf-8"?>',
		expected: `exception`,
		exception: /can't add content without a snippet begin/
	},
	{
		name: `[109] parse big xml`,
		clientAction: function () {
			gDatabase.fetch(gClient, () => { /* console.log(`fetched`) */ } )
		},
		fromClient: `[109] dbgetxml //EXAMPLE/254`,
		fromServer:
			'[109] 343-Begin XML snippet\n' +
			'[109] 347-this is just a placeholder -- will be filled in later\n' +
			'[109] 344 End XML snippet',
		expected: {
			type: `response`,
			commandId: 109,
		},
		numTestsInValidation: 10,
		validate: function(message, assert, testName) {
			console.assert(message);
			assert.equal(message.snippet.content.length, 24884, `${testName}: checking snippet length`);
			assert.equal(gDatabase.groups.length, 35, `${testName}: checking group count`);
			
			assert.deepEquals(gDatabase.applications[0], {
					"address": 56,
					"name": "Lighting"
			}, `${testName}: check applications[0]`);
			
			assert.deepEquals(gDatabase.groups[6], {
				"application": 56,
				"address": 37,
				"name": "Sprinkler1"
			}, `${testName}: check groups[6]`);
			
			assert.deepEquals(gDatabase.units[4], {
				"tag": "Gateway to Wireless Net",
				"partName": "WG",
				"address": 42,
				"firmwareVersion": "4.3.00",
				"serialNumber": "1048575.4095",
				"catalogNumber": "5800WCGA",
				"unitType": "GATEWLSN"
			}, `${testName}: check units[4]`);
			
			assert.equals(gDatabase.getNetLabel(CBusNetId.parse(`//EXAMPLE/254`)), `net254`, `${testName}: check network label`);
			
			assert.equals(gDatabase.getNetLabel(CBusNetId.parse(`//EXAMPLE/254/224`)), `Telephony`, `${testName}: check known application label`);
			assert.equals(gDatabase.getNetLabel(CBusNetId.parse(`//EXAMPLE/254/250`)), `app250`, `${testName}: check unknown application label`);
			
			assert.equals(gDatabase.getNetLabel(CBusNetId.parse(`//EXAMPLE/254/56/40`)), `Wine Cellar`, `${testName}: check known group label`);
			assert.equals(gDatabase.getNetLabel(CBusNetId.parse(`//EXAMPLE/254/222/222`)), `group222`, `${testName}: check unknown group label`);
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
		fromServer: `#e# 20170204-130934.821 702 //EXAMPLE/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213`,
		expected: {
			type: `event`,
			time: `20170204-130934.821`,
			code: 702,
			netId: CBusNetId.parse(`//EXAMPLE/254/208`),
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
		fromServer: `lighting on //EXAMPLE/254/56/190  #sourceunit=81 OID=3dfd77e0-c4aa-1034-9f54-fbb6c098d608`,
		expected: `exception`,
		exception: /unrecognised structure/
	},
	{
		name: `event 756`,
		fromServer: `#e# 20170204-160655.767 756 //EXAMPLE/254 3dfc3f60-c4aa-1034-9e98-fbb6c098d608 SyncState=syncing`,
		expected: {
			type: `event`,
			code: 756,
			processed: false
		}
	},
	{
	 	name: `event 730 new level`,
		fromServer: `#e# 20170204-160545.608 730 //EXAMPLE/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new level=43 sourceunit=74 ramptime=10`,
		expected: {
			type: `event`,
			code: 730,
			netId: CBusNetId.parse(`//EXAMPLE/254/56/116`),
			level: 17,
			sourceunit: 74,
			ramptime: 10,
			processed: true
		}
	},
	{
	name: `event 702 arm_not_ready`,
		fromServer: `#e# 20170204-130934.821 702 //EXAMPLE/254/208/24 - [security] arm_not_ready sourceUnit=213`,
		expected: {
			type: `event`,
			time: `20170204-130934.821`,
			code: 702,
			netId: CBusNetId.parse(`//EXAMPLE/254/208/24`),
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
		fromServer: `#e# 20170204-130934.821 702 //EXAMPLE/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213`,
		expected: {
			type: `event`,
			time: `20170204-130934.821`,
			code: 702,
			netId: CBusNetId.parse(`//EXAMPLE/254/208`),
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
		fromServer: `#e# 20170204-160545.608 730 //EXAMPLE/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new foo=6.5020`,
		expected: {
			type: `event`,
			foo: 6.502,
			processed: true
		}
	},
	{
		name: `event 702 missing remainder`,
		fromServer: `#e# 20170204-130934.821 702 //EXAMPLE/254/208/24 - [security]`,
		expected: `exception`,
		exception: /not in 'netid objectId \[applicationName\] remainder' format/
	},
	{
		name: `event 730 bad level`,
		fromServer: `#e# 20170204-160545.608 730 //EXAMPLE/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new level=abc sourceunit=74 ramptime=10`,
		expected: `exception`,
		exception: /illegal raw type: string/
	},
	{
		name: `event 730 missing new`,
		fromServer: `#e# 20170204-160545.608 730 //EXAMPLE/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 level=43 sourceunit=74 ramptime=10`,
		expected: `exception`,
		exception: /not in 'new remainder' format/
	},
	{
		name: `event 730 missing sourceunit`,
		fromServer: `#e# 20170204-160545.608 730 //EXAMPLE/254/56/116 3df8bcf0-c4aa-1034-9f0a-fbb6c098d608 new level=43 sourceunit= ramptime=10`,
		expected: `exception`,
		exception: /bad key=value: 'sourceunit'/
	},
	{
		name: `response 200`,
		fromServer: `[123] 200 OK: //EXAMPLE/254/56/3`,
		expected: {
			type: `response`,
			commandId: 123,
			code: 200,
			matched: false,
			processed: true
		}
	},
	{
	name: `response 300`,
	fromServer: `[456] 300 //EXAMPLE/254/56/3: level=129`,
		expected: {
			type: `response`,
			commandId: 456,
			code: 300,
			netId: CBusNetId.parse(`//EXAMPLE/254/56/3`),
			level: 51,	// 129 raw = 51%
			matched: false,
			processed: true
		}
	},
	{
		name: `bad response level 1`,
		fromServer: `[456] 300 //EXAMPLE/254/56/3: level=abc`,
		expected: `exception`,
		exception: /not in '\(level|zonestate\)=xxx' format/
	},
	{
		name: `bad response level 2`,
		fromServer: `[456] 300 //EXAMPLE/254/56/3: level=-1`,
		expected: `exception`,
		exception: /not in '\(level|zonestate\)=xxx' format/
	},
	{
		name: `bad response level 3`,
		fromServer: `[456] 300 //EXAMPLE/254/56/3: level=1000`,
		expected: `exception`,
		exception: /not in '\(level|zonestate\)=xxx' format/
	},
	{
		name: `bad response level 4`,
		fromServer: `[456] 300 //EXAMPLE/254/56/3: level=300`,
		expected: `exception`,
		exception: /illegal raw level: 300/
	},
	{
		name: `bad response 201`,
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

// read in the mocked server response from EXAMPLE.xml.txt.txt and patch into command 109
test(`setup tests`, function (assert) {
	assert.plan(2);
	
	// setup globals
	gClient = new CGateClient(`127.0.0.1`, SERVER_PORT, `EXAMPLE`, 254, 56, log, true);
	gDatabase = new CGateDatabase(new CBusNetId(`EXAMPLE`, 254), log);
	
	assert.equals(gDatabase.getNetLabel(CBusNetId.parse(`//EXAMPLE/254`)), undefined, `check CGateDatabase.getNetLabel() handling before first parse`);
	
	
	// patch in the EXAMPLE project database dump
	fs.readFile(`tests/resources/EXAMPLE.xml.txt`, 'utf8', function (err, fileData) {
		console.assert(!err, `error loading EXAMPLE.xml.txt`, err);
		
		// fill in the fromServer field for the test named `[106] dbgetxml`
		let foundCount = 0;
		TEST_DESCRIPTORS.forEach((descriptor, index) => {
			if (typeof descriptor.expected != `undefined`) {
				if (descriptor.name == `[109] parse big xml`) {
					descriptor.fromServer = fileData;
					foundCount++;
				}
			}
		});
		
		assert.equals(foundCount, 1, `fromServer patched`);
		
		assert.end();
	});
});

function _validate(message, descriptor, assert) {
	const testName = `parsed message from '${descriptor.name}'`;
	
	const expected = descriptor.expected;
	console.assert(typeof expected == `object`, `_validate: '${descriptor.name}'.expected must be an object`);
	 
	// fire up another test
	log.info(`====> scheduling test for '${testName}'`);
	test(testName, assert => {
		assert.plan(expected.length);
		Object.keys(expected).forEach(key => {
			const actualValue = message[key];
			const expectedValue = expected[key];
			
			// don't fail just because there's a difference in inspect functions
			if ((typeof actualValue.inspect != `undefined`) && (typeof expectedValue.inspect == `undefined`)) {
				expectedValue.inspect = actualValue.inspect;
			}
			
			assert.deepEquals(actualValue, expectedValue, `validate message key '${key}'`);
		});
		assert.end();
	});
	
	// run any validate tests on the response
	const validate = descriptor.validate;
	if (typeof validate != `undefined`) {
		console.assert(typeof validate == `function`);
		validate(message, assert, descriptor.name);
	}
}

//==========================================================================================
//  spin up a mock cgate server and have a chat
//==========================================================================================

test('server premature disconnect', function (assert) {
	assert.plan(1);
	
	// create a server object
	const NETID = CBusNetId.parse(`//EXAMPLE/254/56/3`);

	// let's not use the global gClient here
	const client = new CGateClient(`127.0.0.1`, SERVER_PORT, `EXAMPLE`, NETID.network, NETID.application, log, true);
	
	// try to close it before it's even been opened
	assert.throws(function () {
		client.disconnect();
	});
	
	assert.end();
});

function _serverTests(descriptors) {
	test(`server responses`, assert => {
		let descriptorIndex = 0;
		
		const EVENTS_REQUEST = `[99] events e7s0c0`;
		const EVENTS_RESPONSE = `[99] 200 OK.`;
		
		// this harness will directly run a test for every instance of the following test properties:
		// - forClient (ensuring that forClient matched expected)
		// - exception (ensuring that junk recevied by client was caught and matches the regex)
		let testCount = 0;
		descriptors.forEach(descriptor => {
			if (descriptor.fromClient) {
				testCount++;
			}
			
			if (descriptor.exception) {
				testCount++;
			}
			
			if (typeof descriptor.numTestsInValidation != `undefined`) {
				testCount += descriptor.numTestsInValidation;
			}
		});
		assert.plan(testCount);
		
		var serverConnection;
		
		// spin up a fake g-gate server
		const server = net.createServer(function (connection) {
			serverConnection = connection;
			log.info('server listening');
			connection.write(`201 Service ready: Clipsal C-Gate Version: v4.5.6 (build 789) #cmd-syntax=2.2\r\n`);
			
			carrier.carry(connection, (req) => {
				if (req == EVENTS_REQUEST) {
					log.info(`settings up CGate events`);
					connection.write(`${EVENTS_RESPONSE}\n`);
				} else {
					const testDescriptor = descriptors[descriptorIndex];
					const exp = testDescriptor.fromClient;
					const res = testDescriptor.fromServer;
					console.assert(res, `${testDescriptor.name}: every fromClient must be matched with a fromServer`);
					console.assert(!res.endsWith(`\n`), `${testDescriptor.name}: fromServer must not end with a \\n`);
					
					if (testDescriptor.fromClient == testDescriptor.fromClient) {
						log.info(`server rx: '${req}', tx: '${res}'`);
					} else {
						log.info(`req: '${req}'`);
						log.info(`exp: '${exp}'`);
					}
					
					// check request is what we expected
					assert.equal(req, exp, `${testDescriptor.name}: checking fromClient`);
					
					// send response
					connection.write(`${res}\n`);
				}
			});
		});
		
		server.on('error', (e) => {
			if (e.code == 'EADDRINUSE') {
				assert.end(`there is already a server on port ${SERVER_PORT}`);
			}
		});
		
		server.listen(SERVER_PORT);
		
		const next = function () {
			if (descriptorIndex < descriptors.length) {
				const descriptor = descriptors[descriptorIndex];
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
		
		// listen for data from the client -- not yet used
		gClient.on('event', message => {
			const descriptor = descriptors[descriptorIndex];
			// log.info(`received 'event' (index ${descriptorIndex})`);
			_validate(message, descriptor, assert);
			descriptorIndex++;
			next();
		});
		
		gClient.on(`response`, message => {
			const descriptor = descriptors[descriptorIndex];
			// log.info(`received 'response' (index ${descriptorIndex})`);
			_validate(message, descriptor, assert);
			descriptorIndex++;
			next();
		});
		
		gClient.on('junk', (ex, line) => {
			log.info(`junk received '${line}', ex '${ex}' (index ${descriptorIndex})`);
			const descriptor = descriptors[descriptorIndex];
			const exceptionRegex = descriptor.exception;
			if (typeof exceptionRegex == `undefined`) {
				assert.fail(`${descriptor.name}: failed, was expecting a descriptor.exception, unexpected: ${ex}`);
			} else {
				console.assert(exceptionRegex instanceof RegExp, `${descriptor.name}: descriptor.exception must be a regex`);
				assert.throws(function () {
						throw ex;
					},
					exceptionRegex,
					`${descriptor.name}: checking exception matches regex '${descriptor.exception}'`);
			}
			descriptorIndex++;
			next();
		});
		
		gClient.connect(function () {
			next();
		});
		
		assert.on("end", function () {
			log.info(`end; closing server`);
			server.close();
		});
	});
}

 _serverTests(TEST_DESCRIPTORS);


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
