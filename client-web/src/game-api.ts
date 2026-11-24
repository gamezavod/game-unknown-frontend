export class GameApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

export async function gameRequest<T>(path: string, body?: object, key?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: {
        ...(body && { "Content-Type": "application/json" }),
        ...(key && { "Idempotency-Key": key }),
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new GameApiError(0, "connection", true);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const code = typeof error?.code === "string" ? error.code : "api_error";
    throw new GameApiError(response.status, code, response.status >= 500 || response.status === 408 || response.status === 429);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new GameApiError(response.status, "connection", true);
  }
}

let openingSession: Promise<unknown> | undefined;

/** Карта и смены могут открыться одновременно: cookie гостя назначается одним запросом. */
export async function withGuestWorld<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (!(error instanceof GameApiError) || error.status !== 404) throw error;
    openingSession ??= gameRequest<unknown>("/game/session", {}).finally(() => {
      openingSession = undefined;
    });
    await openingSession;
    return load();
  }
}
