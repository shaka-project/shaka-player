# Localization Design Principles

## Summary

This document goes over the core principle and design decisions that went into
the Shaka Player UI Localization system. The goal of this document is to allow
those looking at the system a way to understand the reasons behind its design
and implementation.

## Definitions

```
Term             | Definition                     | Example
-----------------|-------------------------------------------------------------
Locale           | See "Talking About Languages". | "en-CA"
                 |                                |
Phrase           | Any series of words that have  | -
                 | some meaning in some locale.   |
                 |                                |
Context          | A description of a phrase.     | "The title for a button that
                 |                                | stops video playback"
                 |                                |
Localized Phrase | A phrase in a specific locale  | "arret" (fr-CA)
                 | that maps to a context.        |
```

References:

 - [Talking About Languages] (talking-about-languages.md) : A detailed
   explanation of the terms and relationships used when talking about languages
   in the Shaka Player project.


## Core Principle

Find the "closest" localized phrase for a context and locale while respecting
consistency over accuracy.

The idea is that we should be able to give you something that will make sense
to you in the least jarring way possible. We'll go over the "least jarring way
possible" a bit more later, but for now let's look at a simple example to get
an idea of what the problem is:

 - The user wants a localized phrase for "the title for a button that stops
   video playback" in "en-US".
 - We don't have one in "en-US" but we have one in "en", "en-CA", "fr-CA".

Now let's bring in the jarring-problem. People often know more than one
language, so their preferences may include more than one language. Let's look a
slightly more accurate example to get an idea of what the problem is:

 - The user wants a localized phrase for "the title for a button that stops
   video playback" in "en-US" or "fr-CA".
 - We don't have one in "en-US" but we have one in "en", "en-CA", "fr-CA".

## Finishing The Closest Match

There are two levels of searches that we make when looking for the closest
localized phrase. There is the search within a specific locale and the search
between locales.

## Searching Within A Locale

When searching within a locale for a match, we group related locales into four
groups: self, parent, siblings, and children. Each group may have zero or more
locales in them. For example, if we had the locale "en-US" our groups could be:

 - Self: [ en-US ]
 - Parent: [ en ]
 - Siblings: [ en-CA, en-GB ]
 - Children: [ ]

and if we had the locale "en" our groups could be:

 - Self: [ en ]
 - Parent: [ ]
 - Siblings: [ ]
 - Children: [ en-CA, en-GB, en-US ]

When looking for a localized phrase, we go group-by-group in order of accuracy
(self, parent, siblings, children). When a localized phrase is found for the
given context, we stop searching and return that result.


```
Available locales:
   "en", "en-US", "en-GB", en-CA", "fr", "fr-CA"

Search order for "en":

| 1. self | -> | 2. parent | -> | 3. siblings | -> | 4. children |
-----------------------------------------------------------------
| a. en   |    |           |    |             |    | a. en-US    |
|         |    |           |    |             |    | b. en-GB    |
|         |    |           |    |             |    | c. en-CA    |
```

```
Available locales:
   "en", "en-US", "en-GB", en-CA", "fr", "fr-CA"

Search order for "en-US":

  | 1. self  | -> | 2. parent | -> | 3. siblings | -> | 4. children |
  -------------------------------------------------------------------
  | a. en-US |    | a. en     |    | a. en-GB    |    |             |
  |          |    |           |    | b. en-CA    |    |             |
```

## Searching Between Locales

When we have multiple locales (e.g. "en-US" or "fr-CA") we only move to a later
locale if no matches were found in the earlier locales. This is because no
matter how loosely we match, we prefer displaying everything in one language.
For example, suppose we returned the best matches across all locales. The user
could end-up seeing some English and some French. While it may be more accurate
case-by-case, it would be less desirable overall.

```
Available locales:
   "en", "en-US", "en-GB", en-CA", "fr", "fr-CA", "fr-FR", ...

Search Order for multiple preferences:

 | Preference 1 | -> | Preference 2 | -> ... ->  | Preference N |
 | (en-US)      |    | (fr-CA)      |            | (...)        |
 ----------------------------------------------------------------
 | a. en-US     |    | a. fr-CA     |            | ...          |
 | b. en        |    | b. fr        |            |              |
 | c. en-GB     |    | c. fr-FR     |            |              |
 | d. en-CA     |    |              |            |              |
```

## Prioritize for Look-up

There are two key operations for our localization system: insertion and look-up.
Since we assume that insertions will happen far less often than look-ups, we
decided that our system must prioritize the efficiency of look-ups.

To achieve the simplest look-up possible, we take all the localization tables
that we would end-up searching and flatten them into a single map. We do this
once before any requests are made, so that each request is a table look-up
rather than multiple table look-ups. When we merge the tables, we go in
reverse-preference order. This allows the more preferred entries to override
the lesser preferred values.

```
    Preference Order : en-US > en > en-GB > en-CA
    Merge Order      : en-CA > en-GB > en > en-US

    Merged : [ A4 ] [ B1 ] [ C2 ] [ D1 ] [ E2 ] [ F3 ] [ G1 ]
               ^      ^      ^      ^      ^      ^      ^
    en-US  :   ^    [ B1 ]   ^    [ D1 ]   ^      ^    [ G1 ]
    en     :   ^    [ B2 ] [ C2 ] [ D2 ] [ E2 ]   ^    [ G2 ]
    en-GB  :   ^    [ B3 ] [ C3 ] [ D3 ] [ E3 ] [ F3 ] [ G3 ]
    en-CA  : [ A4 ] [ B4 ]        [ D4 ] [ E4 ]        [ G4 ]
    ...
```
