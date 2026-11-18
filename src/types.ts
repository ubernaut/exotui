// Copyright 2023 Im-Beast. MIT license.

/** Type for Standard Output – where data gets written */
export type Stdout = import("./runtime/host_types.ts").RuntimeStdout;

/** Type for Standard Input - from where data is read */
export type Stdin = import("./runtime/host_types.ts").RuntimeStdin;

/** Type defining terminal's (console) available size measured in columns and rows */
export type ConsoleSize = import("./runtime/host_types.ts").RuntimeConsoleSize;

/** Type that describes offset */
export interface Offset {
  columns: number;
  rows: number;
}

/** Type that describes empty edge around Rectangle */
export interface Margin {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Type that describes position and size */
export interface Rectangle {
  column: number;
  row: number;
  width: number;
  height: number;
}

/** Generates number types that range from {From} to {To}  */
export type Range<From extends number, To extends number> = number extends From ? number
  : _Range<From, To, []>;
type _Range<From extends number, To extends number, R extends unknown[]> = R["length"] extends To ? To
  :
    | (R["length"] extends Range<0, From> ? From : R["length"])
    | _Range<From, To, [To, ...R]>;

/** Partial that makes all properties optional, even those within other object properties */
export type DeepPartial<Object, OmitKeys extends keyof Object = never> =
  & {
    [key in Exclude<keyof Object, OmitKeys>]?: Object[key] extends object
      // deno-lint-ignore ban-types
      ? Object[key] extends Function ? Object[key] : DeepPartial<Object[key]>
      : Object[key];
  }
  & {
    [key in OmitKeys]: DeepPartial<Object[key]>;
  };
