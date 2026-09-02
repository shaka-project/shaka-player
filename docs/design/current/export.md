# Shaka Player Exports

## True exports

Shaka Player uses the Closure Compiler to compile the raw sources into a single
bundle.  In this compiled bundle, most symbols have been renamed to short,
internal-only names.

Symbols that the application needs to access must be exported.  Exporting is the
process of attaching these internal, renamed symbols to the exported namespace.
(An example of an exported namespace is `window`.  If you are using a module
loader like requirejs, the exported namespace is returned to from the loader.)

The compiler has a special annotation for this: `@export`.  Anything annotated
with `@export` will be exported by the compiler automatically.


## Exporting to the docs

We generate our documentation from the same annotations that we feed to the
compiler.  To make it clear in the generated docs what is exported, public, or
private, we added support for the `@export` annotation in jsdoc.

There are situations where we want something to show up in the exports section
of the docs, even though it can't be truly exported by the compiler.  For
example, event definitions are part of the interface to our library, so they
should show up in the exports section of the docs.  As far as the compiler is
concerned, though, these are just typedefs that don't actually exist in the
runtime environment.

For this scenario, we created a new annotation: `@exportDoc`.  This is ignored
by the compiler, but is consumed by our customized copy of jsdoc.


## Generating externs

The compiler has a concept of something called externs.  Externs are definitions
of things that come from the external runtime environment.  For example, the
compiler has built-in externs for most standard web APIs provided by the
browser.

If you are building something with the Closure Compiler and you want to import
another library, you must have externs for that library so that the compiler can
know what the APIs and types are for that library.

We have a build step that generates externs for Shaka Player itself.  This is
useful for importing Shaka Player into another Closure-based project.

There are some abstract interfaces and internal base classes in Shaka Player
that need to be in the generated externs, but should not be exported by the
compiler because they are not part of the library's public API.  For example,
`shaka.util.IDestroyable`, which is implemented by `shaka.Player`.

To make this work, we created another new annotation: `@exportInterface`.  This
annotation is used by the extern generator, but is ignored by the compiler.

In some cases, public member variables need to be preserved when they would
otherwise be renamed by the compiler. `@export` is not sufficient to keep the
names from being renamed and is only useful for static members or prototype
values. `@expose` used to be used for this but is now deprecated. The current
best practice is to write an externs file defining the properties that should
be preserved.


## Summary

 - `@export`: truly exported (attached to namespace) by the compiler
 - `@expose`: deprecated
 - `@exportDoc`: considered part of the exports in the docs
 - `@exportInterface`: considered part of the exports in generated externs
