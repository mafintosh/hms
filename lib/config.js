var fs = require('fs');
var path = require('path');

var HOME = process.env.HOME || process.env.USERPROFILE;
var HMS = path.join(HOME, '.hms.json');

exports.read = function() {
	return fs.existsSync(HMS) ? require(HMS) : {};
};

exports.write = function(val) {
	fs.writeFileSync(HMS, JSON.stringify(val || {}, null, 2));
};