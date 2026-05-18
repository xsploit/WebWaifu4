# OpenAI Responses WebSocket State Contract

This repo uses OpenAI Responses as the main chat provider. WebSocket mode is the
preferred live overlay transport, and POML remains the prompt/context renderer.

## Source Docs

Local markdown snapshots are stored in `docs/openai-source/`:

- `websocket-mode.md`
- `conversation-state.md`
- `responses-create.md`

Canonical sources:

- https://developers.openai.com/api/docs/guides/websocket-mode
- https://developers.openai.com/api/docs/guides/conversation-state
- https://developers.openai.com/api/reference/resources/responses/methods/create

## Locked Rules

- Do not silently switch a user-selected state mode or transport mode.
- Do not change TTS while fixing OpenAI provider routing unless the task names TTS.
- WebSocket mode should keep a persistent `/v1/responses` socket instead of
  opening and closing a socket for every reply.
- Only one `response.create` may be in flight on a WebSocket connection.
- In conversation mode, keep using the Conversations API `conversation` id and
  send the newest turn after the initial seed.
- In previous-response mode, continue with `previous_response_id` and only new
  input items.
- If WebSocket continuation fails because state is unavailable, report that
  exact upstream error. Do not hide it as an empty response.
- POML renders persona, memory, Twitch/local turn context, tools, TTS guidance,
  and animation policy before the provider sends the Responses payload.

## Implementation Notes

The provider must distinguish these pieces:

- `transport`: HTTP stream or WebSocket delivery.
- `stateMode`: stateless, previous-response, or conversation.
- `stateKey`: persona/channel/source scope inside the app.
- `conversation`: OpenAI Conversations API object id.
- `previous_response_id`: Responses chain id.

The UI may show both transport and state. That does not mean they are the same
thing. For example, `transport=websocket` and `stateMode=conversation` means the
request is sent over WebSocket while using a Conversations API id for state.

## Debugging Empty Responses

An empty response is never enough evidence to change transport/state policy.
First capture the terminal Responses event or final payload and check:

- Did the provider parse all valid text shapes?
- Did OpenAI return `response.failed`, `error`, or `response.incomplete`?
- Did a tool-only round fail to produce a final text response?
- Did max output tokens end the response before visible text?
- Did the socket close, timeout, or reconnect mid-turn?

Only patch the proven cause.
