import { Type, Static } from "@sinclair/typebox";
import { Link, Event, EventClass, RequestHandler, WebSocketClientConnector, WebSocketBaseConnector } from "./link";
import { logger } from "./logging";
import { Address, MessageRequest, IControllerUser } from "./data";

export type SubscriptionRequestHandler<T> = RequestHandler<SubscriptionRequest, Event<T> | null>;
export type EventSubscriberCallback<T> = (updates: T[], synced: boolean) => void

/**
 * A subscription request sent by a subscriber, this updates what events the subscriber will be sent
 * The permission for this request copies the permission from the event being subscribed to
 * subscribe: false will unsubscribe the subscriber from all notifications
 */
export class SubscriptionRequest {
	declare ["constructor"]: typeof SubscriptionRequest;
	static type = "request" as const;
	static src = ["control", "instance"] as const;
	static dst = "controller" as const;
	static permission(user: IControllerUser, message: MessageRequest) {
		if (typeof message.data === "object" && message.data !== null) {
			const data = message.data as Static<typeof SubscriptionRequest.jsonSchema>;
			const entry = Link._eventsByName.get(data[0]);
			if (entry && entry.Event.permission) {
				if (typeof entry.Event.permission === "string") {
					user.checkPermission(entry.Event.permission);
				} else {
					entry.Event.permission(user, message);
				}
			}
		}
	}

	constructor(
		public eventName: string,
		public subscribe: boolean,
		public lastRequestTimeMs: number = 0,
	) {
		if (!Link._eventsByName.has(eventName)) {
			throw new Error(`Unregistered Event class ${eventName}`);
		}
	}

	static jsonSchema = Type.Tuple([
		Type.String(),
		Type.Boolean(),
		Type.Number(),
	]);

	toJSON() {
		return [this.eventName, this.subscribe, this.lastRequestTimeMs];
	}

	static fromJSON(json: Static<typeof SubscriptionRequest.jsonSchema>): SubscriptionRequest {
		return new this(...json);
	}
}

type EventData = {
	subscriptionUpdate?: SubscriptionRequestHandler<unknown>,
	subscriptions: Set<Link>,
};

/**
 * A class component to handle incoming subscription requests and offers a method to broadcast events to subscribers
 * After creation, no other handler can be registered for SubscriptionRequest on the controller
 */
export class SubscriptionController {
	_events = new Map<string, EventData>();

	/**
	 * Allow clients to subscribe to an event by telling the subscription controller to accept them
	 * Has an optional subscription update handler which is called when a client subscribes
	 * @param Event - Event class which is sent out as updates.
	 * @param subscriptionUpdate -
	 *     Optional handler called when a client subscribes.
	 */
	handle<T>(Event: EventClass<T>, subscriptionUpdate?: SubscriptionRequestHandler<T>) {
		const entry = Link._eventsByClass.get(Event);
		if (!entry) {
			throw new Error(`Unregistered Event class ${Event.name}`);
		}
		if (this._events.has(entry.name)) {
			throw new Error(`Event ${entry.name} is already registered`);
		}
		this._events.set(entry.name, {
			subscriptionUpdate: subscriptionUpdate,
			subscriptions: new Set(),
		});
	}

	/**
	 * Broadcast an event to all subscribers of that event
	 * @param event - Event to broadcast.
	 */
	broadcast<T>(event: Event<T>) {
		const entry = Link._eventsByClass.get(event.constructor);
		if (!entry) {
			throw new Error(`Unregistered Event class ${event.constructor.name}`);
		}
		const eventData = this._events.get(entry.name);
		if (!eventData) {
			throw new Error(`Event ${entry.name} is not a registered as subscribable`);
		}
		for (let link of eventData.subscriptions) {
			if ((link.connector as WebSocketBaseConnector).closing) {
				eventData.subscriptions.delete(link);
			} else {
				link.send(event);
			}
		}
	}

	/**
	 * Unsubscribe from all events of a given link.
	 * Used when a link is closed to stop all active subscriptions.
	 * @param link - Link to stop sending events to.
	 */
	unsubscribe(link: Link) {
		for (let eventData of this._events.values()) {
			eventData.subscriptions.delete(link);
		}
	}

	/**
	 * Handle incoming subscription requests on a link
	 * @param link - Link message was received on
	 * @param event - incomming event.
	 * @param src - Source address of incomming request.
	 * @param dst - destination address of incomming request.
	 */
	async handleRequest(link: Link, event: SubscriptionRequest, src: Address, dst: Address) {
		if (!Link._eventsByName.has(event.eventName)) {
			throw new Error(`Event ${event.eventName} is not a registered event`);
		}
		const eventData = this._events.get(event.eventName);
		if (!eventData) {
			throw new Error(`Event ${event.eventName} is not a registered as subscribable`);
		}
		if (event.subscribe === false) {
			eventData.subscriptions.delete(link);
		} else {
			eventData.subscriptions.add(link);
			if (eventData.subscriptionUpdate) {
				const eventReplay = await eventData.subscriptionUpdate(event, src, dst);
				if (eventReplay) {
					link.send(eventReplay);
				}
			}
		}
	}
}

export interface SubscribableValue {
	id: number | string,
	updatedAtMs: number,
	isDeleted: boolean,
}

export interface EventSubscribable<T, V extends SubscribableValue> extends Event<T> {
	updates: V[],
}

/**
 * Component for subscribing to and tracking updates of a remote resource
 * Multiple handlers can be subscribed at the same time
 */
export class EventSubscriber<
	T extends EventSubscribable<T, V>,
	K extends string | number = T["updates"][number]["id"],
	V extends SubscribableValue = T["updates"][number],
> {
	_callbacks = new Array<EventSubscriberCallback<V>>();
	/** Values of the subscribed resource */
	values = new Map<K, V>();
	/** True if this subscriber is currently synced with the source */
	synced = false;
	_snapshot?: readonly [ReadonlyMap<K, Readonly<V>>, boolean];
	_snapshotLastUpdatedMs = 0;
	lastResponseTimeMs = -1;

	constructor(
		private Event: EventClass<T>,
		public control: Link,
	) {
		control.handle(Event, this._handle.bind(this));
		control.connector.on("connect", () => {
			this._updateSubscription();
		});
		control.connector.on("close", () => {
			if (this.synced) {
				this.synced = false;
				for (let callback of this._callbacks) {
					callback([], this.synced);
				}
			}
		});
	}

	/**
	 * Handle incoming events and distribute it to the correct callbacks
	 * @param event - event from subscribed resource
	 * @internal
	 */
	async _handle(event: EventSubscribable<T, V>) {
		for (const value of event.updates) {
			this.lastResponseTimeMs = Math.max(this.lastResponseTimeMs, value.updatedAtMs);
			if (value.isDeleted) {
				this.values.delete(value.id as K);
			} else {
				this.values.set(value.id as K, value);
			}
		}
		for (let callback of this._callbacks) {
			callback(event.updates, this.synced);
		}
	}

	/**
	 * Subscribe to receive all event notifications
	 * @param handler -
	 *     callback invoked whenever the subscribed resource changes or the
	 *     synced property changes, in which case the updates will be empty.
	 * @returns function that will unsubscribe from notifications
	 */
	subscribe(handler: EventSubscriberCallback<V>) {
		this._callbacks.push(handler);
		if (this._callbacks.length === 1) {
			this._updateSubscription();
		}
		return () => {
			// During a page transition the components currently rendered
			// are unmounted and then the components for the new page is
			// mounted.  This means that if a resource is used by both pages
			// it is first unsubscribed by the unmounted component causing
			// the callbacks count to go to zero and a subscription update
			// to be sent, and then subscribed by the mounted component
			// causing another subscription update to be sent.

			// By delaying the unsubscription here the subscription happens
			// before the unsubscription, thus preventing the redundant
			// updates from being sent out.
			setImmediate(() => {
				let index = this._callbacks.lastIndexOf(handler);
				if (index === -1) {
					return;
				}
				this._callbacks.splice(index, 1);
				if (this._callbacks.length === 0) {
					this._updateSubscription();
				}
			});
		};
	}

	/**
	 * Obtain a snapshot of the current state of the tracked resource
	 * @returns tuple of values map snapshot and synced property.
	 */
	getSnapshot() {
		if (this._snapshotLastUpdatedMs !== this.lastResponseTimeMs) {
			this._snapshotLastUpdatedMs = this.lastResponseTimeMs;
			this._snapshot = [new Map(this.values), this.synced];
		}
		return this._snapshot!;
	}

	/**
	 * Update the subscription with the controller based on current handler counts
	 */
	async _updateSubscription() {
		if (!(this.control.connector as WebSocketClientConnector).connected) {
			return;
		}
		const entry = Link._eventsByClass.get(this.Event)!;

		try {
			await this.control.send(new SubscriptionRequest(
				entry.name,
				this._callbacks.length > 0,
				this.lastResponseTimeMs
			));
			this.synced = this._callbacks.length > 0;
			this._snapshotLastUpdatedMs = 0;
			for (let callback of this._callbacks) {
				callback([], this.synced);
			}
		} catch (err: any) {
			logger.error(
				`Unexpected error updating ${entry.name} subscription:\n${err.stack}`
			);
		}
	}
}
