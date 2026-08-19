export function extensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

export function sendMessage(message: object, onResponse?: (res: unknown) => void): void {
  if (!extensionAlive()) return;
  try {
    chrome.runtime.sendMessage(message, (res) => {
      try {
        void chrome.runtime.lastError;
        if (!extensionAlive()) return;
        onResponse?.(res);
      } catch {
        /* stale content script */
      }
    });
  } catch {
    /* extension was reloaded; this content script is stale */
  }
}

export function onRuntimeMessage(
  handler: (message: { type?: string } & Record<string, unknown>) => void,
): void {
  if (!extensionAlive()) return;
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!extensionAlive()) return;
      handler(message as { type?: string } & Record<string, unknown>);
    });
  } catch {
    /* stale content script */
  }
}
