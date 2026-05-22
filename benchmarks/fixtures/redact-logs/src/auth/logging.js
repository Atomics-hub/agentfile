export function formatAuthLog(event) {
  return JSON.stringify({
    type: event.type,
    userId: event.userId,
    refreshToken: event.refreshToken,
    accessToken: event.accessToken
  });
}

export function writeAuthLog(event, sink = console.log) {
  const line = formatAuthLog(event);
  sink(line);
  return line;
}

