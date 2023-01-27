/**
 * @license
 * JSDoc is free software, licensed under the Apache License, Version 2.0 (the
 * "License"). Commercial and non-commercial use are permitted in compliance
 * with the License.
 *
 * Copyright (c) 2011-present Michael Mathews <micmath@gmail.com> and the
 * [contributors to JSDoc](https://github.com/jsdoc/jsdoc/graphs/contributors).
 * All rights reserved.
 *
 * You may obtain a copy of the License at:
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * @fileoverview The publication code for the JSDoc template.
 *
 * Forked by Shaka Player team from the default template in JSDoc.
 */

const catharsis = require('catharsis');
const doop = require('jsdoc/util/doop');
const env = require('jsdoc/env');
const fs = require('jsdoc/fs');
const helper = require('jsdoc/util/templateHelper');
const inline = require('jsdoc/tag/inline');
const logger = require('jsdoc/util/logger');
const path = require('jsdoc/path');
const taffy = require('taffydb').taffy;
const template = require('jsdoc/template');

const htmlsafe = helper.htmlsafe;
const linkto = helper.linkto;
const resolveAuthorLinks = helper.resolveAuthorLinks;
const hasOwnProp = Object.prototype.hasOwnProperty;

const FONT_NAMES = [
    'OpenSans-Bold',
    'OpenSans-BoldItalic',
    'OpenSans-Italic',
    'OpenSans-Light',
    'OpenSans-LightItalic',
    'OpenSans-Regular'
];
const PRETTIFIER_CSS_FILES = [
    'tomorrow.min.css'
];
const PRETTIFIER_SCRIPT_FILES = [
    'lang-css.js',
    'prettify.js'
];

let data;
let view;

let outdir = path.normalize(env.opts.destination);

let docletMap;

function customResolveLinks(html) {
    console.assert(!!docletMap, 'No doclet map!');

    // Do the standard link resolution first.
    html = helper.resolveLinks(html);

    // Now do our custom link resolution.
    const customReplacers = {
        linksource: (string, tagInfo) => {
            const longname = tagInfo.text;
            const doclet = docletMap[longname];
            if (!doclet) {
                logger.fatal('Unknown linksource target: %s', longname);
                return '';
            }

            const link = linkto(
                /* destination */ doclet.meta.shortpath,
                /* link text */ longname,
                /* css class */ null,
                /* fragment */ 'line' + doclet.meta.lineno);
            return string.replace(tagInfo.completeTag, link);
        },
    };

    return inline.replaceInlineTags(html, customReplacers).newString;
}

function find(spec) {
    return helper.find(data, spec);
}

function tutoriallink(tutorial) {
    return helper.toTutorial(tutorial, null, {
        tag: 'em',
        classname: 'disabled',
        prefix: 'Tutorial: '
    });
}

function getAncestorLinks(doclet) {
    return helper.getAncestorLinks(data, doclet);
}

function hashToLink(doclet, hash) {
    let url;

    if ( !/^(#.+)/.test(hash) ) {
        return hash;
    }

    url = helper.createLink(doclet);
    url = url.replace(/(#.+|$)/, hash);

    return `<a href="${url}">${hash}</a>`;
}

function needsSignature({kind, type, meta}) {
    let needsSig = false;

    // function and class definitions always get a signature
    if (kind === 'function' || kind === 'class') {
        needsSig = true;
    }
    // typedefs that contain functions get a signature, too
    else if (kind === 'typedef' && type && type.names &&
        type.names.length) {
        for (let i = 0, l = type.names.length; i < l; i++) {
            if (type.names[i].toLowerCase() === 'function') {
                needsSig = true;
                break;
            }
        }
    }
    // and namespaces that are functions get a signature (but finding them is a
    // bit messy)
    else if (kind === 'namespace' && meta && meta.code &&
        meta.code.type && meta.code.type.match(/[Ff]unction/)) {
        needsSig = true;
    }

    return needsSig;
}

function getSignatureAttributes({optional, nullable}) {
    const attributes = [];

    if (optional) {
        attributes.push('opt');
    }

    if (nullable === true) {
        attributes.push('nullable');
    }
    else if (nullable === false) {
        attributes.push('non-null');
    }

    return attributes;
}

function updateItemName(item) {
    const attributes = getSignatureAttributes(item);
    let itemName = item.name || '';

    if (item.variable) {
        itemName = `&hellip;${itemName}`;
    }

    if (attributes && attributes.length) {
        itemName = `${itemName}<span class="signature-attributes">${attributes.join(', ')}</span>`;
    }

    return itemName;
}

function addParamAttributes(params) {
    return params.filter(({name}) => name && !name.includes('.')).map(updateItemName);
}

function buildItemTypeStrings(item) {
    const types = [];

    if (item && item.type && item.type.names) {
        item.type.names.forEach(name => {
            types.push( linkto(name, htmlsafe(name)) );
        });
    }

    return types;
}

function buildAttribsString(attribs) {
    let attribsString = '';

    if (attribs && attribs.length) {
        htmlsafe(`(${attribs.join(', ')}) `);
    }

    return attribsString;
}

function addNonParamAttributes(items) {
    let types = [];

    items.forEach(item => {
        types = types.concat( buildItemTypeStrings(item) );
    });

    return types;
}

function addSignatureParams(f) {
    const params = f.params ? addParamAttributes(f.params) : [];

    f.signature = `${f.signature || ''}(${params.join(', ')})`;
}

function addSignatureReturns(f) {
    const attribs = [];
    let attribsString = '';
    let returnTypes = [];
    let returnTypesString = '';
    const source = f.yields || f.returns;

    // jam all the return-type attributes into an array. this could create odd results (for example,
    // if there are both nullable and non-nullable return types), but let's assume that most people
    // who use multiple @return tags aren't using Closure Compiler type annotations, and vice-versa.
    if (source) {
        source.forEach(item => {
            helper.getAttribs(item).forEach(attrib => {
                if (!attribs.includes(attrib)) {
                    attribs.push(attrib);
                }
            });
        });

        attribsString = buildAttribsString(attribs);
    }

    if (source) {
        returnTypes = addNonParamAttributes(source);
    }
    if (returnTypes.length) {
        returnTypesString = ` &rarr; ${attribsString}{${returnTypes.join('|')}}`;
    }

    f.signature = `<span class="signature">${f.signature || ''}</span>` +
        `<span class="type-signature">${returnTypesString}</span>`;
}

function addSignatureTypes(f) {
    const types = f.type ? buildItemTypeStrings(f) : [];

    f.signature = `${f.signature || ''}<span class="type-signature">` +
        `${types.length ? ` :${types.join('|')}` : ''}</span>`;
}

function addAttribs(f) {
    const attribs = helper.getAttribs(f);
    const attribsString = buildAttribsString(attribs);

    f.attribs = `<span class="type-signature">${attribsString}</span>`;
}

function shortenPaths(files, commonPrefix) {
    Object.keys(files).forEach(file => {
        files[file].shortened = files[file].resolved.replace(commonPrefix, '')
            // always use forward slashes
            .replace(/\\/g, '/');
    });

    return files;
}

function getPathFromDoclet({meta}) {
    if (!meta) {
        return null;
    }

    return meta.path && meta.path !== 'null' ?
        path.join(meta.path, meta.filename) :
        meta.filename;
}

function generate(title, docs, filename, resolveLinks) {
    let docData;
    let html;
    let outpath;

    resolveLinks = resolveLinks !== false;

    docData = {
        env: env,
        title: title,
        docs: docs
    };

    outpath = path.join(outdir, filename);
    html = view.render('container.tmpl', docData);

    if (resolveLinks) {
        html = customResolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>
    }

    fs.writeFileSync(outpath, html, 'utf8');
}

function generateSourceFiles(sourceFiles, encoding = 'utf8') {
    Object.keys(sourceFiles).forEach(file => {
        let source;
        // links are keyed to the shortened path in each doclet's `meta.shortpath` property
        const sourceOutfile = helper.getUniqueFilename(sourceFiles[file].shortened);

        helper.registerLink(sourceFiles[file].shortened, sourceOutfile);

        try {
            source = {
                kind: 'source',
                code: helper.htmlsafe( fs.readFileSync(sourceFiles[file].resolved, encoding) )
            };
        }
        catch (e) {
            logger.error('Error while generating source file %s: %s', file, e.message);
        }

        generate(`Source: ${sourceFiles[file].shortened}`, [source], sourceOutfile,
            false);
    });
}

/**
 * Look for classes or functions with the same name as modules (which indicates that the module
 * exports only that class or function), then attach the classes or functions to the `module`
 * property of the appropriate module doclets. The name of each class or function is also updated
 * for display purposes. This function mutates the original arrays.
 *
 * @private
 * @param {Array.<module:jsdoc/doclet.Doclet>} doclets - The array of classes and functions to
 * check.
 * @param {Array.<module:jsdoc/doclet.Doclet>} modules - The array of module doclets to search.
 */
function attachModuleSymbols(doclets, modules) {
    const symbols = {};

    // build a lookup table
    doclets.forEach(symbol => {
        symbols[symbol.longname] = symbols[symbol.longname] || [];
        symbols[symbol.longname].push(symbol);
    });

    modules.forEach(module => {
        if (symbols[module.longname]) {
            module.modules = symbols[module.longname]
                // Only show symbols that have a description. Make an exception for classes, because
                // we want to show the constructor-signature heading no matter what.
                .filter(({description, kind}) => description || kind === 'class')
                .map(symbol => {
                    symbol = doop(symbol);

                    if (symbol.kind === 'class' || symbol.kind === 'function') {
                        symbol.name = `${symbol.name.replace('module:', '(require("')}"))`;
                    }

                    return symbol;
                });
        }
    });
}

function buildMemberNav(items, itemHeading, itemsSeen, linktoFn) {
    let nav = '';

    if (items.length) {
        let itemsNav = '';

        items.forEach(item => {
            let displayName;

            let className = 'access-public';  // default
            if (item.access) {
                className = 'access-' + item.access;
            }

            // Tutorials should always be visible.
            if (item.kind == undefined && !!item.title) {
                className = '';
            }

            if ( !hasOwnProp.call(item, 'longname') ) {
                itemsNav += `<li class="${className}">${linktoFn('', item.name)}</li>`;
            }
            else if ( !hasOwnProp.call(itemsSeen, item.longname) ) {
                if (env.conf.templates.default.useLongnameInNav) {
                    displayName = item.longname;
                } else {
                    displayName = item.name;
                }
                itemsNav += `<li class="${className}">${linktoFn(item.longname, displayName.replace(/\b(module|event):/g, ''))}</li>`;

                itemsSeen[item.longname] = true;
            }
        });

        if (itemsNav !== '') {
            nav += `<h3>${itemHeading}</h3><ul>${itemsNav}</ul>`;
        }
    }

    return nav;
}

function linktoTutorial(longName, name) {
    return tutoriallink(name);
}

function linktoExternal(longName, name) {
    return linkto(longName, name.replace(/(^"|"$)/g, ''));
}

/**
 * Create the navigation sidebar.
 * @param {object} members The members that will be used to create the sidebar.
 * @param {array<object>} members.classes
 * @param {array<object>} members.externals
 * @param {array<object>} members.mixins
 * @param {array<object>} members.modules
 * @param {array<object>} members.namespaces
 * @param {array<object>} members.tutorials
 * @param {array<object>} members.events
 * @param {array<object>} members.interfaces
 * @return {string} The HTML for the navigation sidebar.
 */
function buildNav(members) {
    let nav = '<h2><a href="index.html">Home</a></h2>';
    const seen = {};
    const seenTutorials = {};

    const navSections = [
      [members.modules, 'Modules', {}, linkto],
      [members.externals, 'Externals', seen, linktoExternal],
      [members.namespaces, 'Namespaces', seen, linkto],
      [members.classes, 'Classes', seen, linkto],
      [members.enums, 'Enums', seen, linkto],
      [members.interfaces, 'Interfaces', seen, linkto],
      [members.events, 'Events', seen, linkto],
      [members.mixins, 'Mixins', seen, linkto],
      [members.tutorials, 'Tutorials', seenTutorials, linktoTutorial],
    ];

    let navOrder = env.conf.templates.default.navOrder;
    if (!navOrder) {
      // Default order: everything listed in navSections, in that order.
      navOrder = navSections.map(section => section[1]);
    }

    for (const name of navOrder) {
      const section = navSections.find(section => section[1] == name);
      if (section) {
        nav += buildMemberNav.apply(null, section);
      } else {
        logger.error('Section %s in navOrder is unrecognized!', name);
      }
    }

    return nav;
}

function fixUpType(type) {
    // Replace generic "function" and "record" types with their original types.
    // With this, we see, for example:
    //   "function(string):number" instead of just "function"
    //   "{{ foo: string, bar: number }}" instead of just "Object"
    const parsedType = type.parsedType || {};
    if (parsedType.type == 'FunctionType' || parsedType.type == 'RecordType') {
        const originalType = catharsis.stringify(parsedType);
        type.names = [originalType];
    }
}

/**
    @param {TAFFY} taffyData See <http://taffydb.com/>.
    @param {object} opts
    @param {Tutorial} tutorials
 */
exports.publish = (taffyData, opts, tutorials) => {
    let classes;
    let conf;
    let enums;
    let externals;
    let files;
    let fromDir;
    let indexUrl;
    let interfaces;
    let members;
    let mixins;
    let modules;
    let namespaces;
    let outputSourceFiles;
    let packageInfo;
    let packages;
    const sourceFilePaths = [];
    let sourceFiles = {};
    let staticFileFilter;
    let staticFilePaths;
    let staticFiles;
    let staticFileScanner;
    let templatePath;

    data = taffyData;

    conf = env.conf.templates || {};
    conf.default = conf.default || {};

    templatePath = path.normalize(opts.template);
    view = new template.Template( path.join(templatePath, 'tmpl') );

    // claim some special filenames in advance, so the All-Powerful Overseer of Filename Uniqueness
    // doesn't try to hand them out later
    indexUrl = helper.getUniqueFilename('index');
    // don't call registerLink() on this one! 'index' is also a valid longname

    // set up templating
    view.layout = conf.default.layoutFile ?
        path.getResourcePath(path.dirname(conf.default.layoutFile),
            path.basename(conf.default.layoutFile) ) :
        'layout.tmpl';

    // set up tutorials for helper
    helper.setTutorials(tutorials);

    data = helper.prune(data);
    data.sort('longname, version, since');
    helper.addEventListeners(data);

    data().each(doclet => {
        let sourcePath;

        doclet.attribs = '';

        if (doclet.examples) {
            doclet.examples = doclet.examples.map(example => {
                let caption;
                let code;

                if (example.match(/^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i)) {
                    caption = RegExp.$1;
                    code = RegExp.$3;
                }

                return {
                    caption: caption || '',
                    code: code || example
                };
            });
        }
        if (doclet.see) {
            doclet.see.forEach((seeItem, i) => {
                doclet.see[i] = hashToLink(doclet, seeItem);
            });
        }

        // build a list of source files
        if (doclet.meta) {
            sourcePath = getPathFromDoclet(doclet);
            sourceFiles[sourcePath] = {
                resolved: sourcePath,
                shortened: null
            };
            if (!sourceFilePaths.includes(sourcePath)) {
                sourceFilePaths.push(sourcePath);
            }
        }
    });

    // update outdir if necessary, then create outdir
    packageInfo = ( find({kind: 'package'}) || [] )[0];
    if (packageInfo && packageInfo.name) {
        outdir = path.join( outdir, packageInfo.name, (packageInfo.version || '') );
    }
    fs.mkPath(outdir);

    // copy the template's static files to outdir
    fromDir = path.join(templatePath, 'static');
    staticFiles = fs.ls(fromDir, 3);

    staticFiles.forEach(fileName => {
        const toDir = fs.toDir( fileName.replace(fromDir, outdir) );

        fs.mkPath(toDir);
        fs.copyFileSync(fileName, toDir);
    });

    // copy the fonts used by the template to outdir
    staticFiles = fs.ls(path.join(require.resolve('open-sans-fonts'), '..', 'open-sans'), 3);

    staticFiles.forEach(fileName => {
        const toDir = path.join(outdir, 'fonts');

        if (FONT_NAMES.includes(path.parse(fileName).name)) {
            fs.mkPath(toDir);
            fs.copyFileSync(fileName, toDir);
        }
    });

    // copy the prettify script to outdir
    PRETTIFIER_SCRIPT_FILES.forEach(fileName => {
        const toDir = path.join(outdir, 'scripts');

        fs.copyFileSync(
            path.join(require.resolve('code-prettify'), '..', fileName),
            toDir
        );
    });

    // copy the prettify CSS to outdir
    PRETTIFIER_CSS_FILES.forEach(fileName => {
        const toDir = path.join(outdir, 'styles');

        fs.copyFileSync(
            // `require.resolve()` has trouble with this package, so we use an extra-hacky way to
            // get the filepath.
            path.join(
                templatePath,
                '..',
                '..',
                'node_modules',
                'color-themes-for-google-code-prettify',
                'dist',
                'themes',
                fileName
            ),
            toDir
        );
    });

    // copy user-specified static files to outdir
    if (conf.default.staticFiles) {
        // The canonical property name is `include`. We accept `paths` for backwards compatibility
        // with a bug in JSDoc 3.2.x.
        staticFilePaths = conf.default.staticFiles.include ||
            conf.default.staticFiles.paths ||
            [];
        staticFileFilter = new (require('jsdoc/src/filter').Filter)(conf.default.staticFiles);
        staticFileScanner = new (require('jsdoc/src/scanner').Scanner)();

        staticFilePaths.forEach(filePath => {
            let extraStaticFiles;

            filePath = path.resolve(env.pwd, filePath);
            extraStaticFiles = staticFileScanner.scan([filePath], 10, staticFileFilter);

            extraStaticFiles.forEach(fileName => {
                const sourcePath = fs.toDir(filePath);
                const toDir = fs.toDir( fileName.replace(sourcePath, outdir) );

                fs.mkPath(toDir);
                fs.copyFileSync(fileName, toDir);
            });
        });
    }

    if (sourceFilePaths.length) {
        sourceFiles = shortenPaths( sourceFiles, path.commonPrefix(sourceFilePaths) );
    }
    data().each(doclet => {
        let docletPath;
        const url = helper.createLink(doclet);

        helper.registerLink(doclet.longname, url);

        // add a shortened version of the full path
        if (doclet.meta) {
            docletPath = getPathFromDoclet(doclet);
            docletPath = sourceFiles[docletPath].shortened;
            if (docletPath) {
                doclet.meta.shortpath = docletPath;
            }
        }
    });

    // Fix up types before signatures have been generated!
    data().each(doclet => {
        if (doclet.params) {
            for (const param of doclet.params) {
                fixUpType(param.type);
            }
        }
        if (doclet.returns) {
            for (const ret of doclet.returns) {
                fixUpType(ret.type);
            }
        }
        if (doclet.type) {
            fixUpType(doclet.type);
        }
    });

    data().each(doclet => {
        const url = helper.longnameToUrl[doclet.longname];

        if (url.includes('#')) {
            doclet.id = helper.longnameToUrl[doclet.longname].split(/#/).pop();
        }
        else {
            doclet.id = doclet.name;
        }

        if ( needsSignature(doclet) ) {
            addSignatureParams(doclet);
            addSignatureReturns(doclet);
            addAttribs(doclet);
        }
    });

    // do this after the urls have all been generated
    data().each(doclet => {
        doclet.ancestors = getAncestorLinks(doclet);

        if (doclet.kind === 'member') {
            addSignatureTypes(doclet);
            addAttribs(doclet);
        }

        if (doclet.kind === 'constant') {
            addSignatureTypes(doclet);
            addAttribs(doclet);
            doclet.kind = 'member';
        }
    });

    // Used later by customResolveLinks.
    docletMap = {};
    data().each(doclet => {
        docletMap[doclet.longname] = doclet;
    });

    members = helper.getMembers(data);
    members.enums = [];

    data().each(doclet => {
        if (doclet.isEnum) {
            const hasParent = !!docletMap[doclet.memberof];

            // Enums without parents (not attached to a class, but directly to a
            // namespace) aren't recognized by jsdoc by default and need to be
            // massaged into the docs separately.
            if (!hasParent) {
                // Temporarily call this a "class", so that we can fix the URL.
                doclet.kind = 'class';
                // Regenerate the URL, so that this enum gets its own page
                // instead of a URL that links to an ID within a non-existent
                // parent page.
                delete helper.longnameToUrl[doclet.longname];
                helper.createLink(doclet);
                // Mark this as an enum (custom type), so that it doesn't get
                // slotted with the classes.
                doclet.kind = 'enum';
                members.enums.push(doclet);
            }
        }
    });

    members.tutorials = tutorials.children;
    if (conf.default.sortTutorialsByConfigOrder) {
        members.tutorials.sort((a, b) => {
            if (a.autoindex !== undefined && b.autoindex !== undefined) {
                return a.autoindex - b.autoindex;
            } else if (a.autoindex !== undefined) {
                return -1;
            } else if (b.autoindex !== undefined) {
                return 1;
            }
        });
    }

    // output pretty-printed source files by default
    outputSourceFiles = conf.default && conf.default.outputSourceFiles !== false;

    // add template helpers
    view.find = find;
    view.linkto = linkto;
    view.resolveAuthorLinks = resolveAuthorLinks;
    view.tutoriallink = tutoriallink;
    view.htmlsafe = htmlsafe;
    view.outputSourceFiles = outputSourceFiles;

    // once for all
    view.nav = buildNav(members);
    attachModuleSymbols( find({ longname: {left: 'module:'} }), members.modules );

    // generate the pretty-printed source files first so other pages can link to them
    if (outputSourceFiles) {
        generateSourceFiles(sourceFiles, opts.encoding);
    }

    // index page displays information from package.json and lists files
    files = find({kind: 'file'});
    packages = find({kind: 'package'});

    generate('Home', [{
        kind: 'mainpage',
        readme: opts.readme,
        longname: (opts.mainpagetitle) ? opts.mainpagetitle : 'Main Page'
    }], indexUrl);

    // set up the lists that we'll use to generate pages
    classes = taffy(members.classes);
    enums = taffy(members.enums);
    modules = taffy(members.modules);
    namespaces = taffy(members.namespaces);
    mixins = taffy(members.mixins);
    externals = taffy(members.externals);
    interfaces = taffy(members.interfaces);

    Object.keys(helper.longnameToUrl).forEach(longname => {
        const myClasses = helper.find(classes, {longname: longname});
        const myEnums = helper.find(enums, {longname: longname});
        const myExternals = helper.find(externals, {longname: longname});
        const myInterfaces = helper.find(interfaces, {longname: longname});
        const myMixins = helper.find(mixins, {longname: longname});
        const myModules = helper.find(modules, {longname: longname});
        const myNamespaces = helper.find(namespaces, {longname: longname});

        if (myModules.length) {
            generate(`Module: ${myModules[0].longname}`, myModules, helper.longnameToUrl[longname]);
        }

        if (myClasses.length) {
            generate(`Class: ${myClasses[0].longname}`, myClasses, helper.longnameToUrl[longname]);
        }

        if (myEnums.length) {
            generate(`Enum: ${myEnums[0].longname}`, myEnums, helper.longnameToUrl[longname]);
        }

        if (myNamespaces.length) {
            generate(`Namespace: ${myNamespaces[0].longname}`, myNamespaces, helper.longnameToUrl[longname]);
        }

        if (myMixins.length) {
            generate(`Mixin: ${myMixins[0].longname}`, myMixins, helper.longnameToUrl[longname]);
        }

        if (myExternals.length) {
            generate(`External: ${myExternals[0].longname}`, myExternals, helper.longnameToUrl[longname]);
        }

        if (myInterfaces.length) {
            generate(`Interface: ${myInterfaces[0].longname}`, myInterfaces, helper.longnameToUrl[longname]);
        }
    });

    // TODO: move the tutorial functions to templateHelper.js
    function generateTutorial(title, tutorial, filename) {
        const tutorialData = {
            title: title,
            header: tutorial.title,
            content: tutorial.parse(),
            children: tutorial.children
        };
        const tutorialPath = path.join(outdir, filename);
        let html = view.render('tutorial.tmpl', tutorialData);

        // yes, you can use {@link} in tutorials too!
        html = customResolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>

        fs.writeFileSync(tutorialPath, html, 'utf8');
    }

    // tutorials can have only one parent so there is no risk for loops
    function saveChildren({children}) {
        children.forEach(child => {
            generateTutorial(`Tutorial: ${child.title}`, child, helper.tutorialToUrl(child.name));
            saveChildren(child);
        });
    }

    saveChildren(tutorials);
};
