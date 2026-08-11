import { event, method } from "./types.js";
import type {
  EventArgs,
  EventName,
  InferContract,
  MethodArgs,
  MethodName,
  MethodReturn,
} from "./types.js";

// Compile-time-only checks for the contract index helpers. Included by
// tsconfig.json, unlike *.test.ts, so `npm run typecheck` enforces the
// negative assertions below.

const config = {
  hubs: {
    "/hubs/chat": {
      events: {
        OnFoo: event<[x: number]>(),
        OnUser: event<[user: { id: string }]>(),
      },
      methods: {
        GetCount: method<[filter: string], number>(),
        Join: method<[room: string, silent: boolean]>(),
      },
    },
  },
} as const;

type T = InferContract<(typeof config)["hubs"]>;
type Chat = "/hubs/chat";

// --- InferContract: the declared hub is a key, an undeclared one is not. ---
const hub: Chat extends keyof T ? true : false = true;
void hub;
// @ts-expect-error - /hubs/nope was never declared in the config
type _BadHub = EventName<T, "/hubs/nope">;

// --- EventName / MethodName ---
const eventName: EventName<T, Chat> = "OnFoo";
void eventName;
// @ts-expect-error - OnBaz was never declared via event()
const badEventName: EventName<T, Chat> = "OnBaz";
void badEventName;

const methodName: MethodName<T, Chat> = "GetCount";
void methodName;
// @ts-expect-error - GetBaz was never declared via method()
const badMethodName: MethodName<T, Chat> = "GetBaz";
void badMethodName;

// --- EventArgs ---
const fooArgs: EventArgs<T, Chat, "OnFoo"> = [1];
void fooArgs;
// @ts-expect-error - OnFoo takes a number, not a string
const badFooArgs: EventArgs<T, Chat, "OnFoo"> = ["one"];
void badFooArgs;
// @ts-expect-error - OnFoo takes exactly one argument
const tooManyFooArgs: EventArgs<T, Chat, "OnFoo"> = [1, 2];
void tooManyFooArgs;

const userArgs: EventArgs<T, Chat, "OnUser"> = [{ id: "a" }];
void userArgs;
// @ts-expect-error - user.id is a string, not a number
const badUserArgs: EventArgs<T, Chat, "OnUser"> = [{ id: 1 }];
void badUserArgs;

// --- MethodArgs ---
const joinArgs: MethodArgs<T, Chat, "Join"> = ["room-1", true];
void joinArgs;
// @ts-expect-error - Join takes (string, boolean), not (string, string)
const badJoinArgs: MethodArgs<T, Chat, "Join"> = ["room-1", "yes"];
void badJoinArgs;
// @ts-expect-error - Join takes exactly two arguments
const tooFewJoinArgs: MethodArgs<T, Chat, "Join"> = ["room-1"];
void tooFewJoinArgs;

// @ts-expect-error - GetBaz was never declared with method()
const unknownMethodArgs: MethodArgs<T, Chat, "GetBaz"> = ["anything"];
void unknownMethodArgs;

// A method that is not a function type must fail closed. MethodArgs resolves
// to never, so no argument list can satisfy it.
type Malformed = { "/h": { events: {}; methods: { Bad: string } } };
// @ts-expect-error - Bad is not a function, so MethodArgs is never
const malformedArgs: MethodArgs<Malformed, "/h", "Bad"> = ["anything"];
void malformedArgs;

// --- MethodReturn ---
const count: MethodReturn<T, Chat, "GetCount"> = 1;
void count;
// @ts-expect-error - GetCount returns number, not string
const badCount: MethodReturn<T, Chat, "GetCount"> = "one";
void badCount;

// method<[room: string, silent: boolean]>() defaults its return to void.
const joinReturn: MethodReturn<T, Chat, "Join"> = undefined;
void joinReturn;
