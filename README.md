# daggr: filter and aggregate numeric data in plaintext or json form

**This tool is still in development.  Arguments and syntax may change!**


# Synopsis

daggr reads records on stdin and filters, transforms, and aggregates them based
on the command-line flags.  It processes both text and JSON data.  It's inspired
by both awk(1) and dtrace(1M).

With no arguments, it filters nothing and performs no transformations, so it
acts exactly like cat(1):

    $ daggr < sample-data/requests.txt
    PUT  /dap/public/kartlytics/videos/2012-06-19-00.mov      201 34
    PUT  /dap/public/kartlytics/videos/2012-06-19-00.mov.json 202 15
    HEAD /dap/public/kartlytics/videos/2012-06-19-02.mov      200 19
    GET  /dap/public/kartlytics/videos/2012-06-19-02.mov.json 200 12
    PUT  /dap/public/kartlytics/videos/2012-06-19-03.mov      201 35
    PUT  /dap/public/kartlytics/videos/2012-06-19-03.mov.json 202 20
    GET  /dap/public/kartlytics/videos/2012-06-19-04.mov      200 16
    GET  /dap/public/kartlytics/videos/2012-06-19-04.mov.json 200 16
    GET  /dap/public/kartlytics/videos/2012-06-19-05.mov      200 16
    GET  /dap/public/kartlytics/videos/2012-06-19-05.mov.json 200 15
    GET  /dap/public/kartlytics/videos/2012-06-19-06.mov      200 15
    GET  /dap/public/kartlytics/videos/2012-06-19-06.mov.json 200 17
    GET  /dap/public/kartlytics/videos/2012-06-19-07.mov      200 10
    GET  /dap/public/kartlytics/videos/2012-06-19-07.mov.json 200 18
    GET  /dap/public/kartlytics/videos/2012-06-19-08.mov      200 8
    GET  /dap/public/kartlytics/videos/2012-06-19-08.mov.json 200 8
    GET  /dap/public/kartlytics/videos/2012-06-19-09.mov      200 8
    GET  /dap/public/kartlytics/videos/2012-06-19-09.mov.json 200 22
    GET  /dap/public/kartlytics/videos/2012-06-19-10.mov      200 7
    GET  /dap/public/kartlytics/videos/2012-06-19-10.mov.json 200 7
    GET  /dap/public/kartlytics/videos/2012-06-28-00.mov      200 16
    GET  /dap/public/kartlytics/videos/2012-06-28-00.mov.json 200 18
    GET  /dap/public/kartlytics/videos/2012-06-29-00.mov      200 8
    GET  /dap/public/kartlytics/videos/2012-06-29-00.mov.json 200 24
    PUT  /dap/public/kartlytics/videos/2012-06-29-01.mov      204 40
    PUT  /dap/public/kartlytics/videos/2012-06-29-01.mov.json 204 34

## Filtering

You could also filter out just the PUTs with:

    $ daggr -f '$1 == "PUT"' < sample-data/requests.txt 
    PUT  /dap/public/kartlytics/videos/2012-06-19-00.mov      201 34
    PUT  /dap/public/kartlytics/videos/2012-06-19-00.mov.json 202 15
    PUT  /dap/public/kartlytics/videos/2012-06-19-03.mov      201 35
    PUT  /dap/public/kartlytics/videos/2012-06-19-03.mov.json 202 20
    PUT  /dap/public/kartlytics/videos/2012-06-29-01.mov      204 40
    PUT  /dap/public/kartlytics/videos/2012-06-29-01.mov.json 204 34

## Selecting fields

You could select just the third field with:

    $ daggr -f '$1 == "PUT"' -o 3 < sample-data/requests.txt
    /dap/public/kartlytics/videos/2012-06-19-00.mov
    /dap/public/kartlytics/videos/2012-06-19-00.mov.json
    /dap/public/kartlytics/videos/2012-06-19-03.mov
    /dap/public/kartlytics/videos/2012-06-19-03.mov.json
    /dap/public/kartlytics/videos/2012-06-29-01.mov
    /dap/public/kartlytics/videos/2012-06-29-01.mov.json

## Aggregations

So far, this is just another way to do what 'awk' already does.  But daggr also
supports DTrace-like aggregating actions.  Simplest is "count", which behaves
much like "wc -l":

    $ daggr count < sample-data/requests.txt 
    26

Of course, this can be combined with filtering:

    $ daggr -f '$1 == "PUT"' count < sample-data/requests.txt 
    6


## Grouping results by some other field

Instead of filtering, you could break out the count by method (field 1):

    $ daggr -k 1 count < sample-data/requests.txt
    PUT 6
    HEAD 1
    GET 19

You can also aggregate by multiple fields:

    $ daggr -k1 -k3 count < sample-data/requests.txt 
    PUT,201 2
    PUT,202 2
    PUT,204 2
    HEAD,200 1
    GET,200 19

## Other types of aggregations

Instead of counting lines, you could instead average the numbers in column 4
(which represent latencies in this dataset):

    $ daggr -f '$1 == "PUT"' -v 4 avg < sample-data/requests.txt 
    29.666666666666668

Of course, you can break that out by column 1, too:

    $ daggr -k 1 -v 4 avg < sample-data/requests.txt 
    PUT 29.666666666666668
    HEAD 19
    GET 13.736842105263158

Another useful aggregating action is "quantize", which generates a power-of-two
histogram of a numeric quantity.  This example prints out a histogram of the
value of field 4 for each value of field 1:

    $ daggr.js -k 1 -v 4 quantize < sample-data/requests.txt 
    PUT 
               value  ------------- Distribution ------------- count
                   4 |                                         0
                   8 |@@@@@@@                                  1
                  16 |@@@@@@@                                  1
                  32 |@@@@@@@@@@@@@@@@@@@@@@@@@@@              4
                  64 |                                         0
    
    HEAD 
               value  ------------- Distribution ------------- count
                   8 |                                         0
                  16 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 1
                  32 |                                         0
    
    GET 
               value  ------------- Distribution ------------- count
                   2 |                                         0
                   4 |@@@@                                     2
                   8 |@@@@@@@@@@@@@@@@@                        8
                  16 |@@@@@@@@@@@@@@@@@@@                      9
                  32 |                                         0

## JSON data

The above examples use text for simplicity, but you can do all the same things
using newline-separated JSON records by specifying the "-j" option.  With "-j",
each line is parsed as JSON, and the fields become accessible as variables for
use with -k, -v, and -o.  For example, consider HTTP access records that look
like this (similar to those emitted by
[restify](https://github.com/mcavage/node-restify) using
[bunyan](https://github.com/trentm/node-bunyan)), but with newlines only used to
separate each record:

    {
      "req": {
        "method": "PUT",
        "headers": {
          "accept": "application/json",
          "content-length": "29",
          "content-type": "application/json",
          "date": "Sun, 03 Nov 2013 20:09:44 GMT",
          "expect": "100-continue",
          "x-request-id": "897a3f08-b885-4499-bff6-d53a78e483b1",
          "user-agent": "restify/2.6.0 (ia32-sunos; v8/3.11.10.26; OpenSSL/0.9.8w) node/0.8.26",
          "accept-version": "~1.0",
          "host": "localhost",
          "connection": "keep-alive"
        },
        "httpVersion": "1.1",
        "caller": {
          "login": "dap"
        },
        "request-uri": "/dap/public/kartlytics/videos/2012-06-19-07.mov.json"
      },
      "res": {
        "statusCode": 204,
        "headers": {
          "date": "Sun, 03 Nov 2013 20:09:44 GMT",
          "x-response-time": 34
        }
      }
    }

Here's an example that prints out the value of "res.statusCode" for the records
with "req.method" == "PUT":

    $ daggr.js -j -f 'req.method == "PUT"' -o res.statusCode < requests.json
    204
    204

Here's an example that takes a bunch of such records and produces histograms of
"res.headers['x-response-time']" for each value of "req.method":

    $ daggr -j -k req.method -v res.headers.x-response-time quantize < requests.json
    POST 
               value  ------------- Distribution ------------- count
                   4 |                                         0
                   8 |@@@@@@@@@@                               1
                  16 |@@@@@@@@@@                               1
                  32 |@@@@@@@@@@@@@@@@@@@@                     2
                  64 |                                         0
    
    HEAD 
               value  ------------- Distribution ------------- count
                   8 |                                         0
                  16 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 1
                  32 |                                         0
    
    GET 
               value  ------------- Distribution ------------- count
                   2 |                                         0
                   4 |@@@@                                     2
                   8 |@@@@@@@@@@@@@@@@@                        8
                  16 |@@@@@@@@@@@@@@@@@@@                      9
                  32 |                                         0
    
    PUT 
               value  ------------- Distribution ------------- count
                  16 |                                         0
                  32 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 2
                  64 |                                         0



# Example one-liners

## Text-based examples

Sum a list of numbers in column 1:

    $ daggr sum

Print only lines with column 1 greater than zero:

    $ daggr -f '$1 > 0'

or:

    $ daggr -f '$1 > 0' print

Print column 3 from lines with column 1 greater than zero:

    $ daggr -f '$1 > 0' -o 3

Sum the positive numbers in column 1 on each line:

    $ daggr -f '$1 > 0' sum

Print column 2 for each line where column 1 is not "HOST":

    $ daggr -f '$1 != "HOST"' -v 2

Print the mean of the numbers in column 3 from lines where column 1 is not
"HOST":

    $ daggr -f '$1 != "HOST"' -v 3 avg

Sum the numbers in column 3 from lines where column1 is not HOST, and print
the results grouped by the value of column 2:

    $ daggr -f '$1 > 0' -k 2 -v 3 sum

Generate a power-of-two histogram for values of column 2 where column 1 is
greater than zero:

    $ daggr -f '$1 > 0' -v 2 quantize 


## JSON examples

Most of the above can be translated for JSON data as well.

Print objects where "ms" property is greater than 10:

    $ daggr -j -f 'ms > 10'

Print the "url" property of objects where "ms" is greater than 10:

    $ daggr -j -f 'ms > 10' -o url

Print the sum of the "rqs" property for objects where "ms" is greater than 10:

    $ daggr -j -f 'ms > 10' -v rqs sum

Generate a power-of-two histogram for values of "ms" where "ms" is greater than
10, and group the histograms by "req.url":

    $ daggr -j -f 'ms > 10' -k req.url -v ms quantize


# Details

Synopsis:

    daggr [-j] [-k FIELD...] [-f FILTER ...] [-o FIELD...] [-v FIELD] [ACTION]

FIELD is a JavaScript-style property name -- not an arbitrary JavaScript
expression.

FILTER is a JavaScript expression invoked in the context of each record to
decide whether to keep that record or discard it.  In plaintext mode (the
default), `$0` denotes the complete line, and `$1`, `$2`, `$3`, and so on denote
the first, second, third whitespace-separated fields.  In JSON mode, "this"
denotes the whole record, and global variables are provided for each of the
top-level properties of the record.

Blank rows are ignored.  With "-j", rows that don't begin with "{" are ignored.

ACTION is one of:

    * avg: given numeric inputs, average the values
    * count: given arbitrary inputs, count the number of inputs
    * max: given numeric inputs, compute the maximum value
    * min: given numeric inputs, compute the minimum value
    * sum: given numeric inputs, sum the values
    * quantize: given numeric inputs, produce a power-of-two histogram
      describing the distribution of values.

If you don't specify a field with "-v", the first field is used.

The "-k" and "-o" options specify one or more fields to group by and output,
respectively.  Without "-j", the value is a range of field numbers starting with
1 (e.g., "-k 1,3").  With "-j", the value is a comma-separated list of JSON
fields.  The "-v" option specifies which field contains the value to process,
and it operates similarly but only supports a single field.
