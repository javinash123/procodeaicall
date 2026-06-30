export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncFn<TArgs extends readonly unknown[], TReturn> = (...args: TArgs) => Promise<TReturn>;
export type Timestamp = number;
export type CallSid = string;
export type SessionId = string;
export type CampaignId = string;
export type UserId = string;
export type TraceId = string;

export interface Identifiable {
  readonly id: string;
}

export interface Timestamped {
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
