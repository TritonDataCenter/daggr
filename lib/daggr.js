/*
 * lib/daggr.js: data aggregation library
 */

var mod_assert = require('assert');
var mod_events = require('events');
var mod_util = require('util');

var mod_extsprintf = require('extsprintf');
var mod_jsprim = require('jsprim');
var mod_strsplit = require('strsplit');

/* public interface */
exports.RowStream = RowStream;
exports.Printer = Printer;
exports.DataAggregator = DataAggregator;
exports.createConsumer = createConsumer;

function createConsumer(action, args)
{
	if (action == 'print')
		return (new Printer(args));
	if (!daActions.hasOwnProperty(action))
		return (new Error('unsupported action: "' + action + '"'));
	return (new DataAggregator(action, args));
}

function RowStream(args)
{
	var rs = this;
	mod_events.EventEmitter.call(this);

	this.rs_source = args['stream'];
	this.rs_json = args['mode'] == 'json';
	this.rs_buffered = '';
	this.rs_lineno = 0;
	this.rs_source.on('data', function (chunk) {
		var data, i, rows;
		data = rs.rs_buffered + chunk.toString('utf8');
		i = data.lastIndexOf('\n');
		rs.rs_buffered = i == -1 ? '' : data.substr(i + 1);
		data = data.substr(0, i);

		rows = mod_strsplit.strsplit(data, '\n');
		rows.forEach(rs.onLine.bind(rs));
	});

	this.rs_source.on('end', function () {
		var rows = mod_strsplit.strsplit(rs.rs_buffered, '\n');
		rows.forEach(rs.onLine.bind(rs));
		rs.emit('end');
	});
}

mod_util.inherits(RowStream, mod_events.EventEmitter);

RowStream.prototype.onLine = function (line)
{
	var obj, parts;
	++this.rs_lineno;
	if (line.length === 0)
		return;
	if (this.rs_json) {
		if (line[0] != '{') {
			/* XXX */
			console.error('warn: line %d: %s',
			    this.rs_lineno, 'doesn\'t look like JSON');
			return;
		}

		try {
			obj = JSON.parse(line);
		} catch (ex) {
			/* XXX */
			console.error('warn: line %d: %s',
			    this.rs_lineno, ex.message);
			return;
		}

		this.emit('row', [ line, obj ]);
	} else {
		parts = mod_strsplit.strsplit(line, /\s+/);
		parts.unshift(line);
		this.emit('row', parts);
	}
};


function Printer(args)
{
	var outstream = this.p_outstream = args['outstream'];
	this.p_stream = args['stream'];
	this.p_stream.on('row', function (row) {
		outstream.write(row[0] + '\n');
	});
}

/* supported aggregating actions */
var daActions = {
    'count': {
	'aggr': function (oldval, newval) { return (oldval + 1); }
    },
    'sum': {
	'aggr': function (oldval, newval) {
		if (isNaN(newval))
			return (oldval);
		return (oldval + newval);
	}
    },
    'avg': {
	'zero': function () { return ({ 'c': 0, 's': 0 }); },
	'aggr': function (oldval, newval) {
		if (isNaN(newval))
			return (oldval);
		return ({ 'c': oldval['c'] + 1, 's': oldval['s'] + newval });
	},
	'print': function (stream, value) {
		value = value['c'] === 0 ? 0 : value['s'] / value['c'];
		stream.write(value.toString());
	}
    },
    'max': {
	'zero': function () { return (-Infinity); },
	'aggr': function (oldval, newval) {
		if (isNaN(newval))
			return (oldval);
		return (Math.max(oldval, newval));
	}
    },
    'min': {
	'zero': function () { return (Infinity); },
	'aggr': function (oldval, newval) {
		if (isNaN(newval))
			return (oldval);
		return (Math.min(oldval, newval));
	}
    },
    'quantize': {
	'zero': function () {
		return ({ 'buckets': [], 'max': undefined, 'total': 0 });
	},
	'aggr': function (hist, value) {
		var bucket;

		bucket = 0;
		while (value >= Math.pow(2, bucket))
			bucket++;

		if (hist.buckets[bucket] === undefined)
			hist.buckets[bucket] = 1;
		else
			hist.buckets[bucket]++;

		if (hist.max === undefined || value > hist.max)
			hist.max = value;

		hist.total++;
		return (hist);
	},
	'print': function (stream, hist) {
		var b, count, normalized, dots, i;

		fprintf(stream, '\n           ' +
		    'value  ------------- Distribution ------------- count\n');

		if (hist.buckets.length === 0)
			return;

		for (b = -1; b < hist.buckets.length - 1; b++) {
			if (hist.buckets[b + 1] !== undefined)
				break;
		}

		for (; b < hist.buckets.length + 1; b++) {
			count = hist.buckets[b] || 0;
			normalized = Math.round(
			    40 * hist.buckets[b] / hist.total);
			dots = '';
			for (i = 0; i < normalized; i++)
				dots += '@';
			for (; i < 40; i++)
				dots += ' ';

			fprintf(stream, '%16s |%s %s\n',
			    Math.pow(2, b - 1).toString(), dots, count);
		}
	}
    }
};

/*
 * Arguments:
 *
 *     mode	"text" or "json"
 *
 *     action	aggregating action
 *
 *     key	Array of key fields
 *
 *     value	Value field
 *
 *     stream	RowStream
 */
function DataAggregator(action, args)
{
	mod_assert.ok(typeof (args) == 'object' && args !== null);
	mod_assert.ok(args['mode'] == 'text' || args['mode'] == 'json');
	mod_assert.ok(args['key'] === undefined || Array.isArray(args['key']));
	mod_assert.ok(args['value'] === undefined ||
	    typeof (args['value'] == 'string'));
	mod_assert.ok(action in daActions);
	mod_assert.equal(typeof (args['stream']), 'object');
	mod_assert.equal(typeof (args['outstream']), 'object');

	this.da_json = args['mode'] == 'json';
	this.da_value = args['value'] || (this.da_json ? null : '0');
	this.da_action = daActions[action];
	this.da_key = args['key'] ? args['key'].slice(0) : [];

	if (!this.da_action.zero)
		this.da_action.zero = function () { return (0); };
	if (!this.da_action.print)
		this.da_action.print = function (stream, value) {
			stream.write(value.toString());
		};

	if (this.da_key.length > 0)
		this.da_data = {};
	else
		this.da_data = this.da_action.zero();

	this.da_nrecords = 0;

	this.da_stream = args['stream'];
	this.da_stream.on('row', this.aggregate.bind(this));
	this.da_stream.on('end', this.print.bind(this));

	this.da_outstream = args['outstream'];
}

DataAggregator.prototype.aggregate = function (row)
{
	var key, value;

	if (this.da_json)
		row = row[1];

	value = +(this.extractField(row, this.da_value));

	if (this.da_key.length === 0) {
		this.da_data = this.da_action.aggr(this.da_data, value);
	} else {
		key = this.computeKey(row);
		this.put(key, this.da_action.aggr(this.get(key), value));
	}
};

DataAggregator.prototype.extractField = function (row, field)
{
	/*
	 * This works for both JSON mode, where "row" is an object and "field"
	 * may include nested references, as well as text mode, where "row" is
	 * an array and "field" is a number.
	 */
	return (mod_jsprim.pluck(row, field));
};

DataAggregator.prototype.computeKey = function (row)
{
	var aggr = this;
	return (this.da_key.map(
	    function (field) { return (aggr.extractField(row, field)); }));
};

DataAggregator.prototype.get = function (keyv)
{
	var obj, i;

	for (i = 0, obj = this.da_data; i < keyv.length; i++) {
		if (!obj.hasOwnProperty(keyv[i]))
			return (this.da_action.zero());

		obj = obj[keyv[i]];
	}

	return (obj);
};

DataAggregator.prototype.put = function (keyv, value)
{
	var obj, i;

	for (i = 0, obj = this.da_data; i < keyv.length - 1; i++) {
		if (!obj.hasOwnProperty(keyv[i]))
			obj[keyv[i]] = {};

		obj = obj[keyv[i]];
	}

	obj[keyv[keyv.length - 1]] = value;
};

DataAggregator.prototype.reportFlattened = function ()
{
	/* XXX had to fix lib/jsprim.js */
	var flattened = mod_jsprim.flattenObject(
	    this.da_data, this.da_key.length);
	return (flattened);
};

DataAggregator.prototype.print = function ()
{
	var stream = this.da_outstream;

	if (this.da_key.length === 0) {
		this.da_action.print(stream, this.da_data);
		stream.write('\n');
		return;
	}

	var aggr = this;
	var rows = this.reportFlattened();
	rows.forEach(function (r) {
		stream.write(r.slice(0, aggr.da_key.length).toString() + ' ');
		aggr.da_action.print(stream, r[aggr.da_key.length]);
		stream.write('\n');
	});
};

function fprintf(stream)
{
	var args = Array.prototype.slice.call(arguments, 1);
	var msg = mod_extsprintf.sprintf.apply(null, args);
	stream.write(msg);
}
