"use strict";
const assert = require("assert").strict;
const zlib = require("zlib");

const lib = require("@clusterio/lib");
const { ModPack } = lib;


describe("lib/data/ModPack", function() {
	describe("class ModPack", function() {
		it("should round trip serialize", function() {
			const validate = lib.compile(ModPack.jsonSchema);
			function check(pack) {
				const json = JSON.parse(JSON.stringify(pack));
				if (!validate(json)) {
					throw validate.errors;
				}
				assert.deepEqual(ModPack.fromJSON(json), pack);
				const packStringed = ModPack.fromModPackString(pack.toModPackString());
				packStringed.id = pack.id;
				packStringed.exportManifest = pack.exportManifest;
				assert.deepEqual(packStringed, pack);
			}

			check(ModPack.fromJSON({}));
			check(ModPack.fromJSON({ name: "MyPack" }));
			check(ModPack.fromJSON({ description: "My Description" }));
			check(ModPack.fromJSON({ factorio_version: "2.0" }));
			check(ModPack.fromJSON({ mods: [
				{ name: "subspace_storage", enabled: true, version: "1.99.8" },
				{ name: "clusterio_lib", enabled: true, version: "0.1.2", sha1: "012345abcd" },
			]}));
			check(ModPack.fromJSON({ settings: {
				"startup": {
					"bool-setting": { "value": true },
				},
				"runtime-global": {
					"number-setting": { "value": 123 },
				},
				"runtime-per-user": {
					"string-setting": { "value": "a string" },
					"color-setting": { "value": { "r": 1, "g": 1, "b": 0, "a": 1 } },
				},
			}}));
			check(ModPack.fromJSON({ export_manifest: { assets: { setting: "settings.json" }}}));
			check(ModPack.fromJSON({ deleted: true }));
			check(ModPack.fromJSON({
				name: "Super pack",
				description: "Every option at once.",
				factorio_version: "2.0",
				mods: [
					{ name: "subspace_storage", enabled: true, version: "1.99.8" },
					{ name: "clusterio_lib", enabled: true, version: "0.1.2", sha1: "012345abcd" },
				],
				settings: {
					"startup": {
						"bool-setting": { "value": true },
					},
					"runtime-global": {
						"number-setting": { "value": 123 },
					},
					"runtime-per-user": {
						"string-setting": { "value": "a string" },
						"color-setting": { "value": { "r": 1, "g": 1, "b": 0, "a": 1 } },
					},
				},
				export_manifest: { assets: { setting: "settings.json" }},
				deleted: true,
			}));
		});

		it("should sort integer factorio versions lexicographically", function() {
			let unsortedVersions = ["1.0", "1.1.0", "0.1", "3.0.0", "1.2", "0.3.1", "0.3.3", "2.1.1", "0.0.1"];
			let sortedVersions = ["0.0.1", "0.1", "0.3.1", "0.3.3", "1.0", "1.1.0", "1.2", "2.1.1", "3.0.0"];
			let factorioMods = unsortedVersions.map(v => ModPack.fromJSON({ factorio_version: v }));
			factorioMods.sort((a, b) => a.integerFactorioVersion - b.integerFactorioVersion);
			assert.deepEqual(factorioMods.map(mod => mod.factorioVersion), sortedVersions);
		});

		describe(".fillDefaultSettings()", function() {
			const prototypes = {
				"bool-setting": {
					"bool": {
						name: "bool",
						type: "bool-setting",
						setting_type: "startup",
						default_value: true,
					},
				},
				"double-setting": {
					"number": {
						name: "number",
						type: "double-setting",
						setting_type: "runtime-global",
						default_value: 123,
					},
				},
				"string-setting": {
					"string": {
						name: "string",
						type: "string-setting",
						setting_type: "runtime-per-user",
						default_value: "a string",
					},
				},
				"color-setting": {
					"color": {
						name: "color",
						type: "color-setting",
						setting_type: "runtime-per-user",
						default_value: { "r": 1, "g": 1, "b": 1, "a": 1 },
					},
				},
			};
			const mockLogger = { warn: () => {} };
			it("should fill in defaults for settings", function() {
				const pack = ModPack.fromJSON({});
				pack.fillDefaultSettings(prototypes, mockLogger);
				assert.deepEqual(pack.toJSON().settings, {
					"startup": {
						"bool": { "value": true },
					},
					"runtime-global": {
						"number": { "value": 123 },
					},
					"runtime-per-user": {
						"string": { "value": "a string" },
						"color": { "value": { "r": 1, "g": 1, "b": 1, "a": 1 } },
					},
				});
			});
			it("should not overwrite existing values", function() {
				const pack = ModPack.fromJSON({ settings: {
					"startup": {
						"bool": { "value": false },
					},
					"runtime-global": {
						"number": { "value": 2 },
					},
					"runtime-per-user": {
						"string": { "value": "spam" },
						"color": { "value": { "r": 0, "g": 0.5, "b": 1, "a": 1 } },
					},
				}});
				pack.fillDefaultSettings(prototypes, mockLogger);
				assert.deepEqual(pack.toJSON().settings, {
					"startup": {
						"bool": { "value": false },
					},
					"runtime-global": {
						"number": { "value": 2 },
					},
					"runtime-per-user": {
						"string": { "value": "spam" },
						"color": { "value": { "r": 0, "g": 0.5, "b": 1, "a": 1 } },
					},
				});
			});
			it("should ignore unknown setting_type and missing default_value", function() {
				const pack = ModPack.fromJSON({});
				pack.fillDefaultSettings({
					"string-setting": {
						"foo": {
							name: "foo",
							type: "string-setting",
							setting_type: "magic-that-does-not-exist",
							default_value: "a string",
						},
						"bar": {
							name: "bar",
							type: "string-setting",
							setting_type: "startup",
						},
					},
				}, mockLogger);
				assert.deepEqual(pack.toJSON().settings, {
					"startup": {},
					"runtime-global": {},
					"runtime-per-user": {},
				});
			});
		});

		describe(".fromModPackString()", function() {
			it("should handle malformed strings", function() {
				assert.throws(
					() => ModPack.fromModPackString("AMalformedString"),
					new Error("Malformed mod pack string: zlib inflate failed")
				);
				let badJsonMsg;
				try {
					JSON.parse("Not Json");
				} catch (err) {
					badJsonMsg = err.message;
				}
				assert.throws(
					// eslint-disable-next-line node/no-sync
					() => ModPack.fromModPackString(Buffer.from(zlib.deflateSync("Not Json")).toString("base64")),
					new Error(`Malformed mod pack string: ${badJsonMsg}`)
				);
				assert.throws(
					// eslint-disable-next-line node/no-sync
					() => ModPack.fromModPackString(Buffer.from(zlib.deflateSync('{"i":1}')).toString("base64")),
					new Error("Malformed mod pack string: Schema validation failed")
				);
			});
		});

		describe("toModSettingsDat()", function() {
			it("should properly serialise settings", function() {
				const pack = ModPack.fromJSON({ settings: {
					"startup": {
						"bool-setting": { "value": true },
					},
					"runtime-global": {
						"number-setting": { "value": 123 },
					},
					"runtime-per-user": {
						"string-setting": { "value": "a string" },
						"color-setting": { "value": { "r": 1, "g": 0.5, "b": 0, "a": 1 } },
					},
				}});

				function istr(str) {
					return [
						Uint8Array.from([0, str.length]),
						Buffer.from(str),
					];
				}
				/* eslint-disable indent */
				assert.deepEqual(
					pack.toModSettingsDat(),
					Buffer.concat([
						new Uint8Array(Uint16Array.from([1, 1, 0, 0]).buffer), // version
						Uint8Array.from([0]), // reserved

						Uint8Array.from([5, 0]), // dictionary
						new Uint8Array(Uint32Array.from([3]).buffer), // items

							...istr("startup"), // name
							Uint8Array.from([5, 0]), // dictionary
							new Uint8Array(Uint32Array.from([1]).buffer), // items

								...istr("bool-setting"), // name
								Uint8Array.from([5, 0]), // dictinary
								new Uint8Array(Uint32Array.from([1]).buffer), // items

									...istr("value"), // name
									Uint8Array.from([1, 0, 1]), // boolean

							...istr("runtime-global"), // name
							Uint8Array.from([5, 0]), // dictionary
							new Uint8Array(Uint32Array.from([1]).buffer), // items

								...istr("number-setting"), // name
								Uint8Array.from([5, 0]), // dictinary
								new Uint8Array(Uint32Array.from([1]).buffer), // items

									...istr("value"), // name
									Uint8Array.from([2, 0]), // number
									new Uint8Array(Float64Array.from([123]).buffer),

							...istr("runtime-per-user"), // name
							Uint8Array.from([5, 0]), // dictionary
							new Uint8Array(Uint32Array.from([2]).buffer), // items

								...istr("string-setting"), // name
								Uint8Array.from([5, 0]), // dictinary
								new Uint8Array(Uint32Array.from([1]).buffer), // items

									...istr("value"), // name
									Uint8Array.from([3, 0, 0, "a string".length]), // string
									Buffer.from("a string"),

								...istr("color-setting"), // name
								Uint8Array.from([5, 0]), // dictinary
								new Uint8Array(Uint32Array.from([1]).buffer), // items

									...istr("value"), // name
									Uint8Array.from([5, 0]), // dictinary
									new Uint8Array(Uint32Array.from([4]).buffer), // items

										...istr("r"), // name
										Uint8Array.from([2, 0]), // number
										new Uint8Array(Float64Array.from([1]).buffer),

										...istr("g"), // name
										Uint8Array.from([2, 0]), // number
										new Uint8Array(Float64Array.from([0.5]).buffer),

										...istr("b"), // name
										Uint8Array.from([2, 0]), // number
										new Uint8Array(Float64Array.from([0]).buffer),

										...istr("a"), // name
										Uint8Array.from([2, 0]), // number
										new Uint8Array(Float64Array.from([1]).buffer),
					])
				);
				/* eslint-enable indent */
			});
		});
	});
});
