import { Event } from 'event-target-shim';

export const createDOMEvent = (type: string) => new Event(type, { bubbles: true });
