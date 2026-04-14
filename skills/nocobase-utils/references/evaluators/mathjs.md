---
title: math.js Function Reference
description: Complete, authoritative list of functions and operators available in mathjs v15.1.0 used as the "math.js" engine in NocoBase. Use this to verify function names and syntax before writing expressions.
---

# math.js Function Reference

**Package**: `mathjs` v15.1.0  
**Engine key**: `math.js`  
**Style**: camelCase function names, supports operators and expression syntax

> **CRITICAL**: Only use function names from the tables below. math.js uses **camelCase** naming (e.g., `round`, `sqrt`, `mean`). Never use UPPER_CASE Excel-style names with this engine.

## Expression Syntax

Variables from the NocoBase workflow context can be referenced in expressions using `{{variableName}}` syntax. For example:

```
// Operators
2 + 3           // 5
10 - 4          // 6
3 * 4           // 12
10 / 4          // 2.5
2 ^ 3           // 8  (exponentiation)
10 mod 3        // 1  (modulo)

// Functions
sqrt(16)        // 4
round(3.14159, 2) // 3.14

// Variables from NocoBase context
round({{$context.data.price}} * {{$context.data.qty}}, 2)

// Comparisons (return boolean)
{{$context.data.score}} > 90

// Ternary-like: use conditional()
// Note: math.js does NOT have an IF() function — use formula.js for conditionals
```

---

## Arithmetic Functions

| Function | Parameters | Description | Example |
|---|---|---|---|
| `abs(x)` | `x: number\|Complex\|BigNumber` | Absolute value | `abs(-5)` → `5` |
| `add(x, y, ...)` | `...values` | Addition | `add(2, 3)` → `5` |
| `subtract(x, y)` | `x, y` | Subtraction | `subtract(10, 4)` → `6` |
| `multiply(x, y, ...)` | `...values` | Multiplication | `multiply(3, 4)` → `12` |
| `divide(x, y)` | `x, y` | Division | `divide(10, 4)` → `2.5` |
| `mod(x, y)` | `x, y: number` | Modulo (remainder) | `mod(10, 3)` → `1` |
| `pow(x, y)` | `x, y` | Power/exponentiation | `pow(2, 8)` → `256` |
| `sqrt(x)` | `x: number` | Square root | `sqrt(16)` → `4` |
| `cbrt(x, allRoots?)` | `x: number, allRoots?: boolean` | Cube root | `cbrt(27)` → `3` |
| `nthRoot(x, root)` | `x, root: number` | Nth root | `nthRoot(8, 3)` → `2` |
| `exp(x)` | `x: number` | e^x | `exp(1)` → `2.718...` |
| `expm1(x)` | `x: number` | e^x − 1 (accurate for small x) | `expm1(0.001)` |
| `log(x, base?)` | `x, base?: number` | Natural log (or log to base) | `log(100, 10)` → `2` |
| `log2(x)` | `x: number` | Logarithm base 2 | `log2(8)` → `3` |
| `log10(x)` | `x: number` | Logarithm base 10 | `log10(1000)` → `3` |
| `log1p(x)` | `x: number` | Natural log of (1 + x) | `log1p(0.001)` |
| `square(x)` | `x: number` | x² | `square(4)` → `16` |
| `cube(x)` | `x: number` | x³ | `cube(3)` → `27` |
| `hypot(...values)` | `...numbers` | Euclidean norm: √(x₁²+x₂²+...) | `hypot(3, 4)` → `5` |
| `gcd(...values)` | `...integers` | Greatest common divisor | `gcd(6, 4)` → `2` |
| `lcm(...values)` | `...integers` | Least common multiple | `lcm(4, 6)` → `12` |

---

## Rounding Functions

| Function | Parameters | Description | Example |
|---|---|---|---|
| `round(x, n?)` | `x: number, n?: integer` | Round to n decimal places (default 0) | `round(3.14159, 2)` → `3.14` |
| `floor(x)` | `x: number` | Round down to nearest integer | `floor(3.7)` → `3` |
| `ceil(x)` | `x: number` | Round up to nearest integer | `ceil(3.1)` → `4` |
| `fix(x)` | `x: number` | Round toward zero | `fix(-3.7)` → `-3` |
| `trunc(x)` | `x: number` | Remove decimal part | `trunc(3.7)` → `3` |

---

## Trigonometric Functions

| Function | Parameters | Description |
|---|---|---|
| `sin(x)` | `x: number (radians)` | Sine |
| `cos(x)` | `x: number (radians)` | Cosine |
| `tan(x)` | `x: number (radians)` | Tangent |
| `asin(x)` | `x: number (-1 to 1)` | Arcsine (returns radians) |
| `acos(x)` | `x: number (-1 to 1)` | Arccosine (returns radians) |
| `atan(x)` | `x: number` | Arctangent (returns radians) |
| `atan2(y, x)` | `y, x: number` | Arctangent of y/x (four-quadrant) |
| `sec(x)` | `x: number` | Secant |
| `csc(x)` | `x: number` | Cosecant |
| `cot(x)` | `x: number` | Cotangent |
| `asec(x)` | `x: number` | Arcsecant |
| `acsc(x)` | `x: number` | Arccosecant |
| `acot(x)` | `x: number` | Arccotangent |
| `sinh(x)` | `x: number` | Hyperbolic sine |
| `cosh(x)` | `x: number` | Hyperbolic cosine |
| `tanh(x)` | `x: number` | Hyperbolic tangent |
| `asinh(x)` | `x: number` | Inverse hyperbolic sine |
| `acosh(x)` | `x: number` | Inverse hyperbolic cosine |
| `atanh(x)` | `x: number` | Inverse hyperbolic tangent |
| `sech(x)` | `x: number` | Hyperbolic secant |
| `csch(x)` | `x: number` | Hyperbolic cosecant |
| `coth(x)` | `x: number` | Hyperbolic cotangent |
| `asech(x)` | `x: number` | Inverse hyperbolic secant |
| `acsch(x)` | `x: number` | Inverse hyperbolic cosecant |
| `acoth(x)` | `x: number` | Inverse hyperbolic cotangent |

**Angle conversion helpers:**
| Function | Parameters | Description |
|---|---|---|
| `toRad(x)` | degrees | Degrees → radians |
| `toDeg(x)` | radians | Radians → degrees |

---

## Comparison & Relational Functions

| Function | Parameters | Description | Example |
|---|---|---|---|
| `equal(x, y)` | `x, y` | TRUE if x === y | `equal(3, 3)` → `true` |
| `unequal(x, y)` | `x, y` | TRUE if x !== y | `unequal(3, 4)` → `true` |
| `smaller(x, y)` | `x, y` | TRUE if x < y | `smaller(2, 3)` → `true` |
| `smallerEq(x, y)` | `x, y` | TRUE if x ≤ y | `smallerEq(3, 3)` → `true` |
| `larger(x, y)` | `x, y` | TRUE if x > y | `larger(4, 3)` → `true` |
| `largerEq(x, y)` | `x, y` | TRUE if x ≥ y | `largerEq(3, 3)` → `true` |
| `compare(x, y)` | `x, y` | -1 if x<y, 0 if equal, 1 if x>y | `compare(4, 3)` → `1` |
| `compareNatural(x, y)` | `x, y` | Natural comparison (strings, objects) | |
| `deepEqual(x, y)` | `x, y` | Deep structural equality | |

---

## Logical Functions

| Function | Parameters | Description | Example |
|---|---|---|---|
| `and(x, y)` | `x, y: boolean` | Logical AND | `and(true, false)` → `false` |
| `or(x, y)` | `x, y: boolean` | Logical OR | `or(true, false)` → `true` |
| `not(x)` | `x: boolean` | Logical NOT | `not(true)` → `false` |
| `xor(x, y)` | `x, y: boolean` | Logical XOR | `xor(true, true)` → `false` |

> **Note**: math.js does **not** have a conditional `IF()` function. For conditionals, use the `formula.js` engine instead.

---

## Bitwise Functions

| Function | Parameters | Description |
|---|---|---|
| `bitAnd(x, y)` | `x, y: integer` | Bitwise AND |
| `bitOr(x, y)` | `x, y: integer` | Bitwise OR |
| `bitXor(x, y)` | `x, y: integer` | Bitwise XOR |
| `bitNot(x)` | `x: integer` | Bitwise NOT |
| `leftShift(x, y)` | `x, y: integer` | Left bit shift |
| `rightArithShift(x, y)` | `x, y: integer` | Arithmetic right bit shift |
| `rightLogShift(x, y)` | `x, y: integer` | Logical right bit shift |

---

## Statistical Functions

| Function | Parameters | Description | Example |
|---|---|---|---|
| `mean(...values)` | `x: Array\|...numbers` | Arithmetic mean | `mean([1,2,3,4])` → `2.5` |
| `median(...values)` | `x: Array\|...numbers` | Median value | `median([1,2,3,4])` → `2.5` |
| `mode(...values)` | `x: Array\|...numbers` | Most frequent value(s) | |
| `min(...values)` | `x: Array\|...numbers` | Minimum value | `min(3, 1, 2)` → `1` |
| `max(...values)` | `x: Array\|...numbers` | Maximum value | `max(3, 1, 2)` → `3` |
| `sum(...values)` | `x: Array\|...numbers` | Sum of values | `sum([1,2,3])` → `6` |
| `prod(...values)` | `x: Array\|...numbers` | Product of values | `prod([2,3,4])` → `24` |
| `std(x, normalization?)` | `x: Array, norm?: string` | Standard deviation; norm: `'unbiased'`(default), `'uncorrected'`, `'biased'` | `std([2,4,4,4,5,5,7,9])` → `2` |
| `variance(x, normalization?)` | `x: Array, norm?: string` | Variance | `variance([2,4,4,4,5,5,7,9])` → `4` |
| `mad(x)` | `x: Array` | Mean absolute deviation | |
| `cumsum(x, dim?)` | `x: Array, dim?: number` | Cumulative sum | `cumsum([1,2,3])` → `[1,3,6]` |
| `quantileSeq(x, p, dim?)` | `x: Array, p: number\|number[]` | Quantiles | `quantileSeq([1,2,3,4,5], 0.5)` → `3` |
| `corr(x, y)` | `x, y: Array` | Pearson correlation coefficient | |

---

## Matrix & Array Functions

| Function | Parameters | Description |
|---|---|---|
| `matrix(data?, format?, datatype?)` | `data?: Array` | Create a matrix |
| `ones(m, n, ...)` | `...dimensions` | Matrix of all 1s |
| `zeros(m, n, ...)` | `...dimensions` | Matrix of all 0s |
| `identity(n)` | `n: integer` | Identity matrix |
| `diag(X, k?)` | `X: Array\|Matrix, k?: integer` | Diagonal of matrix or diagonal matrix |
| `transpose(x)` | `x: Matrix\|Array` | Transpose |
| `inv(x)` | `x: Matrix\|Array` | Matrix inverse |
| `det(x)` | `x: Matrix\|Array` | Determinant |
| `trace(x)` | `x: Matrix\|Array` | Sum of diagonal elements |
| `norm(x, p?)` | `x, p?: number\|string` | Vector or matrix norm |
| `dot(x, y)` | `x, y: Array` | Dot product |
| `cross(x, y)` | `x, y: 3D Array` | Cross product |
| `concat(x, y, ..., dim?)` | `...arrays, dim?: number` | Concatenate matrices |
| `flatten(x)` | `x: Array\|Matrix` | Flatten to 1D |
| `resize(x, size, fill?)` | `x, size: Array, fill?` | Resize matrix |
| `reshape(x, sizes)` | `x, sizes: Array` | Reshape matrix |
| `size(x)` | `x` | Dimensions of matrix |
| `subset(x, index, replacement?)` | `x, index` | Get or set subset |
| `index(...ranges)` | `...Range` | Create an Index for subset |
| `range(start, end, step?, includeEnd?)` | `start, end, step?` | Create a range |
| `sort(x, compare?)` | `x: Array, compare?` | Sort an array |
| `filter(x, test)` | `x: Array, test: function` | Filter array elements |
| `map(x, callback)` | `x: Array, callback: function` | Map function over array |
| `forEach(x, callback)` | `x: Array, callback: function` | Iterate over array |
| `reduce(x, dim, callback)` | `x: Array, dim: number, callback` | Reduce array along dimension |
| `count(x)` | `x: Array` | Total number of elements |

---

## Type Conversion Functions

| Function | Parameters | Description |
|---|---|---|
| `number(x, unit?)` | `x, unit?: string` | Convert to number |
| `string(x, options?)` | `x` | Convert to string |
| `boolean(x)` | `x` | Convert to boolean |
| `bignumber(x)` | `x` | Convert to BigNumber (arbitrary precision) |
| `complex(re?, im?)` | `re?: number, im?: number` | Create complex number |
| `fraction(x)` | `x: number\|string` | Convert to Fraction |
| `unit(value, unit?)` | `value: number, unit?: string` | Create a unit value |

---

## Unit Conversion

math.js supports physical units natively in expressions:

```
// Create and convert units
unit(5, 'cm') to 'inch'   // 1.9685...
unit(100, 'km') to 'm'    // 100000

// Arithmetic with units
unit(5, 'kg') * unit(9.81, 'm/s^2')  // force in Newtons

// In expression strings
"5 cm to inch"
"100 km to m"
```

Common supported unit families: length, mass, time, current, temperature, luminosity, force, energy, power, pressure, frequency, angle, and more.

---

## Symbolic & Algebraic Functions

| Function | Parameters | Description |
|---|---|---|
| `parse(expr, options?)` | `expr: string` | Parse expression string to AST node |
| `compile(expr)` | `expr: string` | Compile expression for repeated evaluation |
| `evaluate(expr, scope?)` | `expr: string, scope?: object` | Evaluate expression string |
| `simplify(expr, rules?, scope?, options?)` | `expr: string\|Node` | Simplify algebraic expression |
| `derivative(expr, variable, options?)` | `expr, variable: string` | Symbolic derivative |
| `rationalize(expr, scope?, detailed?)` | `expr: string` | Rationalize expression |
| `resolve(expr, scope?)` | `expr` | Substitute scope values into expression |

---

## Constants

| Constant | Value | Description |
|---|---|---|
| `pi` | 3.14159... | π |
| `e` | 2.71828... | Euler's number |
| `Infinity` | ∞ | Positive infinity |
| `NaN` | NaN | Not a Number |
| `i` | Complex unit | √(-1) |
| `phi` | 1.61803... | Golden ratio |
| `tau` | 6.28318... | 2π |
| `null` | null | Null value |
| `true` | true | Boolean true |
| `false` | false | Boolean false |

---

## Utility Functions

| Function | Parameters | Description |
|---|---|---|
| `clone(x)` | `x` | Deep clone |
| `format(x, options?)` | `x, options?` | Format value as string |
| `print(template, values, options?)` | `template: string, values` | String interpolation |
| `isInteger(x)` | `x: number` | TRUE if integer |
| `isNaN(x)` | `x: number` | TRUE if NaN |
| `isNegative(x)` | `x: number` | TRUE if negative |
| `isNumeric(x)` | `x` | TRUE if numeric type |
| `isPositive(x)` | `x: number` | TRUE if positive |
| `isPrime(x)` | `x: integer` | TRUE if prime |
| `isZero(x)` | `x` | TRUE if zero |
| `sign(x)` | `x: number` | Sign: -1, 0, or 1 |
| `random(size?, min?, max?)` | `size?: number\|Array, min?, max?` | Random number(s) |
| `randomInt(size?, min?, max?)` | `size?, min?, max?: integer` | Random integer(s) |
| `pickRandom(array, number?, weights?)` | `array: Array` | Pick random element(s) |

---

## Common Expression Patterns

```
// Basic math
round(3.14159 * {{$context.data.radius}} ^ 2, 2)

// Percentage
round({{$context.data.completed}} / {{$context.data.total}} * 100, 1)

// Clamp value between min/max
min(max({{$context.data.score}}, 0), 100)

// Absolute difference
abs({{$context.data.actual}} - {{$context.data.expected}})

// Statistical from array (if variable is an array)
mean({{$jobsMapByNodeKey.queryNode.rows}})

// Unit conversion (in expression string)
"{{$context.data.distance}} km to m"
```
