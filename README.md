# daggr: filter and aggregate numeric data in plaintext or json form

    Text-based examples:

    $ daggr sum                         # sum a list of numbers in column 1
    $ daggr -f '$1 > 0'                 # print lines with pos. numbers in col 1
    $ daggr -f '$1 > 0' print           # print lines with pos. numbers in col 1
    $ daggr -f '$1 > 0' -o $3           # print $3 from lines with pos. numbers
                                        # in column1
    $ daggr -f '$1 > 0' sum             # sum only the positive numbers
    $ daggr -f '$1 != "HOST"' -v $2     # print column2 where column1 != "HOST"
    $ daggr -f '$1 != "HOST"' -v $3 avg # print mean of column3 where
                                        # column1 != "HOST"
    $ daggr -f '$1 > 0' -k '$2' -v $3 sum   # print the sum of $3, grouped by
                                            # $2, where column1 is positive
    $ daggr -f '$1 > 0' -v $2 quantize  # generate power-of-two histogram for
                                        # values of $2 where $1 is positive

    JSON examples:

    $ daggr -j -f 'ms > 10'             # print objects where "ms" property is
                                        # greater than 10
    $ daggr -j -f 'ms > 10' -o url      # print "url" property of objects where
                                        # "ms" is greater than 10
    $ daggr -j -f 'ms > 10' -v rqs sum  # print sum of "rqs" properties for 
                                        # objects with "ms" greater than 10
    $ daggr -j -f 'ms > 10' \           # generate power-of-two histogram for
        -k req.url -v ms quantize       # values of "ms" where "ms > 10",
                                        # grouped by "req.url"


# XXX everything below here is draft

## Synopsis

    daggr [-F SEP] [-k KPOS1[,KPOS2]] [-v VPOS] [-o OPOS1[, ...]] 
          ACTION[,ACTION] [FILE...]
    daggr -j [-k FIELD1[,FIELD2...]] [-v VFIELD] [-o OFIELD1[, ...]]
          ACTION[,ACTION] [FILE...]

daggr reads a newline-separated data stream, groups rows according to keys
specified with "-k", and summarizes the data according to the specified action.

For example, the following sums a list of numbers in column 1 on stdin:

    daggr sum

The following does the same thing, broken out by the second column (a label):

    daggr -k2,2 sum

There's also a Node.js library API.

## Examples

Sum a list of numbers:

    # cat rawnumbers.txt
    157
    216
    3854

    # daggr sum rawnumbers.txt
    4227

Sum a list of numbers, broken out by some label:

    # cat bykey.txt
    157 montgomery
    8   manjula
    12  clancy
    37  clancy
    57  montgomery

    # daggr -k2,2 sum bykey.txt
    214 montgomery
      8 manjula
     49 clancy

This would be equvalent to `sort | uniq -c`

    # daggr -k1,- count


## Running daggr

The first form processes whitespace-delimited rows (unless a
separator regex is specified with -F).  The "-j" form assumes that each row is
is a JSON object with data columns corresponding to fields in the object.  Blank
rows are ignored.  With "-j", rows that don't begin with "{" are ignored.

### Aggregating actions

Available actions resemble those supported by DTrace, including:

    * avg: given numeric inputs, average the values
    * count: given arbitrary inputs, count the number of inputs
    * max: given numeric inputs, compute the maximum value
    * min: given numeric inputs, compute the minimum value
    * sum: given numeric inputs, sum the values
    * quantize: given numeric inputs, produce a power-of-two histogram
      describing the distribution of values.

### Selecting the field to aggregate

By default, the aggregating action operates on the complete row.  Actions that
expect numeric values only process the first field.  You can select which field
to aggregate with "-v".  See "Selecting fields" below.

### Grouping results by one or more keys

The default behavior is to provide a single summary.  You can decompose the
results by the value of some other field using the "-k" option.  See "Selecting
fields" below.

### Selecting fields for output

The default behavior is to emit the summary value, along with whatever keys were
selected with "-k".  With "-o", you can select additional fields to emit along
with the keys.

### Selecting fields

The "-k" and "-o" options specify one or more fields to group by and output,
respectively.  Without "-j", the value is a range of field numbers starting with
1 (e.g., "-k 1,3").  With "-j", the value is a comma-separated list of JSON
fields.  The "-v" option specifies which field contains the value to process,
and it operates similarly but only supports a single field.
