export interface ShellCommandMap {
  'shell.revealPath': {
    payload: string;
    result: void;
  };
}

export interface ShellQueryMap {
  'shell.getRuntimeInfo': {
    payload: undefined;
    result: Record<string, string>;
  };
}
