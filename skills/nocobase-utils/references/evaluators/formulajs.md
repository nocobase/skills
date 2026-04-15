---
title: formula.js Function Reference
description: Complete, authoritative list of functions available in @formulajs/formulajs v4.4.9 used as the "formula.js" engine in NocoBase. Use this to verify function names and signatures before writing expressions.
---

# formula.js Function Reference

**Package**: `@formulajs/formulajs` v4.4.9  
**Engine key**: `formula.js`  
**Style**: Excel-compatible — all function names are **UPPER_CASE**

> **CRITICAL**: Only use function names from the tables below. Never invent or guess function names. Functions marked "not implemented" exist as stubs and will throw errors at runtime.

## Expression Examples

Variable references in expressions use `{{variable}}` syntax, and function names are uppercase. Here are some examples:

```
// Arithmetic
SUM({{$context.data.price}}, {{$context.data.tax}})
ROUND({{$context.data.amount}} * 1.08, 2)

// Conditional
IF({{$context.data.status}} = "active", "Active", "Inactive")
IFS({{$context.data.score}} >= 90, "A", {{$context.data.score}} >= 80, "B", true, "C")

// Text
CONCATENATE({{$context.data.firstName}}, " ", {{$context.data.lastName}})
LEFT({{$context.data.code}}, 3)
TEXT({{$context.data.amount}}, "0.00")

// Date
DATEDIF({{$context.data.startDate}}, NOW(), "D")
EDATE({{$context.data.contractDate}}, 12)
```

---

## Math & Trigonometry (65 functions)

| Function | Parameters | Description |
|---|---|---|
| `ABS` | `number` | Absolute value |
| `ACOS` | `number` | Arccosine (input: -1 to 1) |
| `ACOSH` | `number` | Inverse hyperbolic cosine |
| `ACOT` | `number` | Arccotangent |
| `ACOTH` | `number` | Hyperbolic arccotangent |
| `AGGREGATE` | `function_num, options, ref1, ref2` | Aggregate from list/database |
| `ARABIC` | `text` | Convert Roman numeral to Arabic integer |
| `ASIN` | `number` | Arcsine (input: -1 to 1) |
| `ASINH` | `number` | Inverse hyperbolic sine |
| `ATAN` | `number` | Arctangent |
| `ATAN2` | `x_num, y_num` | Arctangent from x,y coordinates |
| `ATANH` | `number` | Inverse hyperbolic tangent |
| `BASE` | `number, radix, min_length` | Convert number to text in given base (2–36) |
| `CEILING` | `number, significance` | Round up to nearest multiple of significance |
| `CEILINGMATH` | `number, significance, mode` | Ceiling rounding (Math variant) |
| `CEILINGPRECISE` | `number, significance, mode` | Precise ceiling rounding |
| `COMBIN` | `number, number_chosen` | Number of combinations |
| `COMBINA` | `number, number_chosen` | Combinations with repetition |
| `COS` | `number` | Cosine |
| `COSH` | `number` | Hyperbolic cosine |
| `COT` | `number` | Cotangent |
| `COTH` | `number` | Hyperbolic cotangent |
| `CSC` | `number` | Cosecant |
| `CSCH` | `number` | Hyperbolic cosecant |
| `DEGREES` | `angle` | Radians to degrees |
| `EVEN` | `number` | Round up to nearest even integer |
| `EXP` | `number` | e raised to the power of number |
| `FACT` | `number` | Factorial |
| `FACTDOUBLE` | `number` | Double factorial |
| `FLOOR` | `number, significance` | Round down to nearest multiple |
| `FLOORMATH` | `number, significance, mode` | Floor rounding with options |
| `FLOORPRECISE` | `number, significance, mode` | Precise floor rounding |
| `GCD` | `...numbers` | Greatest common divisor |
| `INT` | `number` | Round down to nearest integer |
| `LCM` | `...numbers` | Least common multiple |
| `LN` | `number` | Natural logarithm |
| `LOG` | `number, base` | Logarithm to specified base |
| `LOG10` | `number` | Base-10 logarithm |
| `MROUND` | `number, multiple` | Round to nearest multiple |
| `MULTINOMIAL` | `...numbers` | Multinomial coefficient |
| `MUNIT` | `dimension` | Unit matrix of given dimension |
| `ODD` | `number` | Round up to nearest odd integer |
| `PI` | *(none)* | Value of π |
| `POWER` | `number, power` | Number raised to a power |
| `PRODUCT` | `...numbers` | Product of all arguments |
| `QUOTIENT` | `numerator, denominator` | Integer portion of division |
| `RADIANS` | `angle` | Degrees to radians |
| `RAND` | *(none)* | Random number between 0 and 1 |
| `RANDBETWEEN` | `bottom, top` | Random integer between bounds |
| `ROMAN` | `number` | Convert number to Roman numeral string |
| `ROUND` | `number, num_digits` | Round to specified decimal places |
| `ROUNDDOWN` | `number, num_digits` | Round down (toward zero) |
| `ROUNDUP` | `number, num_digits` | Round up (away from zero) |
| `SEC` | `number` | Secant |
| `SECH` | `number` | Hyperbolic secant |
| `SERIESSUM` | `x, n, m, coefficients` | Sum of power series |
| `SIGN` | `number` | Sign of number: -1, 0, or 1 |
| `SIN` | `number` | Sine |
| `SINH` | `number` | Hyperbolic sine |
| `SQRT` | `number` | Square root |
| `SQRTPI` | `number` | Square root of (π × number) |
| `SUM` | `...numbers` | Sum of all arguments |
| `SUMPRODUCT` | `...arrays` | Sum of products of arrays |
| `SUMSQ` | `...numbers` | Sum of squares |
| `SUMX2MY2` | `array_x, array_y` | Sum of (x² − y²) |
| `SUMX2PY2` | `array_x, array_y` | Sum of (x² + y²) |
| `SUMXMY2` | `array_x, array_y` | Sum of (x − y)² |
| `TAN` | `number` | Tangent |
| `TANH` | `number` | Hyperbolic tangent |
| `TRUNC` | `number, num_digits` | Truncate to integer (or specified digits) |

---

## Statistical (selected most-used functions)

| Function | Parameters | Description |
|---|---|---|
| `AVERAGE` | `...values` | Arithmetic mean |
| `AVERAGEA` | `...values` | Mean including text (as 0) and logical values |
| `AVERAGEIF` | `range, criteria, average_range` | Average of values meeting a criterion |
| `AVERAGEIFS` | `avg_range, range1, criteria1, ...` | Average meeting multiple criteria |
| `COUNT` | `...values` | Count of numeric values |
| `COUNTA` | `...values` | Count of non-empty values |
| `COUNTBLANK` | `...values` | Count of empty values |
| `COUNTIF` | `range, criteria` | Count values meeting a criterion |
| `COUNTIFS` | `range1, criteria1, ...` | Count values meeting multiple criteria |
| `CORREL` | `array1, array2` | Pearson correlation coefficient |
| `FORECAST` | `x, known_ys, known_xs` | Forecast using linear regression |
| `FREQUENCY` | `data_array, bins_array` | Frequency distribution |
| `GEOMEAN` | `...values` | Geometric mean |
| `HARMEAN` | `...values` | Harmonic mean |
| `KURT` | `...values` | Kurtosis |
| `LARGE` | `array, k` | k-th largest value |
| `LINEST` | `known_y, known_x` | Linear regression statistics |
| `MAX` | `...values` | Maximum value |
| `MAXA` | `...values` | Maximum including text/logical |
| `MAXIFS` | `max_range, range1, criteria1, ...` | Maximum meeting criteria |
| `MEDIAN` | `...values` | Median value |
| `MIN` | `...values` | Minimum value |
| `MINA` | `...values` | Minimum including text/logical |
| `MINIFS` | `min_range, range1, criteria1, ...` | Minimum meeting criteria |
| `MODEMULT` | `...values` | Multiple mode values |
| `MODESNGL` | `...values` | Single mode value |
| `PERCENTILEINC` | `array, k` | k-th percentile (inclusive, 0–1) |
| `PERCENTILEEXC` | `array, k` | k-th percentile (exclusive) |
| `QUARTILEINC` | `range, quart` | Quartile (inclusive) |
| `QUARTILEEXC` | `range, quart` | Quartile (exclusive) |
| `RANKAVG` | `number, ref, order` | Rank (average for ties) |
| `RANKEQ` | `number, ref, order` | Rank (equal for ties) |
| `SKEW` | `...values` | Skewness |
| `SLOPE` | `known_y, known_x` | Slope of regression line |
| `SMALL` | `array, k` | k-th smallest value |
| `STDEVS` | `...values` | Sample standard deviation |
| `STDEVP` | `...values` | Population standard deviation |
| `TODAY` | *(none)* | Today's date |
| `VARS` | `...values` | Sample variance |
| `VARP` | `...values` | Population variance |

---

## Text (28 functions)

| Function | Parameters | Description |
|---|---|---|
| `CHAR` | `number` | Character from ASCII/code point (0–255) |
| `CLEAN` | `text` | Remove non-printable characters |
| `CODE` | `text` | Numeric code of first character |
| `CONCAT` | `...texts` | Concatenate values |
| `CONCATENATE` | `...texts` | Concatenate text strings (alias of CONCAT) |
| `DOLLAR` | `number, decimals` | Format number as currency text |
| `EXACT` | `text1, text2` | Case-sensitive equality check (returns boolean) |
| `FIND` | `find_text, within_text, start_num` | Position of text (case-sensitive, 1-indexed) |
| `FIXED` | `number, decimals, no_commas` | Format number as fixed-decimal text |
| `LEFT` | `text, num_chars` | Leftmost N characters |
| `LEN` | `text` | Length of text |
| `LOWER` | `text` | Convert to lowercase |
| `MID` | `text, start_num, num_chars` | Extract substring |
| `NUMBERVALUE` | `text, decimal_sep, group_sep` | Convert text to number |
| `PROPER` | `text` | Capitalize first letter of each word |
| `REPLACE` | `old_text, start_num, num_chars, new_text` | Replace portion of text |
| `REPT` | `text, number_times` | Repeat text N times |
| `RIGHT` | `text, num_chars` | Rightmost N characters |
| `SEARCH` | `find_text, within_text, start_num` | Position of text (case-insensitive, 1-indexed) |
| `SUBSTITUTE` | `text, old_text, new_text, instance_num` | Substitute occurrences of text |
| `T` | `value` | Convert value to text (non-text returns "") |
| `TEXT` | `value, format_text` | Format value using a format string |
| `TEXTJOIN` | `delimiter, ignore_empty, ...texts` | Join texts with delimiter |
| `TRIM` | `text` | Remove leading/trailing/extra spaces |
| `UNICHAR` | `number` | Unicode character from code point |
| `UNICODE` | `text` | Unicode code point of first character |
| `UPPER` | `text` | Convert to uppercase |
| `VALUE` | `text` | Convert text to number |

---

## Date & Time (24 functions)

| Function | Parameters | Description |
|---|---|---|
| `DATE` | `year, month, day` | Construct a date from parts |
| `DATEDIF` | `start_date, end_date, unit` | Difference between dates; `unit`: `"Y"`, `"M"`, `"D"`, `"MD"`, `"YM"`, `"YD"` |
| `DATEVALUE` | `date_text` | Convert date string to Date |
| `DAY` | `date` | Day of month (1–31) |
| `DAYS` | `end_date, start_date` | Number of days between two dates |
| `DAYS360` | `start_date, end_date, method` | Days between dates (360-day year) |
| `EDATE` | `start_date, months` | Date N months from start |
| `EOMONTH` | `start_date, months` | Last day of month N months away |
| `HOUR` | `time` | Hour (0–23) |
| `ISOWEEKNUM` | `date` | ISO week number |
| `MINUTE` | `time` | Minutes (0–59) |
| `MONTH` | `date` | Month number (1–12) |
| `NETWORKDAYS` | `start_date, end_date, holidays` | Working days between dates |
| `NETWORKDAYSINTL` | `start_date, end_date, weekend, holidays` | Working days (custom weekend mask) |
| `NOW` | *(none)* | Current date and time |
| `SECOND` | `time` | Seconds (0–59) |
| `TIME` | `hour, minute, second` | Construct a time serial number |
| `TIMEVALUE` | `time_text` | Convert time string to serial |
| `WEEKDAY` | `date, return_type` | Day of week (1–7, depends on return_type) |
| `WEEKNUM` | `date, return_type` | Week number of year |
| `WORKDAY` | `start_date, days, holidays` | Date N working days from start |
| `WORKDAYINTL` | `start_date, days, weekend, holidays` | Date N working days (custom weekend) |
| `YEAR` | `date` | Year |
| `YEARFRAC` | `start_date, end_date, basis` | Year fraction between two dates |

---

## Logical (10 functions)

| Function | Parameters | Description |
|---|---|---|
| `AND` | `...logicals` | TRUE if all arguments are TRUE |
| `FALSE` | *(none)* | Returns `false` |
| `IF` | `logical_test, value_if_true, value_if_false` | Conditional value |
| `IFERROR` | `value, value_if_error` | Return fallback if value is an error |
| `IFNA` | `value, value_if_na` | Return fallback if value is #N/A |
| `IFS` | `test1, val1, test2, val2, ...` | Multi-condition IF (first TRUE wins) |
| `NOT` | `logical` | Logical NOT |
| `OR` | `...logicals` | TRUE if any argument is TRUE |
| `TRUE` | *(none)* | Returns `true` |
| `XOR` | `...logicals` | Logical exclusive OR |

---

## Lookup & Reference (12 functions)

| Function | Parameters | Description |
|---|---|---|
| `CHOOSE` | `index_num, val1, val2, ...` | Choose value by index (1-based) |
| `COLUMN` | `reference, index` | Column number |
| `COLUMNS` | `array` | Number of columns |
| `INDEX` | `array, row_num, col_num` | Value at given position |
| `LOOKUP` | `lookup_value, array, result_array` | Look up value in vector |
| `MATCH` | `lookup_value, lookup_array, match_type` | Position of value in array |
| `ROW` | `reference, index` | Row number |
| `ROWS` | `array` | Number of rows |
| `SORT` | `array, sort_index, sort_order, by_col` | Sort an array |
| `TRANSPOSE` | `array` | Transpose rows/columns |
| `UNIQUE` | `...values` | Unique values |
| `VLOOKUP` | `lookup_value, table_array, col_index, range_lookup` | Vertical lookup |

---

## Information (useful subset)

| Function | Parameters | Description |
|---|---|---|
| `ISBLANK` | `value` | TRUE if value is blank/null |
| `ISERR` | `value` | TRUE if value is a non-#N/A error |
| `ISERROR` | `value` | TRUE if value is any error |
| `ISEVEN` | `number` | TRUE if even |
| `ISLOGICAL` | `value` | TRUE if boolean |
| `ISNA` | `value` | TRUE if #N/A error |
| `ISNONTEXT` | `value` | TRUE if not text |
| `ISNUMBER` | `value` | TRUE if number |
| `ISODD` | `value` | TRUE if odd |
| `ISTEXT` | `value` | TRUE if text |
| `N` | `value` | Convert to number (TRUE→1, FALSE→0, date→serial) |
| `NA` | *(none)* | Return #N/A error |
| `TYPE` | `value` | Type code: 1=number, 2=text, 4=boolean, 16=error, 64=array |

---

## Financial (implemented functions only)

| Function | Parameters | Description |
|---|---|---|
| `CUMIPMT` | `rate, nper, pv, start_period, end_period, type` | Cumulative interest paid |
| `CUMPRINC` | `rate, nper, pv, start_period, end_period, type` | Cumulative principal paid |
| `DDB` | `cost, salvage, life, period, factor` | Declining balance depreciation |
| `DISC` | `settlement, maturity, pr, redemption, basis` | Discount rate |
| `DOLLARDE` | `fractional_dollar, fraction` | Fractional dollar to decimal |
| `DOLLARFR` | `decimal_dollar, fraction` | Decimal dollar to fractional |
| `EFFECT` | `nominal_rate, npery` | Effective annual interest rate |
| `FV` | `rate, nper, payment, value, type` | Future value |
| `FVSCHEDULE` | `principal, schedule` | Future value with variable rate schedule |
| `IPMT` | `rate, per, nper, pv, fv, type` | Interest payment for period |
| `IRR` | `values, guess` | Internal rate of return |
| `ISPMT` | `rate, per, nper, pv` | Interest paid during period |
| `MIRR` | `values, finance_rate, reinvest_rate` | Modified internal rate of return |
| `NOMINAL` | `effect_rate, npery` | Nominal annual rate |
| `NPER` | `rate, pmt, pv, fv, type` | Number of periods |
| `NPV` | `rate, value1, value2, ...` | Net present value |
| `PDURATION` | `rate, pv, fv` | Periods required for investment to reach fv |
| `PMT` | `rate, nper, pv, fv, type` | Periodic payment amount |
| `PPMT` | `rate, per, nper, pv, fv, type` | Principal payment for period |
| `PRICEDISC` | `settlement, maturity, discount, redemption, basis` | Discounted price per $100 |
| `PV` | `rate, per, pmt, fv, type` | Present value |
| `RATE` | `nper, pmt, pv, fv, type, guess` | Interest rate per period |
| `RRI` | `nper, pv, fv` | Equivalent interest rate for investment growth |
| `SLN` | `cost, salvage, life` | Straight-line depreciation |
| `SYD` | `cost, salvage, life, per` | Sum-of-years-digits depreciation |
| `TBILLEQ` | `settlement, maturity, discount` | T-Bill equivalent yield |
| `TBILLPRICE` | `settlement, maturity, discount` | T-Bill price |
| `TBILLYIELD` | `settlement, maturity, pr` | T-Bill yield |
| `XIRR` | `values, dates, guess` | IRR for irregular cash flow dates |
| `XNPV` | `rate, values, dates` | NPV for irregular cash flow dates |

---

## Engineering (implemented functions only)

| Function | Parameters | Description |
|---|---|---|
| `BESSELI` | `x, n` | Modified Bessel function In(x) |
| `BESSELJ` | `x, n` | Bessel function Jn(x) |
| `BESSELK` | `x, n` | Modified Bessel function Kn(x) |
| `BESSELY` | `x, n` | Bessel function Yn(x) |
| `BITAND` | `number1, number2` | Bitwise AND |
| `BITLSHIFT` | `number, shift_amount` | Bit shift left |
| `BITOR` | `number1, number2` | Bitwise OR |
| `BITRSHIFT` | `number, shift_amount` | Bit shift right |
| `BITXOR` | `number1, number2` | Bitwise XOR |
| `COMPLEX` | `real_num, i_num, suffix` | Create complex number string |
| `DECIMAL` | `text, radix` | Convert text in given base to decimal |
| `DELTA` | `number1, number2` | 1 if equal, 0 otherwise |
| `ERF` | `lower_limit, upper_limit` | Error function |
| `ERFC` | `x` | Complementary error function |
| `GESTEP` | `number, step` | 1 if number ≥ step, else 0 |
| `IMABS` | `inumber` | Absolute value of complex number |
| `IMAGINARY` | `inumber` | Imaginary coefficient |
| `IMARGUMENT` | `inumber` | Argument (angle) of complex number |
| `IMCONJUGATE` | `inumber` | Complex conjugate |
| `IMCOS` | `inumber` | Cosine of complex |
| `IMCOSH` | `inumber` | Hyperbolic cosine of complex |
| `IMDIV` | `inumber1, inumber2` | Divide complex numbers |
| `IMEXP` | `inumber` | Exponential of complex |
| `IMLN` | `inumber` | Natural log of complex |
| `IMLOG10` | `inumber` | Log base 10 of complex |
| `IMLOG2` | `inumber` | Log base 2 of complex |
| `IMPOWER` | `inumber, number` | Complex raised to power |
| `IMPRODUCT` | `...inumbers` | Product of complex numbers |
| `IMREAL` | `inumber` | Real coefficient |
| `IMSIN` | `inumber` | Sine of complex |
| `IMSINH` | `inumber` | Hyperbolic sine of complex |
| `IMSQRT` | `inumber` | Square root of complex |
| `IMSUB` | `inumber1, inumber2` | Subtract complex numbers |
| `IMSUM` | `...inumbers` | Sum of complex numbers |
| `IMTAN` | `inumber` | Tangent of complex |

---

## Database (12 functions)

These functions operate on an array-of-objects "database" with a header row.

| Function | Parameters | Description |
|---|---|---|
| `DAVERAGE` | `database, field, criteria` | Average from database matching criteria |
| `DCOUNT` | `database, field, criteria` | Count numeric values in database |
| `DCOUNTA` | `database, field, criteria` | Count non-empty values in database |
| `DGET` | `database, field, criteria` | Extract single value from database |
| `DMAX` | `database, field, criteria` | Maximum from database |
| `DMIN` | `database, field, criteria` | Minimum from database |
| `DPRODUCT` | `database, field, criteria` | Product from database |
| `DSTDEV` | `database, field, criteria` | Sample standard deviation from database |
| `DSTDEVP` | `database, field, criteria` | Population standard deviation from database |
| `DSUM` | `database, field, criteria` | Sum from database |
| `DVAR` | `database, field, criteria` | Sample variance from database |
| `DVARP` | `database, field, criteria` | Population variance from database |
