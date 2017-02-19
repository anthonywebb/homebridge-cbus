'use strict';

require('../hot-debug.js');

var test = require('tape').test;
var rewire = require('rewire');

var b1 = require('debug')('b1');
var c1 = require('debug')('c1');
var c2 = require('debug')('c2');
var c4 = require('debug')('c3');

var createDebug = require('debug');

var hotdebug = rewire('../hot-debug.js');

//-------------------------------
// rewire privates

var _addToArrayUnique = hotdebug.__get__('_addToArrayUnique');
var _safeRemoveFromArray = hotdebug.__get__('_safeRemoveFromArray');

var _namespaceRegexFor = hotdebug.__get__('_namespaceRegexFor');

var _addNamespaceToList = hotdebug.__get__('_addNamespaceToList');
var _removeNamespaceFromList = hotdebug.__get__('_removeNamespaceFromList');

//-------------------------------
// helpers

var redirected;

function _testChannelsEnabled(assert, id, expected) {
	// save log settings
	var savedStream = createDebug.log;
	var savedFormatArgs = createDebug.formatArgs;

	// redirect log stream to an array
	redirected = [];

	createDebug.log = function (msg) {
		redirected.push(msg);
	};

	createDebug.formatArgs = function () {
	};

	// generate output
	b1('b1');
	c1('c1');
	c2('c2');
	c4('c3');

	// restore log settings
	createDebug.log = savedStream;
	createDebug.formatArgs = savedFormatArgs;

	// test
	assert.deepEquals(redirected, expected, id);
}

//-------------------------------
// tests

test('_add', function (assert) {
	assert.plan(3);

	var a1 = [1, 2, 3];
	_addToArrayUnique(a1, 4);
	assert.deepEquals(a1, [1, 2, 3, 4]);

	var a2 = [];
	_addToArrayUnique(a2, 11);
	assert.deepEquals(a2, [11]);

	var a3 = [6, 7, 8];
	_addToArrayUnique(a3, 6);
	assert.deepEquals(a3, [6, 7, 8]);

	assert.end();
});

test('_remove', function (assert) {
	assert.plan(4);

	var a1 = [1, 2, 3];
	_safeRemoveFromArray(a1, 4);
	assert.deepEquals(a1, [1, 2, 3]);

	var a2 = [];
	_safeRemoveFromArray(a2, 11);
	assert.deepEquals(a2, []);

	var a3 = [23];
	_safeRemoveFromArray(a3, 23);
	assert.deepEquals(a3, []);

	var a4 = [1, 2, 3];
	_safeRemoveFromArray(a4, 2);
	assert.deepEquals(a4, [1, 3]);

	assert.end();
});

test('_namespaceRegexFor', function (assert) {
	assert.plan(3);

	assert.deepEquals(_namespaceRegexFor('foo'), new RegExp('^foo$'));
	assert.deepEquals(_namespaceRegexFor('bar:*'), new RegExp('^bar:.*?$'));
	assert.deepEquals(_namespaceRegexFor('goo*bar*foo'), new RegExp('^goo.*?bar.*?foo$'));

	assert.end();
});

test('_namespaceRegexFor', function (assert) {
	assert.plan(10);

	var namespace = [];

	_addNamespaceToList(namespace, 'foo', 'add first element');
	assert.deepEquals(namespace, [/^foo$/]);

	_addNamespaceToList(namespace, 'foo', 'add duplicate element');
	assert.deepEquals(namespace, [/^foo$/]);

	_addNamespaceToList(namespace, 'bar');
	assert.deepEquals(namespace, [/^foo$/, /^bar$/], 'add second element');

	_removeNamespaceFromList(namespace, 'goo:*', 'remove non-existant element');
	assert.deepEquals(namespace, [/^foo$/, /^bar$/]);

	_removeNamespaceFromList(namespace, 'foo', 'remove first element');
	assert.deepEquals(namespace, [/^bar$/]);

	_removeNamespaceFromList(namespace, 'bar', 'remove secondary; empty list');
	assert.deepEquals(namespace, []);

	_addNamespaceToList(namespace, 'goo:*', 'add wildcard');
	assert.deepEquals(namespace, [/^goo$/]);

	_addNamespaceToList(namespace, 'goo:*', 'add duplicate wildcard');
	assert.deepEquals(namespace, [/^goo$/]);

	_removeNamespaceFromList(namespace, 'goo:*', 'remove wildcard');
	assert.deepEquals(namespace, []);

	_removeNamespaceFromList(namespace, 'goo:*', 'remove from empty');
	assert.deepEquals(namespace, []);

	assert.end();
});

test('logging disable/enable', function (assert) {
	assert.plan(4);

	createDebug.disable();
	_testChannelsEnabled(assert, 'none', []);

	createDebug.enable('c*');
	_testChannelsEnabled(assert, 'c*', ['c1', 'c2', 'c3']);

	createDebug.disable();
	_testChannelsEnabled(assert, 'disable', []);

	createDebug.enable('*');
	_testChannelsEnabled(assert, 'enable *', ['b1', 'c1', 'c2', 'c3']);

	assert.end();
});

test('logging channel.enable|disable', function (assert) {
	assert.plan(9);

	createDebug.disable();
	_testChannelsEnabled(assert, 'none', []);

	c1.enable(false);
	_testChannelsEnabled(assert, '-c1', []);

	c1.enable();
	_testChannelsEnabled(assert, 'c1', ['c1']);

	c2.enable();
	_testChannelsEnabled(assert, 'c1 & c2', ['c1', 'c2']);

	c4.enable();
	_testChannelsEnabled(assert, 'c1, c2 & c3', ['c1', 'c2', 'c3']);

	c2.enable(false);
	_testChannelsEnabled(assert, 'c1 & c3', ['c1', 'c3']);

	createDebug.enable('c*');
	_testChannelsEnabled(assert, 'c*', ['c1', 'c2', 'c3']);

	b1.enable(true);
	_testChannelsEnabled(assert, 'c* & b1', ['b1', 'c1', 'c2', 'c3']);

	c2.enable(false);
	_testChannelsEnabled(assert, '-c2, +c* & b1', ['b1', 'c1', 'c3']);

	assert.end();
});

test('wildcard blacklist', function (assert) {
	assert.plan(4);

	createDebug.disable();
	_testChannelsEnabled(assert, 'nil', []);

	c1.enable();
	_testChannelsEnabled(assert, 'c1', ['c1']);

	createDebug.enable('-c*');
	_testChannelsEnabled(assert, '-c*', []);

	c1.enable();
	_testChannelsEnabled(assert, '!c1', []);

	assert.end();
});

test('original hot-debug test', function (assert) {
	assert.plan(4);

	var debug = createDebug('test-hot-debug');

	createDebug.formatArgs = function () {
	};
	var logs = [];

	debug.log = function (msg) {
		logs.push(msg);
	};

	assert.false(debug.enabled);
	debug('should not be logged');

	createDebug.enable('test*');
	assert.true(debug.enabled);
	debug('should be logged');

	createDebug.disable();
	assert.false(debug.enabled);
	debug('should not be logged');

	assert.deepEqual(logs, ['should be logged']);

	assert.end();
});
