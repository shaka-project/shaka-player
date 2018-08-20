# Style and Practices

## Readability

General rule, if someone in the team doesn't understand it, someone in the
community won't either.

If someone asks a question, don't just leave a comment in the review. Make a
change in the code (e.g. add a comment, change a variable name, move a logical
structure) to improve the readability of the code.

Some guidelines to avoid non-readable patterns are to:

### Avoid Function Apply

Using the `apply` functionality of any function
(e.g.`Array.prototype.push.appy`) has been deemed non-readable.


## Non-Functional Changes

Isolated changes that enhance readability - and not just based on preference -
are encouraged.

Wide-spread practices should be proposed to the Shaka Player team as it's own
issue and someone from the team will discuss it with you and say on whether they
are accepted and executed.

## Practices

### Static vs Member

A function should only be static when it doesn't modify the class's state.
Modifying the class's state is defined as using the same references under "this"
in the same way for each call.

Example

Member Function

```
X = class {
  doSomething() {
    // a lot of math
    // …
    result = ...
    this.fast.doSomething(result);
  }
};
```

Static Function

```
X = class {
  doSomethingFast() {
    X.doSomething(this.fast);
  }
  doSomethingSlow() {
    X.doSomething(this.slow);
  }
  static doSomething(target) {
    // a lot of math
    // …
    result = ...
    target.doSomething(result);
  }
};
```

### Function Declaration

__Definitions__

-   "Arrow-Function" means using the `() => {}` syntax in ES6.

-   "Function-Function" means using the `function() {}` syntax.

While using the pre-ES6 syntax for classes, all functions defined on the class
(member or static) should use Function-Functions.

Arrow-Functions should be used within other functions unless there is an
explicit need to control the this-scope of the function, for example:

-   All polyfills need to use Function-Functions as they require controlling
    `this`.

-   All functions expecting to be called with "new" must use Function-Functions
    as they need a new `this`.

### Const and Let

We use two forms of assignment: `const` and `let`:

-   `const x = y` means that `x` is to be assigned the value of `y` and may not
    be reassigned later. However members of `x` may be changes (e.g. `x.z = 3`).

-   `let x = y` means that `x` is to be assigned the value of `y` and may be
    reassigned later.

Unless a variable need to support reassignment, it should use `const`. A
variable declared with `const` but never assigned will hold the value
"undefined".

### Async and Await

When working with promises, we recommended to use `async` and `await`. We find
they improve readability by making the code more linear than `then` and `catch`
blocks.

Any function that is labeled as `async` will allow you to use `await`. A
function that is labeled as `async` looks like:

 - `const f = async function () { ... };`

- `const f = async () => { };`

- `class X { async f() { ... } }`

Using `await` will stop execution of the current function and wait for the
"awaited" promise to resolve before continuing execution, for example:

```
  await sleep(5);
```

`await` will also allow you to store the result of a promise while not changing
scope, for example:

```
  const response = await networkingEngine.request(...);
```

### Shadowing Parameters

Shadowing a parameter is defined as "reassigning the value of a parameter passed
to a function while within the function".

This is allowed only when normalizing the value, for example:

-   `x = x || defaultValue`

-   `x = x.toLowerCase()`

### Array Traversal

Whatever means of traversing an array that supports readability is allowed,
however there are some recommendations:

-   Default to the "for-of" pattern
-   Use `forEach` if using other array functions (e.g. filter) at the same time
-   Avoiding using indexes unless the index is needed
-   Do not use "await" in a loop (not allowed by ESLint). Instead use
    |Promise.all|.

### Building Arrays

Whatever means of building an array that supports readability is allowed,
however some patterns for simple cases are encouraged:

#### Simple Transformation

__Before__

```
const audio = [];
variants.forEach((variant) => audio.push(variant.audio));
```

__After__

```
const audio = variants.map((variant) => variant.audio);
```
