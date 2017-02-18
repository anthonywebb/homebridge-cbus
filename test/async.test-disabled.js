let test = require('tape');

function _test(name) {
	test(`test ${name}`, t => {
		t.plan(1);
		t.pass(name);
		t.end();
	});
}

_test(`huey`);
_test(`dewey`);

setTimeout(function () {
	_test(`louie`);
}, 100);
