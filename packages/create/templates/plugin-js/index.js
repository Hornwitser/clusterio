"use strict";
const lib = require("@clusterio/lib");
const Messages = require("./messages");

lib.definePermission({
	name: "__plugin_name__.example.permission.event",
	title: "Example permission event",
	description: "My plugin's example permission that I forgot to remove",
});

lib.definePermission({
	name: "__plugin_name__.example.permission.request",
	title: "Example permission request",
	description: "My plugin's example permission that I forgot to remove",
});
//%if controller & web // Subscribing requires web content and the controller

lib.definePermission({
	name: "__plugin_name__.example.permission.subscribe",
	title: "Example permission subscribe",
	description: "My plugin's example permission that I forgot to remove",
});
//%endif
//%if web

lib.definePermission({
	name: "__plugin_name__.page.view",
	title: "Example page view permission",
	description: "My plugin's example page permission that I forgot to remove",
});
//%endif

const plugin = {
	name: "// plugin_name //",
	title: "// plugin_name //",
	description: "I didn't update my description",
//%if controller

	controllerEntrypoint: "./dist/node/controller",
	controllerConfigFields: {
		"__plugin_name__.myControllerField": {
			title: "My Controller Field",
			description: "This should be removed",
			type: "string",
			initialValue: "Remove Me",
		},
	},
//%endif
//%if host

	hostEntrypoint: "./dist/node/host",
	hostConfigFields: {
		"__plugin_name__.myHostField": {
			title: "My Host Field",
			description: "This should be removed",
			type: "string",
			initialValue: "Remove Me",
		},
	},
//%endif
//%if instance

	instanceEntrypoint: "./dist/node/instance",
	instanceConfigFields: {
		"__plugin_name__.myInstanceField": {
			title: "My Instance Field",
			description: "This should be removed",
			type: "string",
			initialValue: "Remove Me",
		},
	},
//%endif
//%if ctl

	ctlEntrypoint: "./dist/node/ctl",
	controlConfigFields: {
		"__plugin_name__.myControlField": {
			title: "My Control Field",
			description: "This should be removed",
			type: "string",
			initialValue: "Remove Me",
		},
	},
//%endif

	messages: [
		Messages.PluginExampleEvent,
		Messages.PluginExampleRequest,
//%if controller & web // Subscribing requires web content and the controller
		Messages.ExampleSubscribableUpdate,
//%endif
	],
//%if controller | web // The controller always includes web entry even if there is no content

	webEntrypoint: "./web",
	routes: [],
//%endif
};

module.exports = {
	plugin,
};
