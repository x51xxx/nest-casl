export type { Subject, InferSubjects } from '@casl/ability';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClass<ReturnType = any> = new (...args: any[]) => ReturnType;

export type AnyObject = Record<PropertyKey, unknown>;
