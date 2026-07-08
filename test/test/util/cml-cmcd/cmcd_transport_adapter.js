/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdRequestDeliver');
goog.provide('cml.cmcd.CmcdTransportAdapter');


/**
 * Callback the recorder supplies to a transport. Returns a Response to
 * short-circuit; returns undefined to forward to the underlying transport.
 *
 * @typedef {function(!Object<string, *>): (!Response|undefined)}
 */
cml.cmcd.CmcdRequestDeliver;


/**
 * Pluggable transport-interception contract.
 *
 * @typedef {{
 *   attach: function(!cml.cmcd.CmcdRequestDeliver): function():void
 * }}
 */
cml.cmcd.CmcdTransportAdapter;
