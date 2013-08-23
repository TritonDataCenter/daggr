/*
 * lib/daggr.js: data aggregation library
 */

var mod_assert = require('assert');
var mod_events = require('events');
var mod_util = require('util');

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
	this.rs_buffered = '';
	this.rs_source.on('data', function (chunk) {
		var data, i, rows;
		data = rs.rs_buffered + chunk.toString('utf8');
		i = data.lastIndexOf('\n');
		rs.rs_buffered = i == -1 ? '' : data.substr(i + 1);
		data = data.substr(0, i);

		rows = mod_strsplit.strsplit(data, '\n');
		rows.forEach(function (row) {
			if (row.length === 0)
				return;
			var parts = mod_strsplit.strsplit(row, /\s+/);
			parts.unshift(row);
			rs.emit('row', parts);
		});
	});

	this.rs_source.on('end', function () {
		var rows = mod_strsplit.strsplit(rs.rs_buffered, '\n');
		rows.forEach(function (row) {
			if (row.length === 0)
				return;
			var parts = mod_strsplit.strsplit(row, /\s+/);
			parts.unshift(row);
			rs.emit('row', row);
		});

		rs.emit('end');
	});
}

mod_util.inherits(RowStream, mod_events.EventEmitter);


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
