// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('./polyfill');

const Q = require('q');
Q.longStackSupport = true;
const readline = require('readline');

const Almond = require('../lib/almond');
const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;

const Mock = require('./mock');

var buffer = '';
function writeLine(line) {
    console.log(line);
    buffer += line + '\n';
}
function flushBuffer() {
    buffer = '';
}

var app = null;
function loadOneApp(code) {
    app = code;
}

class TestDelegate {
    constructor() {
    }

    send(what) {
        writeLine('>> ' + what);
        // die horribly if something does not work
        if (what.indexOf('that did not work') >= 0)
            setImmediate(() => process.exit(1));
    }

    sendPicture(url) {
        writeLine('>> picture: ' + url);
    }

    sendRDL(rdl) {
        writeLine('>> rdl: ' + rdl.displayTitle + ' ' + rdl.callback);
    }

    sendChoice(idx, what, title, text) {
        writeLine('>> choice ' + idx + ': ' + title);
    }

    sendLink(title, url) {
        writeLine('>> link: ' + title + ' ' + url);
    }

    sendButton(title, json) {
        writeLine('>> button: ' + title + ' ' + json);
    }

    sendAskSpecial(what) {
        writeLine('>> ask special ' + what);
    }
}

class MockUser {
    constructor() {
        this.id = 1;
        this.account = 'FOO';
        this.name = 'Alice Tester';
    }
}

// TEST_CASES is a list of scripts
// each script is a sequence of inputs and ouputs
// inputs are JSON objects in sempre syntax, outputs are buffered responses
// the last element of each script is the ThingTalk code that should be
// generated as a result of the script (or null if the script should not
// generate ThingTalk)

const TEST_CASES = [
    [{ special: "help" },
`>> Click on one of the following buttons to start adding command.
>> ask special generic
>> choice 0: When
>> choice 1: Get
>> choice 2: Do
`,
    null],

    [{"rule":{"query":{"args":[],"name":{"id":"tt:xkcd.get_comic"}},"action":{"args":[],"name":{"id":"tt:twitter.post_picture"}}}},
`>> You have multiple devices of type twitter. Which one do you want to use?
>> ask special generic
>> choice 0: Twitter Account foo
>> choice 1: Twitter Account bar
`,
    {"answer":{"type":"Choice","value":0}},
`>> What do you want to tweet?
>> ask special generic
>> choice 0: Use the title from xkcd
>> choice 1: Use the picture url from xkcd
>> choice 2: Use the link from xkcd
>> choice 3: A description of the result
>> choice 4: None of above
`,
    {"answer":{"type":"Choice","value":2}},
`>> Upload the picture now.
>> ask special generic
>> choice 0: Use the picture url from xkcd
>> choice 1: None of above
`,
    {"answer":{"type":"Choice","value":0}},
`>> Ok, so you want me to get an Xkcd comic then tweet link with an attached picture and picture url is picture url. Is that right?
>> ask special yesno
`,
    { special: "yes" },
`>> Consider it done.
>> ask special null
`,
`AlmondGenerated() {
    now => @(type="xkcd",id="xkcd-6").get_comic() , v_number := number, v_title := title, v_picture_url := picture_url, v_link := link => @(type="twitter",id="twitter-foo").post_picture(caption=v_link, picture_url=v_picture_url) ;
}`],

    [{ action: { name: { id: 'tt:twitter.sink' }, args: [] } },
`>> You have multiple devices of type twitter. Which one do you want to use?
>> ask special generic
>> choice 0: Twitter Account foo
>> choice 1: Twitter Account bar
`,
     { answer: { type: 'Choice', value: 0 } },
`>> What do you want to tweet?
>> ask special generic
`,
     { answer: { type: 'String', value: { value: 'lol' } } },
`>> Ok, so you want me to tweet "lol". Is that right?
>> ask special yesno
`,
     { special: "yes" },
`>> Consider it done.
>> ask special null
`,
`AlmondGenerated() {
    now => @(type="twitter",id="twitter-foo").sink(status="lol") ;
}`],

    [{ rule: {
        trigger: { name: { id: 'tt:twitter.source' }, args: [] },
        action: { name: { id: 'tt:facebook.post' }, args: [
            { name: { id: 'tt:param.status'}, operator: 'is',
              type: 'VarRef', value: { id: 'tt:param.text' } }
        ]}
    } },
`>> You have multiple devices of type twitter. Which one do you want to use?
>> ask special generic
>> choice 0: Twitter Account foo
>> choice 1: Twitter Account bar
`,
    { answer: { type: 'Choice', value: 0 } },
`>> Ok, so you want me to post text on Facebook when anyone you follow tweets. Is that right?
>> ask special yesno
`,
    { special: "yes" },
`>> Consider it done.
>> ask special null
`,
`AlmondGenerated() {
    @(type="twitter",id="twitter-foo").source() , v_text := text, v_hashtags := hashtags, v_urls := urls, v_from := from, v_in_reply_to := in_reply_to => @(type="facebook",id="facebook-7").post(status=v_text) ;
}`],

    [{ query: { name: { id: 'tt:xkcd.get_comic' }, args: [] } },
`>> ask special null
`,
`AlmondGenerated() {
    now => @(type="xkcd",id="xkcd-8").get_comic() , v_number := number, v_title := title, v_picture_url := picture_url, v_link := link => notify;
}`],

    [{ query: { name: { id: 'tt:xkcd.get_comic' }, person: 'mom', args: [] } },
`>> Ok, so you want me to get an Xkcd comic using Almond of Mom Corp Inc.. Is that right?
>> ask special yesno
`,
    { special: "yes" },
`>> Sending rule to Mom Corp Inc.: get an Xkcd comic then send it to me
>> Consider it done.
>> ask special null
`,
`AlmondGenerated() {
    @remote.receive(__principal="mock-account:MOCK1234-phone:+1800666"^^tt:contact("Mom Corp Inc."), __token="XXX"^^tt:flow_token, __kindChannel="query:xkcd:get_comic"^^tt:function) , v_number := number, v_title := title, v_picture_url := picture_url, v_link := link => notify;
}`],

    [{"rule":{"trigger":{"args":[],"name":{"id":"tt:security-camera.new_event"}},"action":{"args":[],"name":{"id":"tt:twitter.post_picture"}}}},
`>> You have multiple devices of type security-camera. Which one do you want to use?
>> ask special generic
>> choice 0: Some Device 1
>> choice 1: Some Device 2
`,
    { answer: { type: 'Choice', value: 0 } },
`>> You have multiple devices of type twitter. Which one do you want to use?
>> ask special generic
>> choice 0: Twitter Account foo
>> choice 1: Twitter Account bar
`,
    { answer: { type: 'Choice', value: 0 } },
`>> What do you want to tweet?
>> ask special generic
>> choice 0: Use the picture url from security-camera
>> choice 1: A description of the result
>> choice 2: None of above
`,
    { answer: { type: 'Choice', value: 2 } },
`>> What do you want to tweet?
>> ask special generic
`,
    { answer: { type: 'String', value: { value: 'lol' } } },
`>> Upload the picture now.
>> ask special generic
>> choice 0: Use the picture url from security-camera
>> choice 1: None of above
`,
    { answer: { type: 'Choice', value: 0 } },
`>> Ok, so you want me to tweet "lol" with an attached picture and picture url is picture url when any event is detected on your security camera. Is that right?
>> ask special yesno
`,
    { special: "yes" },
`>> Consider it done.
>> ask special null
`,
`AlmondGenerated() {
    @(type="security-camera",id="security-camera-1").new_event() , v_start_time := start_time, v_has_sound := has_sound, v_has_motion := has_motion, v_has_person := has_person, v_picture_url := picture_url => @(type="twitter",id="twitter-foo").post_picture(caption="lol", picture_url=v_picture_url) ;
}`],

    [{"special":{"id":"tt:root.special.makerule"}},
`>> Click on one of the following buttons to start adding command.
>> ask special generic
>> choice 0: When
>> choice 1: Get
>> choice 2: Do
`,
    { answer: { type: 'Choice', value: 0 } },
`>> ask special command
>> Pick one from the following categories or simply type in.
>> button: Do it now {"special":"tt:root.special.empty"}
>> button: Media {"command":{"type":"help","value":{"id":"tt:type.media"}}}
>> button: Social Networks {"command":{"type":"help","value":{"id":"tt:type.social-network"}}}
>> button: Home {"command":{"type":"help","value":{"id":"tt:type.home"}}}
>> button: Communication {"command":{"type":"help","value":{"id":"tt:type.communication"}}}
>> button: Health and Fitness {"command":{"type":"help","value":{"id":"tt:type.health"}}}
>> button: Services {"command":{"type":"help","value":{"id":"tt:type.service"}}}
>> button: Data Management {"command":{"type":"help","value":{"id":"tt:type.data-management"}}}
>> button: Back {"special":"tt:root.special.back"}
`,
    {"trigger":{"args":[],"name":{"id":"tt:security-camera.new_event"}}},
`>> Add more commands and filters or run your command if you are ready.
>> ask special generic
>> choice 0: When: new event on security camera
>> choice 1: Get
>> choice 2: Do
>> choice 3: Add a filter
>> choice 4: Run it
`,
    { answer: { type: 'Choice', value: 1 } },
`>> ask special command
>> Pick one from the following categories or simply type in.
>> button: Media {"command":{"type":"help","value":{"id":"tt:type.media"}}}
>> button: Social Networks {"command":{"type":"help","value":{"id":"tt:type.social-network"}}}
>> button: Home {"command":{"type":"help","value":{"id":"tt:type.home"}}}
>> button: Communication {"command":{"type":"help","value":{"id":"tt:type.communication"}}}
>> button: Health and Fitness {"command":{"type":"help","value":{"id":"tt:type.health"}}}
>> button: Services {"command":{"type":"help","value":{"id":"tt:type.service"}}}
>> button: Data Management {"command":{"type":"help","value":{"id":"tt:type.data-management"}}}
>> button: Back {"special":"tt:root.special.back"}
`,
    {"query":{"args":[],"name":{"id":"tt:xkcd.get_comic"}}},
`>> Add more commands and filters or run your command if you are ready.
>> ask special generic
>> choice 0: When: new event on security camera
>> choice 1: Get: comic on xkcd
>> choice 2: Do
>> choice 3: Add a filter
>> choice 4: Run it
`,
    { answer: { type: 'Choice', value: 3 } },
`>> Pick the command you want to add filters to:
>> ask special generic
>> choice 0: When: new event on security camera
>> choice 1: Get: comic on xkcd
>> choice 2: Back
`,
    { answer: { type: 'Choice', value: 1 } },
`>> Pick the filter you want to add:
>> ask special command
>> button: number is ____ {"filter":{"type":"Number","operator":"is","name":"number","value":null}}
>> button: number < ____ {"filter":{"type":"Number","operator":"<","name":"number","value":null}}
>> button: number > ____ {"filter":{"type":"Number","operator":">","name":"number","value":null}}
>> button: title is ____ {"filter":{"type":"String","operator":"is","name":"title","value":null}}
>> button: title contains ____ {"filter":{"type":"String","operator":"contains","name":"title","value":null}}
>> button: Back {"special":"tt:root.special.back"}
`,
    {"filter":{"type":"String","operator":"contains","name":"title","value":null}},
`>> What's the value of this filter?
>> ask special generic
`,
    "lol",
`>> Add more commands and filters or run your command if you are ready.
>> ask special generic
>> choice 0: When: new event on security camera
>> choice 1: Get: comic on xkcd, title contains lol
>> choice 2: Do
>> choice 3: Add a filter
>> choice 4: Run it
`,
    null] // we can't run it because make dialog uses setImmediate to process a new json, which breaks the script runner
];

function roundtrip(input, output) {
    flushBuffer();
    if (typeof input === 'string') {
        console.log('$ ' + input);
        return almond.handleCommand(input).then(() => {
            if (output !== null && buffer !== output)
                throw new Error('Invalid reply from Almond: ' + buffer);
        });
    } else {
        var json = JSON.stringify(input);
        console.log('$ \\r ' + json);
        return almond.handleParsedCommand(json).then(() => {
            if (output !== null && buffer !== output)
                throw new Error('Invalid reply from Almond: ' + buffer);
        });
    }
}

function cleanToken(code) {
    if (code === null)
        return null;
    return code.replace(/__token="[a-f0-9]+"/g, '__token="XXX"');
}

function test(i) {
    console.error('Test Case #' + (i+1));

    flushBuffer();
    app = null;
    var script = TEST_CASES[i];

    function step(j) {
        if (j === script.length-1)
            return Q();

        return roundtrip(script[j], script[j+1]).then(() => step(j+2));
    }
    return roundtrip({"special":"nevermind"}, null).then(() => step(0)).then(() => {
        var expected = script[script.length-1];
        app = cleanToken(app);
        expected = cleanToken(expected);
        if (app !== expected) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expected);
            console.error('Generated: ' + app);
        } else {
            console.error('Test Case #' + (i+1) + ' passed');
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}

var almond;

function main() {
    var engine = Mock.createMockEngine();
    // mock out getDeviceSetup
    engine.thingpedia.getDeviceSetup = (kinds) => {
        var ret = {};
        for (var k of kinds) {
            ret[k] = {type:'none',kind:k};
        }
        return Q(ret);
    }
    // intercept loadOneApp
    engine.apps.loadOneApp = loadOneApp;

    var delegate = new TestDelegate();

    var sempreUrl;
    if (process.argv[2] !== undefined && process.argv[2].startsWith('--with-sempre='))
        sempreUrl = process.argv[2].substr('--with-sempre='.length);
    almond = new Almond(engine, 'test', new MockUser(), delegate,
        { debug: false, sempreUrl: sempreUrl, showWelcome: true });

    almond.start();
    flushBuffer();

    loop(0).done();
}
main();