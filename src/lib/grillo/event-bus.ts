import { EventEmitter } from "node:events";
import type { Envelope, MessageType } from "./envelope";

export type EnvelopeHandler<T = Record<string, unknown>> = (
  envelope: Envelope<T>,
) => void;

export type EnvelopeValidator = (envelope: Envelope) => boolean;

export interface EventBus {
  emit(envelope: Envelope): void;
  on<T = Record<string, unknown>>(
    messageType: MessageType,
    handler: EnvelopeHandler<T>,
  ): void;
  off<T = Record<string, unknown>>(
    messageType: MessageType,
    handler: EnvelopeHandler<T>,
  ): void;
}

export interface EventBusOptions {
  validateEnvelope?: EnvelopeValidator;
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const emitter = new EventEmitter();

  return {
    emit(envelope: Envelope): void {
      if (options.validateEnvelope && !options.validateEnvelope(envelope)) {
        console.error(
          "[event-bus] envelope validation failed",
          envelope.message_type,
          envelope.trace_id,
        );
        return;
      }
      emitter.emit(envelope.message_type, envelope);
    },

    on<T = Record<string, unknown>>(
      messageType: MessageType,
      handler: EnvelopeHandler<T>,
    ): void {
      emitter.on(messageType, handler as (...args: unknown[]) => void);
    },

    off<T = Record<string, unknown>>(
      messageType: MessageType,
      handler: EnvelopeHandler<T>,
    ): void {
      emitter.off(messageType, handler as (...args: unknown[]) => void);
    },
  };
}
