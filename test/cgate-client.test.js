'use strict';

const net = require('net');
const fs = require('fs');

const tmp = require('tmp');
const carrier = require('carrier');
const test = require('tape').test;
const rewire = require('rewire');

require('../hot-debug.js');
const log = require('debug')('test-output');

const cgateLog = require('debug')('cbus:client');

const CGateClient = rewire('../lib/cgate-client.js');
const CGateDatabase = rewire(`../lib/cgate-database.js`);
const CGateExport = rewire(`../lib/cgate-export.js`);
const CBusNetId = require('../lib/cbus-netid.js');

const util = require('util');

const _rawToPercent = CGateClient.__get__('_rawToPercent');
const _rawToZoneState = CGateClient.__get__('_rawToZoneState');

// ==========================================================================================
// Events
// ==========================================================================================

// globals required for patching into TEST_DESCRIPTORS
let gClient;
let gDatabase;

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
			gClient.turnOn(CBusNetId.parse(`//EXAMPLE/254/56/3`));
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
			gClient.turnOff(CBusNetId.parse(`//EXAMPLE/254/56/3`));
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
			gClient.setLevel(CBusNetId.parse(`//EXAMPLE/254/56/3`), 50, () => {
			}, 10);
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
			gClient.receiveLevel(CBusNetId.parse(`//EXAMPLE/254/56/3`));
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
			gClient.receiveLevel(CBusNetId.parse(`//EXAMPLE/254/56/3`));
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
			gClient.receiveSecurityStatus(CBusNetId.parse(`//EXAMPLE/254/208/15`), () => {
				log(`received zone status`);
			});
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
		fromServer: '[106] 343-Begin XML snippet\n' +
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
			processed: true
		},
		numTestsInValidation: 1,
		validate: function (message, assert) {
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
		fromServer: '[108] 347-<?xml version="1.0" encoding="utf-8"?>',
		expected: `exception`,
		exception: /can't add content without a snippet begin/
	},
	{
		name: `[109] parse big xml`,
		clientAction: function () {
			gDatabase.fetch(gClient, () => { /* console.log(`fetched`) */
			});
		},
		fromClient: `[109] dbgetxml //EXAMPLE`,
		fromServer: '[109] 343-Begin XML snippet\n' +
			'[109] 347-this is just a placeholder -- will be filled in later\n' +
			'[109] 344 End XML snippet',
		expected: {
			type: `response`,
			commandId: 109
		},
		numTestsInValidation: 16,
		validate: function (message, assert, testName) {
			console.assert(message);
			assert.equal(message.snippet.content.length, 77742, `${testName}: checking snippet length`);

			const stats = gDatabase.getStats();
			assert.equal(stats.numApplications, 18, `${testName}: checking application count`);
			assert.equal(stats.numGroups, 59, `${testName}: checking group count`);
			assert.equal(stats.numUnits, 21, `${testName}: checking unit count`);

			assert.deepEquals(gDatabase.applications[`//EXAMPLE/254/56`], {
				tag: 'Lighting'
			}, `${testName}: check applications`);

			assert.equal(gDatabase.groups[`//EXAMPLE/254/56/37`].tag, 'Sprinkler1', `${testName}: check groups`);

			assert.deepEquals(gDatabase.units[`//EXAMPLE/254/p/42`], {
				tag: 'Gateway to Wireless Net',
				partName: 'WG',
				firmwareVersion: '4.3.00',
				serialNumber: '1048575.4095',
				catalogNumber: '5800WCGA',
				unitType: 'GATEWLSN',
				application: 255
			}, `${testName}: check units`);

			assert.equals(gDatabase.getTag(CBusNetId.parse(`//EXAMPLE`)), `//EXAMPLE`, `${testName}: check project label`);
			assert.equals(gDatabase.getTag(CBusNetId.parse(`//EXAMPLE/254`)), `//EXAMPLE/254`, `${testName}: check network label`);
			assert.throws(function () {
				gDatabase.getTag(new CBusNetId(`BLAH`));
			}, /getNetworkEntity unable to search outside default project/, `invalid project name`);

			assert.equals(gDatabase.getTag(CBusNetId.parse(`//EXAMPLE/254/224`)), `Telephony`, `${testName}: check known application label`);
			assert.equals(gDatabase.getTag(CBusNetId.parse(`//EXAMPLE/254/250`)), `//EXAMPLE/254/250`, `${testName}: check unknown application label`);

			assert.equals(gDatabase.getTag(CBusNetId.parse(`//EXAMPLE/254/56/40`)), `Wine Cellar`, `${testName}: check known group label`);
			assert.equals(gDatabase.getTag(CBusNetId.parse(`//EXAMPLE/254/222/222`)), `//EXAMPLE/254/222/222`, `${testName}: check unknown group label`);

			assert.equals(gDatabase.getTag(CBusNetId.parse(`//EXAMPLE/254/p/5`)), `Lounge DLT`, `${testName}: check known unit label`);
			assert.equals(gDatabase.getTag(CBusNetId.parse(`//EXAMPLE/254/p/22`)), `//EXAMPLE/254/p/22`, `${testName}: check unknown unit label`);
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
		exception: /not in 'netid objectId \[applicationName] remainder' format/
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
	gDatabase = new CGateDatabase(new CBusNetId(`EXAMPLE`), log);

	// test behaviour pre-initialisation
	assert.throws(function () {
		gDatabase.getTag(new CBusNetId(`ANYTHING`));
	}, /database access before initialisation/, `access before initialisation`);

	// patch in the EXAMPLE project database dump
	const fileData = fs.readFileSync(`test/resources/EXAMPLE.xml.txt`, 'utf8');

	// fill in the fromServer field for the test named `[106] dbgetxml`
	let foundCount = 0;
	TEST_DESCRIPTORS.forEach(descriptor => {
		if (descriptor.name === `[109] parse big xml`) {
			descriptor.fromServer = fileData;
			foundCount++;
		}
	});

	assert.equals(foundCount, 1, `fromServer patched`);

	assert.end();
});

function _validate(message, descriptor, assert) {
	cgateLog.enable();

	const testName = `parsed message from '${descriptor.name}'`;

	const expected = descriptor.expected;
	console.assert(typeof expected === `object`, `_validate: '${descriptor.name}'.expected must be an object`);

	// fire up another test
	log(`====> scheduling test for '${testName}'`);
	test(testName, assert => {
		assert.plan(expected.length);
		Object.keys(expected).forEach(key => {
			const actualValue = message[key];
			const expectedValue = expected[key];

			// don't fail just because there's a difference in inspect functions
			if ((typeof actualValue.inspect !== `undefined`) && (typeof expectedValue.inspect === `undefined`)) {
				expectedValue.inspect = actualValue.inspect;
			}

			assert.deepEquals(actualValue, expectedValue, `validate message key '${key}'`);
		});
		assert.end();
	});

	// run any validate tests on the response
	const validate = descriptor.validate;
	if (typeof validate !== `undefined`) {
		console.assert(typeof validate === `function`);
		validate(message, assert, descriptor.name);
	}
}

// ==========================================================================================
// spin up a mock C-Gate server and have a chat
// ==========================================================================================

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
		cgateLog.enable();

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

			if (typeof descriptor.numTestsInValidation !== `undefined`) {
				testCount += descriptor.numTestsInValidation;
			}
		});
		assert.plan(testCount);

		let serverConnection;

		// spin up a fake g-gate server
		const server = net.createServer(function (connection) {
			serverConnection = connection;
			log('server listening');
			connection.write(`201 Service ready: Clipsal C-Gate Version: v4.5.6 (build 789) #cmd-syntax=2.2\r\n`);

			carrier.carry(connection, req => {
				if (req === EVENTS_REQUEST) {
					log(`settings up CGate events`);
					connection.write(`${EVENTS_RESPONSE}\n`);
				} else {
					const testDescriptor = descriptors[descriptorIndex];
					const exp = testDescriptor.fromClient;
					const res = testDescriptor.fromServer;
					console.assert(res, `${testDescriptor.name}: every fromClient must be matched with a fromServer`);
					console.assert(!res.endsWith(`\n`), `${testDescriptor.name}: fromServer must not end with a \\n`);

					if (testDescriptor.fromClient === testDescriptor.fromClient) {
						log(`server rx: '${req}', tx: '${res}'`);
					} else {
						log(`req: '${req}'`);
						log(`exp: '${exp}'`);
					}

					// check request is what we expected
					assert.equal(req, exp, `${testDescriptor.name}: checking fromClient`);

					// send response
					connection.write(`${res}\n`);
				}
			});
		});

		server.on('error', e => {
			if (e.code === 'EADDRINUSE') {
				assert.end(`there is already a server on port ${SERVER_PORT}`);
			}
		});

		server.listen(SERVER_PORT);

		const next = function () {
			if (descriptorIndex < descriptors.length) {
				const descriptor = descriptors[descriptorIndex];
				const action = descriptor.clientAction;
				log(`\n\n`);
				log(`step ${descriptorIndex}: testing '${descriptor.name}'`);

				// execute an action if there is one
				if (action) {
					log(`client sending action`);
					action();
				} else {
					// if no action, then must be unsolicited
					log(`server sending unsolicited '${descriptor.fromServer}'`);
					serverConnection.write(`${descriptor.fromServer}\n`);
				}
			} else {
				log(`end; disconnecting client`);
				gClient.disconnect();
				assert.end();
			}
		};

		// listen for data from the client -- not yet used
		gClient.on('event', message => {
			const descriptor = descriptors[descriptorIndex];
			// log(`received 'event' (index ${descriptorIndex})`);
			_validate(message, descriptor, assert);
			descriptorIndex++;
			next();
		});

		gClient.on(`response`, message => {
			const descriptor = descriptors[descriptorIndex];
			// log(`received 'response' (index ${descriptorIndex})`);

			try {
				_validate(message, descriptor, assert);
			} catch (ex) {
				assert.fail(`** unexpected exception when validating '${descriptor.name}'; ${ex.stack}`);
			}
			descriptorIndex++;
			next();
		});

		gClient.on('junk', (ex, line) => {
			log(`junk received '${line}', ex '${ex}' (index ${descriptorIndex})`);
			const descriptor = descriptors[descriptorIndex];
			const exceptionRegex = descriptor.exception;
			if (typeof exceptionRegex === `undefined`) {
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

		assert.on('end', function () {
			log(`end; closing server`);
			server.close();
		});
	});
}

_serverTests(TEST_DESCRIPTORS);

// write out the database and check it
test(`write out database`, function (assert) {
	assert.plan(1);

	const path = tmp.tmpNameSync({prefix: 'homebridge-cbus.database.test.', postfix: '.json'});

	new CGateExport(gDatabase).exportDatabase(path, function (err) {
		if (err) {
			assert.equals(err, undefined, `fs write ok`);
		} else {
			const fileSize = fs.statSync(path).size;
			assert.equals(fileSize, 14977, `file size`);
		}

		assert.end();
	});
});

// write out the platform and check it
test(`write out platform`, function (assert) {
	// order must be exact
	const EXPECTED = {
		platforms: [
		{
			platform: 'homebridge-cbus.CBus',
			name: 'CBus',
			client_ip_address: '127.0.0.1',
			client_controlport: 20023,
			client_cbusname: 'EXAMPLE',
			client_network: 254,
			client_application: 56,

			accessories: [
				// new enabled
				{ type: 'light', network: 252, application: 32, id: 199, name: 'Light 199' },
				{ type: 'dimmer', id: 120, name: 'Dimmer 120' },

				// modified / enabled
				{ type: 'switch', application: 202, id: 127, name: 'Shiny new name', dbtag: `Main Area Scene Trigger` },

				// unchanged
				{ type: "unknown", network: 42, id: 34, name: "Barbeque", enabled: false },
				{ type: "unknown", network: 42, id: 35, name: "Group 35", enabled: false },
				{ type: "unknown", network: 42, id: 36, name: "Group 36", enabled: false },
				{ type: "unknown", network: 42, id: 37, name: "Group 37", enabled: false },
				{ type: "unknown", network: 42, id: 38, name: "Group 38", enabled: false },
				{ type: "unknown", network: 42, id: 39, name: "Group 39", enabled: false },
				{ type: "unknown", network: 42, id: 42, name: "Garden Lights", enabled: false },
				{ type: "unknown", network: 42, id: 43, name: "Potting Shed", enabled: false },
				{ type: "unknown", network: 42, id: 44, name: "Pavillion lights", enabled: false },
				{ type: "unknown", network: 42, id: 46, name: "Pool deck", enabled: false },
				{ type: "unknown", network: 42, id: 47, name: "Pool lights", enabled: false },
				{ type: "unknown", network: 42, application: 136, id: 0, name: "Main heater", enabled: false },
				{ type: "unknown", network: 42, application: 136, id: 1, name: "Pool heater", enabled: false },
				{ type: "unknown", network: 42, application: 202, id: 1, name: "Group 1", enabled: false },
				{ type: "unknown", network: 42, application: 203, id: 1, name: "Main Switch Key Sets control", enabled: false },

				// unchanged
				{ type: "unknown", network: 253, id: 32, name: "Master Bedroom Main", enabled: false },
				{ type: "unknown", network: 253, id: 33, name: "Master Bedroom right side", enabled: false },
				{ type: "unknown", network: 253, id: 34, name: "Master Bedroom left side", enabled: false },
				{ type: "unknown", network: 253, id: 35, name: "Children's bedroom 1", enabled: false },
				{ type: "unknown", network: 253, id: 36, name: "Children's bedroom 2", enabled: false },
				{ type: "unknown", network: 253, id: 37, name: "Master Bathroom", enabled: false },
				{ type: "unknown", network: 253, id: 38, name: "Upstairs Toilet", enabled: false },
				{ type: "light", network: 253, id: 39, name: "Upstairs Fan", enabled: false },
				{ type: "unknown", network: 253, id: 80, name: "Jacuzzi", enabled: false },
				{ type: "light", network: 253, id: 81, name: "Bar Heater Master", enabled: false },
				{ type: "light", network: 253, id: 82, name: "Bar Heater children 1", enabled: false },
				{ type: "light", network: 253, id: 83, name: "Bar Heater children 2", enabled: false },
				{ type: "unknown", network: 253, id: 127, name: "Group 127", enabled: false },
				{ type: "unknown", network: 253, id: 243, name: "Group 243", enabled: false },

				// new disabled
				{ type: 'switch', network: 253, application: 57, id: 140, name: 'Switch 140', enabled: false },

				{ type: "unknown", network: 253, application: 202, id: 127, name: "Group 127", enabled: false },

				{ type: 'unknown', id: 0, name: 'Group 0', enabled: false },
				{ type: 'unknown', id: 15, name: 'Group 15', enabled: false },
				{ type: 'unknown', id: 16, name: 'Group 16', enabled: false },
				{ type: 'unknown', id: 31, name: 'Group 31', enabled: false },
				{ type: 'dimmer', id: 32, name: 'Kitchen1', enabled: false },
				{ type: 'dimmer', id: 33, name: 'Kitchen2', enabled: false },
				{ type: 'dimmer', id: 34, name: 'Dining1', enabled: false },
				{ type: 'dimmer', id: 35, name: 'Dining2', enabled: false },
				{ type: 'dimmer', id: 36, name: 'Lounge', enabled: false },
				{ type: 'dimmer', id: 37, name: 'Sprinkler1', enabled: false },
				{ type: 'dimmer', id: 38, name: 'Sprinkler2', enabled: false },
				{ type: 'dimmer', id: 39, name: 'Porch', enabled: false },
				{ type: 'unknown', id: 40, name: 'Wine Cellar', enabled: false },
				{ type: 'unknown', id: 41, name: 'Conservatory', enabled: false },
				{ type: 'unknown', id: 42, name: 'Garden Lights', enabled: false },
				{ type: 'unknown', id: 43, name: 'Potting Shed', enabled: false },
				{ type: 'unknown', id: 44, name: 'Pavillion lights', enabled: false },
				{ type: 'unknown', id: 45, name: 'Pavillion internal', enabled: false },
				{ type: 'unknown', id: 46, name: 'Pool Deck', enabled: false },
				{ type: 'unknown', id: 47, name: 'Pool Lights', enabled: false },
				{ type: 'unknown', id: 48, name: 'Barbeque area', enabled: false },
				{ type: 'unknown', id: 63, name: 'Cellar Chiller', enabled: false },
				{ type: 'unknown', id: 81, name: 'Group 81', enabled: false },
				{ type: 'unknown', application: 202, id: 34, name: 'Group 34', enabled: false },
				{ type: 'unknown', application: 202, id: 35, name: 'Group 35', enabled: false },
				{ type: 'unknown', application: 202, id: 80, name: 'Closet light', enabled: false },
				{ type: 'unknown', application: 202, id: 81, name: 'Hallway light', enabled: false },
				{ type: 'unknown', application: 203, id: 0, name: 'Group 0', enabled: false }
			]
		}
	]};

	assert.plan(2);

	let platform = {
		config: {
			"platform": "homebridge-cbus.CBus",
			"name": "CBus",
			"client_ip_address": "127.0.0.1",
			"client_controlport": 20023,
			"client_cbusname": "EXAMPLE",
			"client_network": 254,
			"client_application": 56,
			accessories: []
		}
	};

	function _register(netIdStr, config) {
		const netId = CBusNetId.parse(netIdStr);

		config.network = netId.network;
		config.application = netId.application;
		console.assert(netId.group === config.id);
		platform.config.accessories.push(config);
	}

	// duplicate of the database (with updated name)
	_register(`//EXAMPLE/254/202/127`, {type: "switch", name: "Shiny new name", "id": 127, "enabled": true});

	// no enabled property
	_register(`//EXAMPLE/254/56/120`, {type: "dimmer", name: "Dimmer 120", id: 120});

	// enabled: false
	_register(`//EXAMPLE/253/57/140`, {type: "switch", name: "Switch 140", id: 140, enabled: false});

	// enabled: true
	_register(`//EXAMPLE/252/32/199`, {type: "light", name: "Light 199", id: 199, enabled: true});

	const path = tmp.tmpNameSync({prefix: 'homebridge-cbus.platform.test.', postfix: '.json'});

	new CGateExport(gDatabase).exportPlatform(path, platform, function (err) {
		if (err) {
			assert.fail(`fs write failed` + err);
		} else {
			const fileSize = fs.statSync(path).size;
			assert.equals(fileSize, 6196, `file size`);

			// who knew you could load JSON with require!
			const loaded = require(path);
			assert.deepEquals(loaded.platforms, EXPECTED.platforms, `saved file integrity`);
		}

		assert.end();
	});
});

// ==========================================================================================
// utils
// ==========================================================================================

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
