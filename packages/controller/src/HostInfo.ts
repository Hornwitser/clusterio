import { Type, Static } from "@sinclair/typebox";
import { HostDetails } from "@clusterio/lib";

/**
 * Info about a host known to the controller.
 */
export default class HostInfo {
	constructor(
		/** Id of this host */
		public id: number,
		/** Version this host last connected with */
		public name: string,
		/** Version this host last connected with */
		public version: string,
		/** Plugins this host last connected with */
		public plugins: Map<string, string>,
		/** True if this host is currently connected to controller */
		public connected: boolean = false,
		public kernel: string = "",
		public machine: string = "",
		public cpuModel: string = "",
		public hostname: string = "",
		/** Version of Node.js this host runs on */
		public node: string = "",
		/** Value of host.public_address configured for this host */
		public publicAddress: string = "",
		/** Unix timestamp in seconds host token must be issued after to be valid */
		public tokenValidAfter: number = 0,
		/** Millisecond Unix timestamp this entry was last updated at */
		public updatedAt: number = 0,
		/** True if this host has been deleted */
		public isDeleted: boolean = false,
	) { }

	static jsonSchema = Type.Object({
		"id": Type.Number(),
		"name": Type.String(),
		"version": Type.String(),
		"plugins": Type.Record(Type.String(), Type.String()),
		"connected": Type.Boolean(),
		"kernel": Type.String(),
		"machine": Type.String(),
		"cpu_model": Type.String(),
		"hostname": Type.String(),
		"node": Type.String(),
		"public_address": Type.String(),
		"token_valid_after": Type.Number(),
		"updated_at": Type.Number(),
		"is_deleted": Type.Boolean(),
	});

	static fromJSON(json: Static<typeof this.jsonSchema>) {
		return new this(
			json.id,
			json.name,
			json.version,
			new Map(Object.entries(json.plugins)),
			json.connected,
			json.kernel,
			json.machine,
			json.cpu_model,
			json.hostname,
			json.node,
			json.public_address,
			json.token_valid_after,
			json.updated_at,
			json.is_deleted,
		);
	}

	toJSON(): Static<typeof HostInfo.jsonSchema> {
		return {
			id: this.id,
			name: this.name,
			version: this.version,
			plugins: Object.fromEntries(this.plugins),
			connected: this.connected,
			kernel: this.kernel,
			machine: this.machine,
			cpu_model: this.cpuModel,
			hostname: this.hostname,
			node: this.node,
			public_address: this.publicAddress,
			token_valid_after: this.tokenValidAfter,
			updated_at: this.updatedAt,
			is_deleted: this.isDeleted,
		};
	}

	toHostDetails() {
		return new HostDetails(
			this.version,
			this.name,
			this.id,
			this.connected,
			this.kernel,
			this.machine,
			this.cpuModel,
			this.hostname,
			this.node,
			this.publicAddress,
			this.tokenValidAfter,
			this.updatedAt,
			this.isDeleted,
		);
	}
}

